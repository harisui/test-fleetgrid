-- 0003: helper functions and protection triggers (Milestone 1)

-- Role of the signed-in user, or null when there is no profile yet.
create function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'admin', false);
$$;

-- Driver row id of the signed-in user, or null.
create function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.drivers where profile_id = auth.uid();
$$;

-- True for admins and for trusted server-side connections (service role key,
-- migrations, seed). Security invoker on purpose: current_user must be the
-- caller's database role.
create function public.is_privileged()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_admin();
$$;

-- Users may never change their own role, status or phone.
create function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing role is not allowed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Changing status is not allowed' using errcode = '42501';
  end if;
  if new.phone is distinct from old.phone or new.id is distinct from old.id then
    raise exception 'Changing phone is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Drivers may not move their card to another profile, and may not undo an SMS
-- opt-out themselves: opt-out state is synced from the SMS provider (STOP / START).
create function public.protect_driver_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    raise exception 'Changing the card owner is not allowed' using errcode = '42501';
  end if;
  if new.sms_opted_out is distinct from old.sms_opted_out
     or new.sms_opted_out_at is distinct from old.sms_opted_out_at then
    raise exception 'Changing SMS opt-out state is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger drivers_protect_columns
  before update on public.drivers
  for each row execute function public.protect_driver_columns();

-- Helper functions are for signed-in users and server code only.
revoke execute on function public.auth_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_driver_id() from public, anon;
revoke execute on function public.is_privileged() from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_driver_id() to authenticated, service_role;
grant execute on function public.is_privileged() to authenticated, service_role;
