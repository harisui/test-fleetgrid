-- 0032: overlaps blocked by the database, matching skips them, dated no-shows and the auto-pause,
-- the alert cap, replies finished only when done, and alerts sent at most once.
begin;
select no_plan();

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555595' || n
from unnest(array['91', '92', '93', '94']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555595' || n, 'pending'
from (values ('91', 'driver'), ('92', 'driver'), ('93', 'driver'), ('94', 'carrier')) as t(n, r);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
create function pg_temp.sid(n text) returns uuid language sql as $$
  select ('500000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true, true, now(), 'consent'
from unnest(array['91', '92', '93']) as n;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['91', '92', '93']) as n cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
update public.profiles set status = 'approved' where id in (select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid from unnest(array['91', '92', '93', '94']) as n);
update public.drivers set rereview_needed = false where id in (pg_temp.did('91'), pg_temp.did('92'), pg_temp.did('93'));
update public.drivers set shifts_paused = true where id not in (pg_temp.did('91'), pg_temp.did('92'), pg_temp.did('93'));

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values ('c0000094-0000-4000-a000-000000000000', 'e0000094-0000-4000-8000-000000000000', 'Safe Freight', 'Sam Owner', 'sam@safe.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_94');

-- A shift starting `hours` from now, 8 hours long, offered to all three.
create function pg_temp.post(n text, hours numeric, code text) returns void language plpgsql as $$
begin
  insert into public.shifts (id, carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
  values (pg_temp.sid(n), 'c0000094-0000-4000-a000-000000000000', code, now() + make_interval(secs => hours * 3600),
    now() + make_interval(secs => (hours + 8) * 3600), '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Yard moves for the check.', 'Lee Yard', '+17135550100', 1);
  insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status)
  select pg_temp.sid(n), pg_temp.did(d), 1, row_number() over (), code, 'sent'
  from unnest(array['91', '92', '93']) as d;
end;
$$;

-- Overlaps. Shift 1 runs from 24h to 32h from now.
select pg_temp.post('01', 24, '9101');
select is((select outcome from public.claim_shift(pg_temp.did('91'), '9101')), 'won', 'the first booking goes through');
select has_trigger('public', 'shifts', 'shifts_log_status_event', 'status changes are logged');

select pg_temp.post('02', 28, '9102'); -- inside it
select is((select outcome from public.claim_shift(pg_temp.did('91'), '9102')), 'overlap', 'an overlapping shift is refused');
select is((select status::text from public.shifts where id = pg_temp.sid('02')), 'open', 'and stays open');
select is((select outcome from public.claim_shift(pg_temp.did('92'), '9102')), 'won', 'for another driver to book');

select pg_temp.post('03', 33, '9103'); -- starts 1 hour after shift 1 ends: under the 90 minutes
select is((select outcome from public.claim_shift(pg_temp.did('91'), '9103')), 'overlap', 'a gap under 90 minutes is refused');
select pg_temp.post('04', 33.6, '9104'); -- 1 hour 36 minutes after: a clear 90 minutes
select is((select outcome from public.claim_shift(pg_temp.did('91'), '9104')), 'won', 'a gap over 90 minutes books');

select throws_ok(
  $$ update public.shifts set status = 'booked', booked_driver_id = pg_temp.did('91'), booked_at = now() where id = pg_temp.sid('03') $$,
  '23P01', null, 'the database refuses it however the write arrives'
);

-- Matching skips a driver with an overlapping booking (91 and 92 are busy around 28h).
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', false, false, false, '{}',
       now() + interval '27 hours', now() + interval '29 hours') $$,
  $$ values (pg_temp.did('93')) $$,
  'matching with the shift times skips drivers with an overlapping booking'
);
select is((select count(*)::int from public.matching_drivers(29.7594, -95.3594, 'A')), 3, 'without times it counts everyone, for the live count');

-- A booked shift's event, and a cancelled one's.
select is((select count(*)::int from public.shift_events where shift_id = pg_temp.sid('01') and kind = 'booked' and driver_id = pg_temp.did('91')), 1, 'a booking is a dated event');
update public.shifts set status = 'cancelled', cancelled_at = now() where id = pg_temp.sid('02');
select is((select count(*)::int from public.shift_events where shift_id = pg_temp.sid('02') and kind = 'cancelled' and driver_id = pg_temp.did('92')), 1, 'so is a cancellation');

-- No-shows and the auto-pause, at a threshold of 2.
select is(public.release_shift(pg_temp.sid('01'), 2), pg_temp.did('91'), 'a release names the driver');
select is((select shifts_paused from public.drivers where id = pg_temp.did('91')), false, 'one no-show: not paused');
select is((select count(*)::int from public.shift_events where driver_id = pg_temp.did('91') and no_show), 1, 'a dated no-show');
select is(public.release_shift(pg_temp.sid('04'), 2), pg_temp.did('91'), 'a second release');
select is((select shifts_paused from public.drivers where id = pg_temp.did('91')), true, 'two in 90 days: paused');
select is((select shifts_paused_reason from public.drivers where id = pg_temp.did('91')), 'no_shows', 'and says why');
select results_eq(
  $$ select admin_phone, action from public.admin_audit_log where target_id = pg_temp.did('91') $$,
  $$ values ('system'::text, 'driver_auto_paused'::text) $$,
  'audited with the system as actor'
);

