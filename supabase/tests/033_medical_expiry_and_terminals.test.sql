-- 0041: the medical card date (a passed date stops offers and listing), terminal experience on
-- the carrier's card, and one text about 30 days before a medical card or TWIC expires.
begin;
select no_plan();

select has_column('public', 'drivers', 'medical_card_expires_on', 'drivers carry the medical card date');
select has_column('public', 'drivers', 'terminals', 'drivers carry their terminals');
select has_column('public', 'drivers', 'container_skills', 'drivers carry their container work');
select has_table('public', 'driver_expiry_notices', 'the expiry texts are logged');
select ok((select relrowsecurity from pg_class where oid = 'public.driver_expiry_notices'::regclass), 'with RLS');
select ok(
  not has_table_privilege('authenticated', 'public.driver_expiry_notices', 'select')
  and not has_function_privilege('authenticated', 'public.claim_expiry_notices()', 'execute')
  and not has_function_privilege('anon', 'public.claim_expiry_notices()', 'execute'),
  'nobody signed in may read the log or run the claim'
);

-- Drivers 91 to 94: Roster-Ready, texts on, every paper. 94 has texts off.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555597' || n
from unnest(array['91', '92', '93', '94']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'driver', '+155555597' || n, 'approved'
from unnest(array['91', '92', '93', '94']) as n;

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'America/Chicago')::date;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver Ninety ' || n, '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', n in ('92', '93'), true, 'clean', 12, true,
  n <> '94', case when n <> '94' then now() end, case when n <> '94' then 'consent' end
from unnest(array['91', '92', '93', '94']) as n;

alter table public.driver_documents disable trigger driver_documents_rereview;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['91', '92', '93', '94']) as n, unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
alter table public.driver_documents enable trigger driver_documents_rereview;

-- The expired card.
select is(public.shift_ready_missing(pg_temp.did('91')), '{}'::text[], 'no date yet: nothing missing, the driver keeps working');
update public.drivers set medical_card_expires_on = pg_temp.today() where id = pg_temp.did('91');
select is(public.shift_ready_missing(pg_temp.did('91')), '{}'::text[], 'the card is good through its last day');
update public.drivers set medical_card_expires_on = pg_temp.today() - 1 where id = pg_temp.did('91');
select is(public.shift_ready_missing(pg_temp.did('91')), array['medical_card_expired'], 'a passed date is missing');
select ok(not public.is_shift_ready(pg_temp.did('91')), 'so the driver is not listed to carriers');
select is_empty(
  $$ select 1 from public.matching_drivers(29.7594, -95.3594, 'A') where driver_id = pg_temp.did('91') $$,
  'and gets no shift offers'
);
update public.drivers set medical_card_expires_on = pg_temp.today() + 365 where id = pg_temp.did('91');
select ok(public.is_shift_ready(pg_temp.did('91')), 'a new date puts them back');
select isnt_empty(
  $$ select 1 from public.matching_drivers(29.7594, -95.3594, 'A') where driver_id = pg_temp.did('91') $$,
  'and shift offers reach them again'
);

-- The carrier's card carries the new answers.
select has_function('public', 'carrier_driver_cards', array['uuid[]'], 'the card function exists');
select ok(
  exists (select 1 from pg_proc where proname = 'carrier_driver_cards'
          and pg_get_function_result(oid) like '%medical_card_expires_on date%terminals terminal[]%container_skills container_skill[]%'),
  'and returns the medical card date, the terminals and the container work'
);

-- The expiry texts: 92's medical card in 20 days, 93's TWIC in 10 days and medical card in 400.
update public.drivers set medical_card_expires_on = pg_temp.today() + 20 where id = pg_temp.did('92');
update public.drivers set twic_expires_on = pg_temp.today() + 10, medical_card_expires_on = pg_temp.today() + 400 where id = pg_temp.did('93');
update public.drivers set medical_card_expires_on = pg_temp.today() + 5 where id = pg_temp.did('94');
select results_eq(
  $$ select driver_id, medical_expires_on, twic_expires_on from public.claim_expiry_notices()
     where driver_id in (pg_temp.did('91'), pg_temp.did('92'), pg_temp.did('93'), pg_temp.did('94')) order by driver_id $$,
  $$ values (pg_temp.did('92'), pg_temp.today() + 20, null::date), (pg_temp.did('93'), null::date, pg_temp.today() + 10) $$,
  'within 30 days only, the card that is due, never to a driver with texts off'
);
select ok(public.reminded_recently(pg_temp.did('92')), 'the text counts as this week''s reminder');
update public.driver_expiry_notices set sent_at = now() - interval '8 days';
select is_empty(
  $$ select 1 from public.claim_expiry_notices() where driver_id in (pg_temp.did('92'), pg_temp.did('93')) $$,
  'once per card and date'
);
update public.drivers set medical_card_expires_on = pg_temp.today() + 25 where id = pg_temp.did('92');
update public.drivers set last_doc_reminder_at = now() - interval '1 day' where id = pg_temp.did('92');
select is_empty(
  $$ select 1 from public.claim_expiry_notices() where driver_id = pg_temp.did('92') $$,
  'a new date waits while another reminder went this week'
);
update public.drivers set last_doc_reminder_at = now() - interval '8 days' where id = pg_temp.did('92');
select results_eq(
  $$ select medical_expires_on from public.claim_expiry_notices() where driver_id = pg_temp.did('92') $$,
  $$ values (pg_temp.today() + 25) $$,
  'then goes for the new date'
);

select * from finish();
rollback;
