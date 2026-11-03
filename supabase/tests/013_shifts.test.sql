-- Broadcast Shift (0023): the shifts, recipients and SMS log tables, who reads and writes
-- them, the area check, the open-code uniqueness, matching, claim_shift and release_shift.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select has_table('public', 'shifts', 'shifts exists');
select has_table('public', 'broadcast_recipients', 'broadcast_recipients exists');
select has_table('public', 'sms_messages', 'sms_messages exists');
select has_column('public', 'drivers', 'no_show_count', 'drivers carry a no-show count');
select has_column('public', 'drivers', 'shifts_paused', 'drivers carry the admin pause');
select has_function('public', 'claim_shift', array['uuid', 'text'], 'claim_shift exists');
select has_function('public', 'release_shift', array['uuid'], 'release_shift exists');
select has_function('public', 'expire_shifts', 'expire_shifts exists');
select has_function('public', 'booked_driver_contact', array['uuid'], 'booked_driver_contact exists');
select ok(
  not has_function_privilege('authenticated', 'public.claim_shift(uuid, text)', 'execute'),
  'signed-in users cannot call claim_shift'
);
select ok(
  not has_function_privilege('authenticated',
    'public.matching_drivers(double precision, double precision, public.cdl_class, public.endorsement[], integer, public.equipment_type[], boolean, boolean, boolean, uuid[])',
    'execute'),
  'signed-in users cannot list matching drivers'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Profiles: admin 01, carrier 02 (subscribed), carrier 03 (not subscribed),
-- drivers 11 to 19. Driver 11 is the reference match: approved, complete, texts on, class A,
-- endorsements H and T, 8 years, dry van and reefer, TWIC, medical, manual, Houston.
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555593' || n
from unnest(array['01', '02', '03', '11', '12', '13', '14', '15', '16', '17', '18', '19']) as n;

insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, role::public.user_role, '+155555593' || n, status::public.account_status
from (values
  ('01', 'admin', 'approved'), ('02', 'carrier', 'approved'), ('03', 'carrier', 'approved'),
  ('11', 'driver', 'approved'), ('12', 'driver', 'approved'), ('13', 'driver', 'pending'),
  ('14', 'driver', 'approved'), ('15', 'driver', 'approved'), ('16', 'driver', 'approved'),
  ('17', 'driver', 'approved'), ('18', 'driver', 'approved'), ('19', 'driver', 'approved')
) as t(n, role, status);

create function pg_temp.uid(n text) returns uuid language sql as $$
  select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

-- Every driver starts as a copy of the reference; the updates below make each one miss once.
insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in,
  sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), pg_temp.uid(n), 'Driver ' || n, '{cdl_driver}', 'A', '{H,T}', 8, 'Houston', 'TX',
  '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van,reefer}', true, true, 'clean', 12, true, true,
  now(), 'consent'
from unnest(array['11', '12', '13', '14', '15', '16', '17', '18', '19']) as n;

update public.drivers set cdl_class = 'B' where id = pg_temp.did('12');                    -- class B
update public.drivers set sms_opted_out = true, sms_opted_out_at = now() where id = pg_temp.did('14');
update public.drivers set shifts_paused = true where id = pg_temp.did('15');
update public.drivers set endorsements = '{H}' where id = pg_temp.did('16');               -- no T
update public.drivers set years_experience = 2 where id = pg_temp.did('17');
update public.drivers set service_radius_miles = 5, zip = '77506', lat = 29.7009, lng = -95.1989
  where id = pg_temp.did('18');                                                            -- Pasadena, 5 miles
update public.drivers set transmission = 'automatic_only', twic_active = false where id = pg_temp.did('19');

