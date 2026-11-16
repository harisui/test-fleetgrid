-- 0042: Milestone 6, part 1. The Terms of Service archive and driver Terms acceptance.
--
-- terms_versions keeps the full text of every published version with its SHA-256, so every
-- acceptance points at the exact words accepted. Drivers accept at sign-up; when a version that
-- needs everyone's acceptance again is published, existing drivers accept through a one-time
-- link (driver_terms_links) or on their next sign-in, and their shift offers pause until they
-- do. Profiles, documents and status do not change.

-- ---------------------------------------------------------------------------
-- The append-only guard (0035), fixed: with no column names it raised "FOREACH expression must
-- not be null" on an update instead of refusing it (admin_audit_log had the same fault).
-- ---------------------------------------------------------------------------
create or replace function public.append_only_guard()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_column text;
begin
  if tg_op = 'DELETE' then
    raise exception '% is append-only: rows cannot be deleted', tg_table_name using errcode = '42501';
  end if;
  v_old := to_jsonb(old) - 'updated_at';
  v_new := to_jsonb(new) - 'updated_at';
  foreach v_column in array coalesce(tg_argv, '{}'::text[]) loop
    if v_new ->> v_column is null then
      v_old := v_old - v_column;
      v_new := v_new - v_column;
    end if;
  end loop;
  -- The Twilio SID of a text, once: it arrives after the row is written.
  if tg_table_name = 'sms_messages' and v_old ->> 'provider_sid' is null then
    v_old := v_old - 'provider_sid';
    v_new := v_new - 'provider_sid';
  end if;
  if v_old is distinct from v_new then
    raise exception '% is append-only: rows cannot be changed', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The archive
-- ---------------------------------------------------------------------------
create table public.terms_versions (
  version text primary key check (version ~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$'),
  title text not null check (length(title) between 1 and 120),
  effective_date date not null,
  body text not null check (length(body) between 1 and 200000),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  requires_reacceptance boolean not null default false,
  published_at timestamptz not null default clock_timestamp()
);

comment on table public.terms_versions is
  'Every published Terms of Service version, word for word (Milestone 6). Append-only.';

create trigger terms_versions_append_only
  before update or delete on public.terms_versions
  for each row execute function public.append_only_guard();

alter table public.terms_versions enable row level security;
-- The text is public: anyone may read any version.
create policy terms_versions_select_all on public.terms_versions for select using (true);
revoke insert, update, delete, truncate, references, trigger on public.terms_versions
  from anon, authenticated, service_role;
grant select on public.terms_versions to anon, authenticated, service_role;

-- Publishes a version, or confirms it is already published with exactly this text. A version's
-- text never changes: different text under a published version number is refused.
create function public.publish_terms_version(
  p_version text, p_title text, p_effective_date date, p_body text, p_requires_reacceptance boolean
)
returns setof public.terms_versions
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_existing public.terms_versions;
  v_hash text := encode(sha256(convert_to(p_body, 'UTF8')), 'hex');
begin
  select * into v_existing from public.terms_versions where version = p_version;
  if found then
    if v_existing.body_sha256 <> v_hash or v_existing.title <> p_title
       or v_existing.effective_date <> p_effective_date
       or v_existing.requires_reacceptance <> p_requires_reacceptance then
      raise exception 'Terms version % is already published with different text', p_version
        using errcode = '23505';
    end if;
    return next v_existing;
    return;
  end if;
  return query insert into public.terms_versions
    (version, title, effective_date, body, body_sha256, requires_reacceptance)
    values (p_version, p_title, p_effective_date, p_body, v_hash, p_requires_reacceptance)
    returning *;
end;
$$;

-- The newest version everyone must accept again, or null when there is none.
create function public.required_terms_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select version from public.terms_versions
  where requires_reacceptance
  order by published_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- The one-time links for existing drivers
-- ---------------------------------------------------------------------------
create table public.driver_terms_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  version text not null references public.terms_versions (version),
  -- Only the SHA-256 of the token is kept; the token itself is in the text alone.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  constraint driver_terms_links_expiry check (expires_at > created_at)
);

create index driver_terms_links_profile_idx on public.driver_terms_links (profile_id, created_at desc);

comment on table public.driver_terms_links is
  'One-time Terms acceptance links (Milestone 6). Opening one records nothing; accepting uses it up. Service role only.';

