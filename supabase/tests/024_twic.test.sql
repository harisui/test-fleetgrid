-- 0033: a TWIC counts only with a date not passed on the shift's date; a gate release flags the
-- driver and is no no-show; the date text goes at most once per 7 days and twice in all; the TWIC
-- photo stays private.
begin;
select no_plan();

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555593' || n
from unnest(array['31', '32', '33', '34', '35', '36']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555593' || n, 'pending'
from (values ('31', 'driver'), ('32', 'driver'), ('33', 'driver'), ('34', 'driver'), ('35', 'driver'), ('36', 'carrier')) as t(n, r);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, twic_expires_on, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', a, e, true, 'clean', 12, true, true, now(), 'consent'
from (values
  ('31', true, current_date + 400),  -- valid
  ('32', true, current_date + 5),    -- valid now, expired by a shift in 10 days
  ('33', true, current_date - 3),    -- expired
  ('34', true, null::date),          -- a yes with no date
  ('35', false, null::date)          -- no
) as t(n, a, e);

insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['31', '32', '33', '34', '35']) as n cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
update public.profiles set status = 'approved' where id in (select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid from unnest(array['31', '32', '33', '34', '35', '36']) as n);
update public.drivers set rereview_needed = false where id in (select pg_temp.did(n) from unnest(array['31', '32', '33', '34', '35']) as n);
update public.drivers set shifts_paused = true where id not in (select pg_temp.did(n) from unnest(array['31', '32', '33', '34', '35']) as n);