-- An old no-show does not count: 93 had one 91 days ago.
insert into public.shift_events (driver_id, kind, no_show, created_at) values (pg_temp.did('93'), 'released', true, now() - interval '91 days');
select pg_temp.post('05', 60, '9105');
select is((select outcome from public.claim_shift(pg_temp.did('93'), '9105')), 'won', '93 books');
select is(public.release_shift(pg_temp.sid('05'), 2), pg_temp.did('93'), 'and is released');
select is((select shifts_paused from public.drivers where id = pg_temp.did('93')), false, 'one in 90 days and one older: not paused');
select pg_temp.post('06', 72, '9106');
select is((select outcome from public.claim_shift(pg_temp.did('93'), '9106')), 'won', '93 books again');
select is(public.release_shift(pg_temp.sid('06'), 3), pg_temp.did('93'), 'with a threshold of 3');
select is((select shifts_paused from public.drivers where id = pg_temp.did('93')), false, 'two is under 3: the client may change it');

-- The ended event, once.
select pg_temp.post('07', 200, '9107');
update public.shifts set status = 'booked', booked_driver_id = pg_temp.did('92'), booked_at = now() where id = pg_temp.sid('07');
select is(public.record_ended_shifts(), 0, 'a shift still running has not ended');
update public.shifts set starts_at = now() - interval '10 hours', ends_at = now() - interval '2 hours' where id = pg_temp.sid('07');
select is(public.record_ended_shifts(), 1, 'one past its end is recorded');
select is(public.record_ended_shifts(), 0, 'once');

-- The alert cap: offers only, 24 hours, failures not counted.
insert into public.sms_messages (direction, kind, from_phone, to_phone, body, status, driver_id, created_at)
select 'outbound', k, 'fake', '+15555559592', 'FleetGrid: x', s, pg_temp.did('92'), a
from (values ('offer', 'sent', now()), ('offer', 'delivered', now()), ('offer', 'sent', now() - interval '23 hours'),
  ('offer', 'sent', now() - interval '25 hours'), ('offer', 'failed', now()), ('booked', 'sent', now()), ('welcome', 'sent', now())) as t(k, s, a);
insert into public.sms_messages (direction, kind, from_phone, to_phone, body, status, driver_id)
select 'outbound', 'offer', 'fake', '+15555559593', 'FleetGrid: x', 'sent', pg_temp.did('93') from generate_series(1, 2);
select results_eq(
  $$ select * from public.drivers_at_alert_cap(array[pg_temp.did('92'), pg_temp.did('93')], 3) $$,
  $$ values (pg_temp.did('92')) $$,
  'three alerts in 24 hours reach the cap; older ones, failures and other texts do not count'
);

-- Replies: finished only when done.
select ok(public.begin_inbound('SMr1'), 'a new reply is handled');
select ok(not public.begin_inbound('SMr1'), 'a second delivery while it runs is not');
update public.sms_inbound_processing set started_at = now() - interval '61 seconds' where provider_sid = 'SMr1';
select ok(public.begin_inbound('SMr1'), 'after 60 seconds unfinished, it is handled again');
select public.finish_inbound('SMr1');
update public.sms_inbound_processing set started_at = now() - interval '1 day' where provider_sid = 'SMr1';
select ok(not public.begin_inbound('SMr1'), 'a finished reply never is');

-- Alerts: at most once.
select pg_temp.post('08', 90, '9108');
update public.broadcast_recipients set status = 'queued', created_at = now() - interval '5 minutes' where shift_id = pg_temp.sid('08');
create function pg_temp.rid(n text) returns uuid language sql as $$
  select id from public.broadcast_recipients where shift_id = pg_temp.sid('08') and driver_id = pg_temp.did(n);
$$;
select is((select count(*)::int from public.stale_queued_recipients(now() - interval '2 minutes')), 2, 'stale queued alerts are listed, not for the paused driver');
select ok(public.claim_recipient_send(pg_temp.rid('92')), 'an alert can be taken');
select ok(not public.claim_recipient_send(pg_temp.rid('92')), 'but not twice');
update public.broadcast_recipients set send_claimed_at = now() - interval '3 minutes' where id = pg_temp.rid('92');
select ok(public.claim_recipient_send(pg_temp.rid('92')), 'an old claim with no text on record can be taken again');
update public.broadcast_recipients set send_claimed_at = now() - interval '3 minutes' where id = pg_temp.rid('92');
insert into public.sms_messages (direction, kind, from_phone, to_phone, body, status, driver_id, shift_id)
values ('outbound', 'offer', 'fake', '+15555559592', 'FleetGrid: x', 'sending', pg_temp.did('92'), pg_temp.sid('08'));
select ok(not public.claim_recipient_send(pg_temp.rid('92')), 'with a text on record it is never sent again');

select ok(
  not has_function_privilege('authenticated', 'public.begin_inbound(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.drivers_at_alert_cap(uuid[], integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_shift(uuid, integer, text)', 'execute'),
  'nobody signed in may run these'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e0000092-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select is_empty($$ select 1 from public.shift_events $$, 'a driver reads no shift events');
reset role;

select * from finish();
rollback;