alter table public.driver_terms_links enable row level security;
-- No policies: signed-in users never read or write links. The service role issues and redeems them.
revoke all on public.driver_terms_links from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Acceptances: how, with which words, through which link, and only of archived text
-- ---------------------------------------------------------------------------
alter table public.tos_acceptances
  add column method text check (method in ('signup', 'gate', 'link', 'carrier')),
  add column statement text check (length(statement) <= 1000),
  -- The link used, by id only: a foreign key would meet the profile's own cascade on the same
  -- row when an account is deleted, and the acceptance must outlive both.
  add column terms_link_id uuid;

-- New acceptances must name an archived version. The rows from before the archive (carriers,
-- 2026-10-v1 and v2) are left unchecked: their text was not kept at the time.
alter table public.tos_acceptances
  add constraint tos_acceptances_version_fkey
  foreign key (version) references public.terms_versions (version) not valid;

-- Whether a person has accepted everything they must: true unless a version that needs everyone
-- again is published and they have accepted neither it nor a later one.
create function public.terms_ok(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with required as (
    select published_at from public.terms_versions
    where requires_reacceptance
    order by published_at desc
    limit 1
  )
  select not exists (
    select 1 from required r
    where not exists (
      select 1
      from public.tos_acceptances a
      join public.terms_versions v on v.version = a.version
      where a.profile_id = p_profile_id and v.published_at >= r.published_at
    )
  );
$$;

-- The same, for the signed-in user only (the driver pages ask before showing anything).
create function public.my_terms_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.terms_ok((select auth.uid()));
$$;

-- The drivers who still have to accept the version that needs everyone again (none when there
-- is no such version), with what the admin page and the link sender need. Blocked accounts are
-- left out. Service role only.
create function public.drivers_awaiting_terms()
returns table (
  profile_id uuid, driver_id uuid, full_name text, phone text,
  sms_opt_in boolean, sms_opted_out boolean, last_link_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, d.id, d.full_name, p.phone, d.sms_opt_in, d.sms_opted_out,
    (select max(l.created_at) from public.driver_terms_links l where l.profile_id = p.id)
  from public.profiles p
  join public.drivers d on d.profile_id = p.id
  where p.role = 'driver'
    and p.status <> 'blocked'
    and not public.terms_ok(p.id)
  order by d.full_name;
$$;

-- The signed-in user accepts a version (carriers on the Terms page, drivers at sign-up or on the
-- Terms page). Accepting the same version twice keeps the first record.
drop function public.record_tos_acceptance(text, text, text);
create function public.record_tos_acceptance(
  p_version text, p_ip text default null, p_user_agent text default null,
  p_method text default null, p_statement text default null
)
returns setof public.tos_acceptances
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_method = 'link' then
    raise exception 'A link acceptance goes through accept_terms_by_link' using errcode = '42501';
  end if;
  insert into public.tos_acceptances (profile_id, version, ip, user_agent, method, statement)
  values ((select auth.uid()), p_version, p_ip, p_user_agent, p_method, p_statement)
  on conflict (profile_id, version) do nothing;
  return query select * from public.tos_acceptances where profile_id = (select auth.uid()) and version = p_version;
end;
$$;

-- A driver accepts through a one-time link (service role: the page has no session). The link
-- must exist, be unused and unexpired; it is used up in the same transaction.
create function public.accept_terms_by_link(
  p_token_hash text, p_ip text default null, p_user_agent text default null, p_statement text default null
)
returns table (outcome text, profile_id uuid, version text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_link public.driver_terms_links;
begin
  select * into v_link from public.driver_terms_links where token_hash = p_token_hash for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::text;
    return;
  end if;
  if v_link.used_at is not null then
    return query select 'used'::text, v_link.profile_id, v_link.version;
    return;
  end if;
  if v_link.expires_at <= now() then
    return query select 'expired'::text, v_link.profile_id, v_link.version;
    return;
  end if;
  update public.driver_terms_links set used_at = now() where id = v_link.id;
  insert into public.tos_acceptances (profile_id, version, ip, user_agent, method, statement, terms_link_id)
  values (v_link.profile_id, v_link.version, p_ip, p_user_agent, 'link', p_statement, v_link.id)
  on conflict on constraint tos_acceptances_profile_version_unique do nothing;
  return query select 'accepted'::text, v_link.profile_id, v_link.version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shift offers pause until the driver has accepted (0033 and 0036, plus terms_ok)
-- ---------------------------------------------------------------------------
create or replace function public.matching_drivers(
  p_lat double precision,
  p_lng double precision,
  p_cdl_class public.cdl_class,
  p_endorsements public.endorsement[] default '{}',
  p_min_years integer default 0,
  p_equipment public.equipment_type[] default '{}',
  p_twic boolean default false,
  p_medical boolean default false,
  p_manual boolean default false,
  p_exclude uuid[] default '{}',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns table (driver_id uuid, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, p.phone
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and p.status = 'approved'
    and (d.roster_grace_until > now() or cardinality(public.shift_ready_missing(d.id)) = 0)
    and d.card_completed
    and d.sms_opt_in
    and not d.sms_opted_out
    and not d.shifts_paused
    and public.terms_ok(p.id)
    and d.lat is not null
    and d.lng is not null
    and d.cdl_class <= p_cdl_class
    and d.endorsements @> coalesce(p_endorsements, '{}')
    and coalesce(d.years_experience, 0) >= coalesce(p_min_years, 0)
    and d.equipment_types @> coalesce(p_equipment, '{}')
    and (not coalesce(p_twic, false) or public.twic_valid(d.twic_active, d.twic_expires_on,
      (coalesce(p_starts_at, now()) at time zone 'America/Chicago')::date))
    and (not coalesce(p_medical, false) or d.medical_card_active is true)
    and (not coalesce(p_manual, false) or d.transmission = 'manual_ok')
    and not (d.id = any (coalesce(p_exclude, '{}')))
    and public.is_in_service_area(d.lat::double precision, d.lng::double precision)
    and round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 1)
      <= d.service_radius_miles
    and (p_starts_at is null or p_ends_at is null or not exists (
      select 1 from public.shifts b
      where b.booked_driver_id = d.id and b.status = 'booked'
        and b.booked_range && tstzrange(p_starts_at - interval '45 minutes', p_ends_at + interval '45 minutes')
    ));
$$;

create or replace function public.claim_shift(p_driver_id uuid, p_code text)
returns table (outcome text, shift_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_recipient public.broadcast_recipients;
  v_shift public.shifts;
  v_booked uuid;
begin
  select r.* into v_recipient
  from public.broadcast_recipients r
  join public.shifts s on s.id = r.shift_id
  where r.driver_id = p_driver_id and r.code = p_code
  order by (s.status = 'open' and s.short_code = r.code) desc, r.created_at desc
  limit 1;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where d.id = p_driver_id and p.status = 'approved' and not d.shifts_paused and not d.sms_opted_out
      and (d.roster_grace_until > now() or cardinality(public.shift_ready_missing(d.id)) = 0)
      and public.terms_ok(p.id)
  ) then
    return query select 'not_eligible'::text, v_recipient.shift_id;
    return;
  end if;

  begin
    update public.shifts
    set status = 'booked', booked_driver_id = p_driver_id, booked_at = now()
    where id = v_recipient.shift_id
      and status = 'open'
      and carrier_paused_at is null
      and short_code = p_code
      and (starts_at > now() or (released_at is not null and ends_at > now()))
    returning id into v_booked;
  exception when exclusion_violation then
    return query select 'overlap'::text, v_recipient.shift_id;
    return;
  end;

  if v_booked is not null then
    update public.broadcast_recipients
    set status = 'booked', replied_at = now()
    where id = v_recipient.id;
    return query select 'won'::text, v_booked;
    return;
  end if;

  select * into v_shift from public.shifts where id = v_recipient.shift_id;

  if v_shift.status = 'booked' and v_shift.booked_driver_id = p_driver_id then
    return query select 'already_yours'::text, v_shift.id;
    return;
  end if;

  update public.broadcast_recipients
  set status = 'too_late', replied_at = now()
  where id = v_recipient.id and status not in ('booked', 'no_show', 'turned_away');

  if v_shift.status = 'booked' or (v_shift.status = 'open' and v_shift.short_code <> p_code) then
    return query select 'filled'::text, v_shift.id;
  else
    return query select 'closed'::text, v_shift.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke execute on function public.publish_terms_version(text, text, date, text, boolean) from public, anon, authenticated;
revoke execute on function public.required_terms_version() from public;
revoke execute on function public.terms_ok(uuid) from public, anon, authenticated;
revoke execute on function public.my_terms_ok() from public, anon;
revoke execute on function public.record_tos_acceptance(text, text, text, text, text) from public, anon;
revoke execute on function public.accept_terms_by_link(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.drivers_awaiting_terms() from public, anon, authenticated;

grant execute on function public.publish_terms_version(text, text, date, text, boolean) to service_role;
grant execute on function public.required_terms_version() to anon, authenticated, service_role;
grant execute on function public.terms_ok(uuid) to service_role;
grant execute on function public.my_terms_ok() to authenticated;
grant execute on function public.record_tos_acceptance(text, text, text, text, text) to authenticated;
grant execute on function public.accept_terms_by_link(text, text, text, text) to service_role;
grant execute on function public.drivers_awaiting_terms() to service_role;