-- CR-5: only Shift-Ready drivers match and book, so the fixture drivers carry a Texas CDL
-- and the three documents (the re-review trigger is off while the fixture is built).
alter table public.driver_documents disable trigger driver_documents_rereview;
update public.drivers set cdl_state = 'TX' where id in (select pg_temp.did(n) from unnest(array['11', '12', '13', '14', '15', '16', '17', '18', '19']) as n);
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select d.id, t::public.document_type, d.id || '/cr5-' || t || '.png', 'cr5-' || t || '.png', 'image/png', 100
from public.drivers d cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t
where d.id in (select pg_temp.did(n) from unnest(array['11', '12', '13', '14', '15', '16', '17', '18', '19']) as n);
alter table public.driver_documents enable trigger driver_documents_rereview;

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id) values
  ('c0000002-0000-4000-a000-000000000000', pg_temp.uid('02'), 'Posting Freight', 'Pat Owner', 'pat@posting.example',
   'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_post'),
  ('c0000003-0000-4000-a000-000000000000', pg_temp.uid('03'), 'Unpaid Freight', 'Kim Owner', 'kim@unpaid.example',
   'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_unpaid');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values
  ('c0000002-0000-4000-a000-000000000000', 'sub_post', 'cus_post', 'active'),
  ('c0000003-0000-4000-a000-000000000000', 'sub_unpaid', 'cus_unpaid', 'canceled');

-- The local seed's drivers are kept out of the matching checks for this file.
update public.drivers set shifts_paused = true where id not in (select pg_temp.did(n)
  from unnest(array['11', '12', '13', '14', '15', '16', '17', '18', '19']) as n);

create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting
-- ---------------------------------------------------------------------------
select pg_temp.sign_in(pg_temp.uid('02'));
select lives_ok($$
  insert into public.shifts (id, carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    cdl_class, endorsements, min_years, work_description, onsite_contact_name, onsite_contact_phone)
  values ('50000001-0000-4000-8000-000000000000', 'c0000002-0000-4000-a000-000000000000', '4821',
    now() + interval '1 day', now() + interval '1 day 8 hours', '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'A', '{T}', 5, 'Container moves between the port and the yard.', 'Lee Yard', '+17135550100')
$$, 'a subscribed carrier posts a shift');
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', '1111', now() + interval '1 day', now() + interval '1 day 8 hours',
    '75201', 'Dallas', 'TX', 32.7876, -96.7994, 'Container moves in Dallas.', 'Lee Yard', '+17135550100')
$$, '23514', null, 'a shift outside every active area is refused');
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', '1112', now() - interval '1 hour', now() + interval '6 hours',
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'A shift that started already.', 'Lee Yard', '+17135550100')
$$, '23514', null, 'a shift that has started is refused');
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', '4821', now() + interval '2 days', now() + interval '2 days 8 hours',
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'Same code as an open shift.', 'Lee Yard', '+17135550100')
$$, '23505', null, 'two open shifts never share a code');
select throws_ok($$
  insert into public.shifts (carrier_id, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', now() + interval '1 day', now() + interval '1 day 8 hours',
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'No on-site number given.', 'Lee Yard', '7135550100')
$$, '23514', null, 'the on-site contact number must be a US number in E.164');
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, status, booked_driver_id, booked_at, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', '2222', 'booked', 'd0000011-0000-4000-8000-000000000000', now(),
    now() + interval '1 day', now() + interval '1 day 8 hours', '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Pre-booked by the carrier.', 'Lee Yard', '+17135550100')
$$, '42501', null, 'a carrier cannot post a shift already booked');
select throws_ok($$
  update public.shifts set status = 'cancelled', cancelled_at = now() where id = '50000001-0000-4000-8000-000000000000'
$$, '42501', null, 'carriers do not update shifts directly (the app does, with the service role)');
select pg_temp.sign_out();

select pg_temp.sign_in(pg_temp.uid('03'));
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000003-0000-4000-a000-000000000000', '3333', now() + interval '1 day', now() + interval '1 day 8 hours',
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'Posted without a subscription.', 'Lee Yard', '+17135550100')
$$, '42501', null, 'a carrier without an active subscription cannot post');
select is((select count(*) from public.shifts), 0::bigint, 'another carrier sees none of the shifts');
select pg_temp.sign_out();

select pg_temp.sign_in(pg_temp.uid('11'));
select throws_ok($$
  insert into public.shifts (carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone)
  values ('c0000002-0000-4000-a000-000000000000', '4444', now() + interval '1 day', now() + interval '1 day 8 hours',
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'A driver posting a shift.', 'Lee Yard', '+17135550100')
$$, '42501', null, 'a driver cannot post');
select is((select count(*) from public.shifts), 0::bigint, 'a driver sees no shift they have not booked');
select pg_temp.sign_out();

select is(
  (select length(public.new_shift_code())), 4, 'new_shift_code gives four digits'
);