-- Matching.
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', true, false, false, '{}', now() + interval '1 day', now() + interval '1 day 8 hours') $$,
  $$ values (pg_temp.did('31')), (pg_temp.did('32')) $$,
  'a TWIC shift tomorrow: valid cards only, not expired, not a yes with no date, not a no'
);
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', true, false, false, '{}', now() + interval '10 days', now() + interval '10 days 8 hours') $$,
  $$ values (pg_temp.did('31')) $$,
  'a TWIC shift in 10 days: a card expiring before then does not count'
);
select is((select count(*)::int from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', false, false, false, '{}', now() + interval '1 day', now() + interval '1 day 8 hours')), 5, 'a shift without TWIC takes everyone');
select is((select count(*)::int from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', true)), 2, 'the live count, with no times, uses today');

-- The carrier's search filter treats expired as no.
insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values ('c0000036-0000-4000-a000-000000000000', 'e0000036-0000-4000-8000-000000000000', 'Port Freight', 'Sam Owner', 'sam@port.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_36');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status)
values ('c0000036-0000-4000-a000-000000000000', 'sub_36', 'cus_36', 'active');

-- A gate release: no no-show, no pause, flagged, audited, kept out of the rebroadcast.
create function pg_temp.book(n text, driver text, hours integer) returns uuid language plpgsql as $$
declare
  v_id uuid := ('600000' || n || '-0000-4000-8000-000000000000')::uuid;
begin
  insert into public.shifts (id, carrier_id, short_code, status, booked_driver_id, booked_at, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, broadcast_round, twic_required)
  values (v_id, 'c0000036-0000-4000-a000-000000000000', '36' || n, 'booked', pg_temp.did(driver), now(), now() + make_interval(hours => hours),
    now() + make_interval(hours => hours + 8), '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Port moves for the check.', 'Lee Yard', '+17135550100', 1, true);
  insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status)
  values (v_id, pg_temp.did(driver), 1, 1, '36' || n, 'booked');
  return v_id;
end;
$$;

select is(public.release_shift(pg_temp.book('01', '31', 24), 2, 'twic_gate'), pg_temp.did('31'), 'a gate release names the driver');
select is((select no_show_count from public.drivers where id = pg_temp.did('31')), 0, 'not a no-show');
select is((select count(*)::int from public.shift_events where driver_id = pg_temp.did('31') and no_show), 0, 'and no no-show event');
select ok((select twic_issue_at is not null and twic_issue_prior_at is null from public.drivers where id = pg_temp.did('31')), 'flagged once');
select is((select status::text from public.broadcast_recipients where driver_id = pg_temp.did('31')), 'turned_away', 'the offer says why');
select results_eq(
  $$ select admin_phone, action from public.admin_audit_log where target_id = pg_temp.did('31') $$,
  $$ values ('system'::text, 'driver_twic_flagged'::text) $$,
  'audited'
);
select is(public.release_shift(pg_temp.book('02', '31', 48), 2, 'twic_gate'), pg_temp.did('31'), 'a second gate release');
select ok((select twic_issue_at is not null and twic_issue_prior_at is not null from public.drivers where id = pg_temp.did('31')), 'two flags on record: the admin reads Needs review');
select is((select shifts_paused from public.drivers where id = pg_temp.did('31')), false, 'and two flags never pause');
select throws_ok($$ select public.release_shift(pg_temp.book('03', '32', 24), 2, 'nonsense') $$, '22023', null, 'an unknown reason is refused');

-- A no-show release still counts.
select is(public.release_shift(pg_temp.book('04', '35', 24), 9), pg_temp.did('35'), 'a plain release');
select is((select no_show_count from public.drivers where id = pg_temp.did('35')), 1, 'counts a no-show');

-- The date text.
select results_eq(
  $$ select driver_id from public.claim_twic_date_notices() $$,
  $$ values (pg_temp.did('34')) $$,
  'only a yes with no date, with texts on'
);
select is_empty($$ select * from public.claim_twic_date_notices() $$, 'not again within 7 days');
update public.drivers set twic_date_notice_at = now() - interval '8 days' where id = pg_temp.did('34');
select is((select count(*)::int from public.claim_twic_date_notices()), 1, 'after 7 days, the second');
update public.drivers set twic_date_notice_at = now() - interval '8 days' where id = pg_temp.did('34');
select is_empty($$ select * from public.claim_twic_date_notices() $$, 'never a third');

-- The photo: a carrier with a booking opens the CDL and medical card, never the TWIC card.
alter table public.driver_documents disable trigger driver_documents_rereview;
insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes)
values ('a2000000-0000-4000-8000-000000000001', pg_temp.did('32'), 'twic', pg_temp.did('32') || '/twic.png', 'twic.png', 'image/png', 100);
alter table public.driver_documents enable trigger driver_documents_rereview;
insert into storage.objects (bucket_id, name, owner, metadata)
values ('driver-documents', pg_temp.did('32') || '/twic.png', 'e0000032-0000-4000-8000-000000000000', '{"mimetype":"image/png","size":100}'::jsonb);
update public.shifts set status = 'booked', booked_driver_id = pg_temp.did('32'), booked_at = now(), starts_at = now() + interval '3 days', ends_at = now() + interval '3 days 8 hours' where id = ('60000003-0000-4000-8000-000000000000')::uuid;
select is((select status::text from public.profiles where id = 'e0000032-0000-4000-8000-000000000000'), 'approved', 'a TWIC photo sends nobody back to Registered');

select set_config('request.jwt.claims', json_build_object('sub', 'e0000036-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.driver_documents where driver_id = pg_temp.did('32') and type = 'twic'), 0, 'a carrier with a booking never reads the TWIC document');
select is((select count(*)::int from storage.objects where name = pg_temp.did('32') || '/twic.png'), 0, 'or the file');
select ok(not public.record_carrier_document_view('a2000000-0000-4000-8000-000000000001'), 'and cannot log a view of it');
select set_eq(
  $$ select driver_id from public.search_drivers(29.7594, -95.3594, 50, null, '{}', null, true, null, null, '{}', null, 500, 0)
     where driver_id in (select pg_temp.did(n) from unnest(array['31', '32', '33', '34', '35']) as n) $$,
  $$ values (pg_temp.did('31')), (pg_temp.did('32')) $$,
  'the search''s TWIC filter treats expired and a missing date as no'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'e0000033-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.drivers set twic_issue_at = now() where id = pg_temp.did('33') $$, '42501', null, 'a driver cannot clear a flag');
select lives_ok($$ update public.drivers set twic_expires_on = current_date + 30 where id = pg_temp.did('33') $$, 'a driver can update their date');
reset role;

select * from finish();
rollback;
