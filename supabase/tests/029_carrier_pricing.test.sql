-- 0043: completed fills (2 hours after the end, once, the first 3 of shifts started in the trial
-- included), the no-show window to 2 hours after the end, a completed fill frozen, the trial and
-- card records, the price acknowledgment.
begin;
select no_plan();

alter table public.profiles disable trigger profiles_shift_ready_gate;
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555594' || n
from unnest(array['41', '42', '43', '44', '45', '46', '47', '48', '49']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555594' || n, 'approved'
from (values ('41', 'driver'), ('42', 'driver'), ('43', 'driver'), ('44', 'driver'), ('45', 'driver'),
             ('46', 'driver'), ('47', 'carrier'), ('48', 'carrier'), ('49', 'admin')) as t(n, r);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
create function pg_temp.cid(n text) returns uuid language sql as $$
  select ('c00000' || n || '-0000-4000-a000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 'A', 'TX', '{}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', false, true, 'clean', 12, true, true, now(), 'consent'
from unnest(array['41', '42', '43', '44', '45', '46']) as n;
alter table public.profiles enable trigger profiles_shift_ready_gate;

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values (pg_temp.cid('47'), 'e0000047-0000-4000-8000-000000000000', 'Trial Freight', 'Tia Owner', 'tia@trial.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_47'),
       (pg_temp.cid('48'), 'e0000048-0000-4000-8000-000000000000', 'Paid Freight', 'Pat Owner', 'pat@paid.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_48');

-- Carrier 47's trial ran from 10 days ago to 3 days ago. Carrier 48 never had one.
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status, trial_start, trial_end)
values (pg_temp.cid('47'), 'sub_47', 'cus_47', 'active', now() - interval '10 days', now() - interval '3 days'),
       (pg_temp.cid('48'), 'sub_48', 'cus_48', 'active', null, null);

-- A booked shift that starts and ends at the given offsets from now (hours).
create function pg_temp.shift(n text, carrier text, driver text, start_h numeric, end_h numeric) returns uuid language plpgsql as $$
declare
  v_id uuid := ('700000' || n || '-0000-4000-8000-000000000000')::uuid;
begin
  insert into public.shifts (id, carrier_id, short_code, status, booked_driver_id, booked_at, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
  values (v_id, pg_temp.cid(carrier), carrier || n, 'booked', pg_temp.did(driver), now(), now() + interval '30 days',
    now() + interval '30 days 8 hours', '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Yard moves for the check.', 'Lee Yard', '+17135550100', 1);
  update public.shifts set starts_at = now() + make_interval(secs => start_h * 3600), ends_at = now() + make_interval(secs => end_h * 3600)
  where id = v_id;
  insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status)
  values (v_id, pg_temp.did(driver), 1, 1, carrier || n, 'booked');
  return v_id;
end;
$$;

-- Carrier 47: four shifts started inside the trial, one started a minute before it ended and
-- completed after it, one started a minute after it ended.
select pg_temp.shift('01', '47', '41', -9 * 24, -9 * 24 + 8);
select pg_temp.shift('02', '47', '42', -8 * 24, -8 * 24 + 8);
select pg_temp.shift('03', '47', '43', -7 * 24, -7 * 24 + 8);
select pg_temp.shift('04', '47', '44', -6 * 24, -6 * 24 + 8);
-- The boundary pair: starts 1 minute before / after the trial end (3 days ago).
-- Run first with the cap high so the boundary itself is what decides.
select pg_temp.shift('05', '47', '45', -72 - 1.0 / 60, -72 + 8);
select pg_temp.shift('06', '47', '46', -72 + 1.0 / 60, -72 + 9);
-- Carrier 48: one ended 2 hours and 1 minute ago (a fill), one ended 1 hour 59 ago (not yet).
select pg_temp.shift('07', '48', '41', -10 - 1.0 / 60, -2 - 1.0 / 60);
select pg_temp.shift('08', '48', '42', -10 + 1.0 / 60, -2 + 1.0 / 60);

-- The boundary on its own: a fresh cap shows the trial window decides, not the order.
savepoint boundary;
delete from public.broadcast_recipients where shift_id in (select id from public.shifts where short_code in ('4701', '4702', '4703', '4704'));
delete from public.shifts where short_code in ('4701', '4702', '4703', '4704');
select results_eq(
  $$ select s.short_code::text, f.charge::text from public.record_completed_fills(3500) f join public.shifts s on s.id = f.shift_id where f.carrier_id = pg_temp.cid('47') order by 1 $$,
  $$ values ('4705', 'included'), ('4706', 'billable') $$,
  'started a minute before the trial ended: included, though it completed after; a minute after: billable'
);
rollback to savepoint boundary;

select is((select count(*)::int from public.record_completed_fills(3500)), 7, 'seven completed fills recorded');
select is_empty($$ select * from public.record_completed_fills(3500) $$, 'a second run records nothing');
select results_eq(
  $$ select s.short_code::text, f.charge::text, f.amount_cents from public.shift_fills f join public.shifts s on s.id = f.shift_id
     where f.carrier_id = pg_temp.cid('47') order by s.starts_at $$,
  $$ values ('4701', 'included', 0), ('4702', 'included', 0), ('4703', 'included', 0), ('4704', 'billable', 3500),
            ('4705', 'billable', 3500), ('4706', 'billable', 3500) $$,
  'the first three trial shifts are included, every other fill is $35'
);
select results_eq(
  $$ select s.short_code::text, f.charge::text from public.shift_fills f join public.shifts s on s.id = f.shift_id where f.carrier_id = pg_temp.cid('48') $$,
  $$ values ('4807'::text, 'billable'::text) $$,
  'no trial: billable; ended under 2 hours ago: not a fill yet'
);
select ok((select completed_at = shift_ends_at + interval '2 hours' from public.shift_fills where shift_id = ('70000007-0000-4000-8000-000000000000')::uuid),
  'completed 2 hours after the end');

-- A completed fill is frozen.
select throws_ok($$ update public.shifts set status = 'cancelled', cancelled_at = now() where short_code = '4807' $$, '42501', null,
  'a completed fill cannot be cancelled');
select is(public.release_shift(('70000007-0000-4000-8000-000000000000')::uuid), null, 'nor released as a no-show');
select throws_ok($$ update public.shift_fills set charge = 'included', amount_cents = 0 where shift_id = ('70000004-0000-4000-8000-000000000000')::uuid $$, '42501', null,
  'a billable fill cannot become included');
select throws_ok($$ delete from public.shift_fills where shift_id = ('70000004-0000-4000-8000-000000000000')::uuid $$, '42501', null, 'or be deleted');
select throws_ok($$ update public.shift_fills set completed_at = now() where shift_id = ('70000004-0000-4000-8000-000000000000')::uuid $$, '42501', null, 'or re-dated');
select lives_ok($$ update public.shift_fills set stripe_invoice_item_id = 'ii_4', billed_at = now() where shift_id = ('70000004-0000-4000-8000-000000000000')::uuid $$, 'billing stamps it');
select throws_ok($$ update public.shift_fills set stripe_invoice_item_id = 'ii_other' where shift_id = ('70000004-0000-4000-8000-000000000000')::uuid $$, '42501', null, 'once');
select throws_ok($$ update public.shift_fills set charge = 'waived', amount_cents = 0, waived_at = now(), waived_by = 'e0000049-0000-4000-8000-000000000000' where shift_id = ('70000005-0000-4000-8000-000000000000')::uuid $$,
  '23514', null, 'a waive needs a reason');
select lives_ok($$ update public.shift_fills set charge = 'waived', amount_cents = 0, waived_at = now(), waived_by = 'e0000049-0000-4000-8000-000000000000', waive_reason = 'Driver left early' where shift_id = ('70000005-0000-4000-8000-000000000000')::uuid $$,
  'an admin waive');
select throws_ok($$ update public.shift_fills set charge = 'billable', amount_cents = 3500, waived_at = null, waived_by = null, waive_reason = null where shift_id = ('70000005-0000-4000-8000-000000000000')::uuid $$,
  '42501', null, 'a waived fill stays waived');

-- The no-show window: within 2 hours after the end it is recorded and the shift closes, unsent.
select is(public.release_shift(('70000008-0000-4000-8000-000000000000')::uuid), pg_temp.did('42'), 'a no-show 1 hour 59 after the end is recorded');
select results_eq(
  $$ select status::text, booked_driver_id is null, short_code::text from public.shifts where short_code = '4808' $$,
  $$ values ('expired'::text, true, '4808'::text) $$,
  'the shift closes as expired, with its code kept: nothing goes out again'
);
select ok((select no_show_count = 1 from public.drivers where id = pg_temp.did('42')), 'the no-show counts');
select ok((select (detail ->> 'after_end')::boolean from public.shift_events where shift_id = ('70000008-0000-4000-8000-000000000000')::uuid), 'marked as after the end');
select is((select count(*)::int from public.record_completed_fills(3500) f where f.shift_id = ('70000008-0000-4000-8000-000000000000')::uuid), 0, 'and is never a fill');

-- Before the end the shift reopens as before; once started it cannot be cancelled.
select pg_temp.shift('09', '48', '43', -1, 7);
select throws_ok($$ update public.shifts set status = 'cancelled', cancelled_at = now() where short_code = '4809' $$, '42501', null,
  'a booked shift that has started cannot be cancelled');
select is(public.release_shift(('70000009-0000-4000-8000-000000000000')::uuid), pg_temp.did('43'), 'a no-show during the shift');
select is((select status::text from public.shifts where id = ('70000009-0000-4000-8000-000000000000')::uuid), 'open', 'reopens to go out again');
select pg_temp.shift('10', '48', '44', 24, 32);
select lives_ok($$ update public.shifts set status = 'cancelled', cancelled_at = now() where short_code = '4810' $$, 'a booked shift not yet started can be cancelled');

-- Who reads fills.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000048-0000-4000-8000-000000000000', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.shift_fills), 1, 'a carrier reads only its own fills');
select throws_ok($$ insert into public.shift_fills (carrier_id, shift_starts_at, shift_ends_at, completed_at, charge, amount_cents) values (pg_temp.cid('48'), now(), now(), now(), 'included', 0) $$,
  '42501', null, 'and writes none');
select throws_ok($$ select public.record_completed_fills(0) $$, '42501', null, 'nor runs the job');
select throws_ok($$ update public.carriers set trial_used_at = now() where id = pg_temp.cid('48') $$, '42501', null, 'nor changes its trial');
select throws_ok($$ select count(*) from public.trial_card_fingerprints $$, '42501', null, 'card fingerprints are closed to carriers');
reset role;

-- The acknowledgment.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000047-0000-4000-8000-000000000000', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
set local role authenticated;
select lives_ok($$ select public.record_billing_acknowledgment('2026-11-v2', true,
  E'How the trial and billing work

- 7-day free trial.

[ ] I have read and agree to the pricing terms above.',
  'I have read and agree to the pricing terms above.', '203.0.113.7', 'test agent') $$, 'a carrier acknowledges the price');
select results_eq(
  $$ select carrier_id, version, with_trial, ip, statement from public.billing_acknowledgments $$,
  $$ values (pg_temp.cid('47'), '2026-11-v2'::text, true, '203.0.113.7'::text, 'I have read and agree to the pricing terms above.'::text) $$,
  'recorded against the carrier, with the version, the statement and where from'
);
-- The archive (attorney, 2026-11-14): the whole text shown, once, by its SHA-256.
select results_eq(
  $$ select d.body_sha256 = encode(sha256(convert_to(d.body, 'UTF8')), 'hex'), d.version, d.body like '%[ ] I have read and agree%'
     from public.billing_acknowledgments a join public.billing_disclosures d on d.body_sha256 = a.disclosure_sha256 $$,
  $$ values (true, '2026-11-v2'::text, true) $$,
  'each acknowledgment names the exact text shown, kept by its hash'
);
select lives_ok($$ select public.record_billing_acknowledgment('2026-11-v2', true,
  E'How the trial and billing work

- 7-day free trial.

[ ] I have read and agree to the pricing terms above.',
  'I have read and agree to the pricing terms above.', '203.0.113.7', 'test agent') $$, 'the same text again');
select is(
  (select count(distinct a.disclosure_sha256)::int || '/' || count(*)::int from public.billing_acknowledgments a),
  '1/2', 'two acknowledgments, one archived text'
);
select throws_ok($$ select public.record_billing_acknowledgment('2026-11-v2', false, 'How billing works', 'I agree to something else.') $$,
  '22023', null, 'the statement must be part of the text shown');
select throws_ok($$ insert into public.billing_disclosures (body_sha256, version, body) values (repeat('a', 64), 'x', 'y') $$,
  '42501', null, 'the archive is written only through the function');
select throws_ok($$ insert into public.billing_acknowledgments (version, with_trial) values ('x', false) $$, '42501', null, 'only through the function');
reset role;
select throws_ok($$ update public.billing_acknowledgments set version = 'changed' $$, '42501', null, 'the record is append-only');

select set_config('request.jwt.claims', json_build_object('sub', 'e0000041-0000-4000-8000-000000000000', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
set local role authenticated;
select throws_ok($$ select public.record_billing_acknowledgment('2026-11-v2', true, 'x', 'x') $$, '42501', null, 'a driver cannot acknowledge');
select is((select count(*)::int from public.shift_fills), 0, 'or read fills');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'e0000049-0000-4000-8000-000000000000', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.shift_fills where carrier_id in (pg_temp.cid('47'), pg_temp.cid('48'))), 7, 'an admin reads every fill');
select is((select count(*)::int from public.billing_acknowledgments where user_agent = 'test agent'), 2, 'and every acknowledgment');
reset role;

-- A card fingerprint is unique: a second trial on the same card is refused.
insert into public.trial_card_fingerprints (fingerprint, carrier_id) values ('fp_47', pg_temp.cid('47'));
select throws_ok($$ insert into public.trial_card_fingerprints (fingerprint, carrier_id) values ('fp_47', pg_temp.cid('48')) $$, '23505', null, 'one trial per card');

-- The billing record outlives the carrier.
delete from public.carriers where id = pg_temp.cid('47');
select is((select count(*)::int from public.shift_fills where carrier_id is null and driver_id in (select pg_temp.did(n) from unnest(array['41', '42', '43', '44', '45', '46']) as n)), 6, 'fills stay when the carrier is removed');
select is((select count(*)::int from public.billing_acknowledgments where carrier_id is null and user_agent = 'test agent'), 2, 'and so does the acknowledgment');
reset role;
select throws_ok($$ update public.billing_disclosures set body = 'changed' $$, '42501', null, 'the archived text never changes');
select is((select count(*)::int from public.trial_card_fingerprints where fingerprint = 'fp_47'), 1, 'and the card stays used');

select * from finish();
rollback;