-- ---------------------------------------------------------------------------
-- Matching: for the shift (class A, T, 5 years) only driver 11 and the Pasadena driver's
-- miss on distance are tested; then each requirement on its own.
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{T}', 5, '{}', false, false, false) $$,
  $$ values ('d0000011-0000-4000-8000-000000000000'::uuid), ('d0000019-0000-4000-8000-000000000000'::uuid) $$,
  'class A, T, 5 years: class B, pending, opted out, paused, no T, 2 years and too far are left out'
);
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'B', '{}', 0, '{}', false, false, false) $$,
  $$ select pg_temp.did(n) from unnest(array['11', '12', '16', '17', '19']) as n $$,
  'class B takes A and B drivers'
);
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', true, false, true) $$,
  $$ values ('d0000011-0000-4000-8000-000000000000'::uuid), ('d0000016-0000-4000-8000-000000000000'::uuid), ('d0000017-0000-4000-8000-000000000000'::uuid) $$,
  'TWIC and manual drop the automatic driver without TWIC'
);
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7009, -95.1989, 'A', '{}', 0, '{reefer}', false, false, false) $$,
  $$ select pg_temp.did(n) from unnest(array['11', '16', '17', '18', '19']) as n $$,
  'a Pasadena shift reaches the Pasadena driver within their 5 miles'
);
select is(
  (select count(*) from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{flatbed}', false, false, false)),
  0::bigint, 'equipment nobody has matches nobody'
);
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{T}', 5, '{}', false, false, false,
       array['d0000011-0000-4000-8000-000000000000'::uuid]) $$,
  $$ values ('d0000019-0000-4000-8000-000000000000'::uuid) $$,
  'excluded drivers are left out (a released no-show)'
);
select is(
  (select phone from public.matching_drivers(29.7594, -95.3594, 'A', '{T}', 5, '{}', false, false, false)
   where driver_id = pg_temp.did('11')),
  '+15555559311', 'the match carries the phone for the text'
);

-- ---------------------------------------------------------------------------
-- Recipients and what each side reads
-- ---------------------------------------------------------------------------
update public.shifts set broadcast_round = 1, broadcast_at = now() where id = '50000001-0000-4000-8000-000000000000';
insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status) values
  ('50000001-0000-4000-8000-000000000000', pg_temp.did('11'), 1, 1, '4821', 'sent'),
  ('50000001-0000-4000-8000-000000000000', pg_temp.did('19'), 1, 2, '4821', 'sent'),
  ('50000001-0000-4000-8000-000000000000', pg_temp.did('15'), 1, 3, '4821', 'sent');
insert into public.sms_messages (direction, kind, from_phone, to_phone, body, provider_sid) values
  ('outbound', 'offer', '+18888692040', '+15555559311', 'FleetGrid: New shift', 'SMpgtap013');

select pg_temp.sign_in(pg_temp.uid('02'));
select is((select count(*) from public.broadcast_recipients), 3::bigint, 'the carrier reads their shift''s recipients');
select is((select count(*) from public.sms_messages), 0::bigint, 'the carrier reads no texts');
select is((select count(*) from public.booked_driver_contact('50000001-0000-4000-8000-000000000000')), 0::bigint,
  'no driver contact before a booking');
select pg_temp.sign_out();

select pg_temp.sign_in(pg_temp.uid('11'));
select is((select count(*) from public.broadcast_recipients), 1::bigint, 'a driver reads only their own offers');
select is((select count(*) from public.sms_messages), 0::bigint, 'a driver reads no text log');
select pg_temp.sign_out();

select pg_temp.sign_in(pg_temp.uid('01'));
select is((select count(*) from public.sms_messages where provider_sid = 'SMpgtap013'), 1::bigint, 'an admin reads the text log');
select is((select count(*) from public.shifts), 1::bigint, 'an admin reads every shift');
select pg_temp.sign_out();

select pg_temp.sign_in(pg_temp.uid('11'));
select throws_ok($$ select * from public.claim_shift('d0000011-0000-4000-8000-000000000000', '4821') $$,
  '42501', null, 'a driver cannot call claim_shift directly');
select throws_ok($$ update public.drivers set no_show_count = 5 where id = 'd0000011-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot change their no-shows');
select throws_ok($$ update public.drivers set shifts_paused = true where id = 'd0000011-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot change the pause');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- claim_shift outcomes
-- ---------------------------------------------------------------------------
select is((select outcome from public.claim_shift(pg_temp.did('11'), '9999')), 'not_found', 'a code never sent is not found');
select is((select outcome from public.claim_shift(pg_temp.did('12'), '4821')), 'not_found', 'a driver never offered the shift finds nothing');
select is((select outcome from public.claim_shift(pg_temp.did('15'), '4821')), 'not_eligible', 'a paused driver cannot book');
select is((select outcome from public.claim_shift(pg_temp.did('11'), '4821')), 'won', 'the first YES wins');
select is((select status::text from public.shifts where id = '50000001-0000-4000-8000-000000000000'), 'booked', 'the shift is booked');
select is((select booked_driver_id from public.shifts where id = '50000001-0000-4000-8000-000000000000'), pg_temp.did('11'), 'by the winner');
select is((select status::text from public.broadcast_recipients where driver_id = pg_temp.did('11')), 'booked', 'the winner''s offer is marked booked');
select is((select outcome from public.claim_shift(pg_temp.did('11'), '4821')), 'already_yours', 'a second YES from the winner changes nothing');
select is((select outcome from public.claim_shift(pg_temp.did('19'), '4821')), 'filled', 'a late YES finds it filled');
select is((select status::text from public.broadcast_recipients where driver_id = pg_temp.did('19')), 'too_late', 'the late offer is marked too late');

select pg_temp.sign_in(pg_temp.uid('02'));
select results_eq(
  $$ select full_name, phone from public.booked_driver_contact('50000001-0000-4000-8000-000000000000') $$,
  $$ values ('Driver 11'::text, '+15555559311'::text) $$,
  'the shift''s carrier reads the booked driver''s name and phone'
);
select pg_temp.sign_out();
select pg_temp.sign_in(pg_temp.uid('03'));
select is((select count(*) from public.booked_driver_contact('50000001-0000-4000-8000-000000000000')), 0::bigint,
  'another carrier reads nothing');
select pg_temp.sign_out();
select pg_temp.sign_in(pg_temp.uid('11'));
select is((select count(*) from public.shifts), 1::bigint, 'the booked driver reads their shift');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- release_shift: the no-show is counted and the shift reopens with a fresh code
-- ---------------------------------------------------------------------------
select is(public.release_shift('50000001-0000-4000-8000-000000000000'), pg_temp.did('11'), 'release returns the no-show');
select is((select no_show_count from public.drivers where id = pg_temp.did('11')), 1, 'their no-show count went up');
select is((select status::text from public.broadcast_recipients where driver_id = pg_temp.did('11')), 'no_show', 'their offer is marked no-show');
select is((select status::text from public.shifts where id = '50000001-0000-4000-8000-000000000000'), 'open', 'the shift is open again');
select isnt((select short_code::text from public.shifts where id = '50000001-0000-4000-8000-000000000000'), '4821', 'with a fresh code');
select is((select outcome from public.claim_shift(pg_temp.did('19'), '4821')), 'filled', 'the old code no longer books');
select is(public.release_shift('50000001-0000-4000-8000-000000000000'), null, 'an open shift cannot be released');

-- ---------------------------------------------------------------------------
-- Expiry and the closed outcome
-- ---------------------------------------------------------------------------
insert into public.shifts (id, carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
  work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
values ('50000002-0000-4000-8000-000000000000', 'c0000002-0000-4000-a000-000000000000', '7777',
  now() + interval '1 hour', now() + interval '9 hours', '77002', 'Houston', 'TX', 29.7594, -95.3594,
  'A shift about to start.', 'Lee Yard', '+17135550100', 1);
insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status) values
  ('50000002-0000-4000-8000-000000000000', pg_temp.did('19'), 1, 1, '7777', 'sent');
update public.shifts set starts_at = now() - interval '1 minute' where id = '50000002-0000-4000-8000-000000000000';
select is((select outcome from public.claim_shift(pg_temp.did('19'), '7777')), 'closed', 'a shift past its start cannot be booked');
select ok(public.expire_shifts() >= 1, 'expire_shifts marks it');
select is((select status::text from public.shifts where id = '50000002-0000-4000-8000-000000000000'), 'expired', 'the shift is expired');
select is((select status::text from public.shifts where id = '50000001-0000-4000-8000-000000000000'), 'open', 'a future shift stays open');

select * from finish();
rollback;
