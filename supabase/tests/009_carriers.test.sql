-- The carrier side (0015, Milestone 2): carriers, subscriptions, webhook events, the
-- waitlist, the helpers, what a carrier may see of drivers, and the distance search.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'subscription_status',
  array['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']);

select has_table('public', 'carriers', 'carriers exists');
select has_table('public', 'subscriptions', 'subscriptions exists');
select has_table('public', 'webhook_events', 'webhook_events exists');
select has_table('public', 'carrier_waitlist', 'carrier_waitlist exists');

select columns_are('public', 'carriers', array[
  'id', 'profile_id', 'company_name', 'contact_name', 'billing_email', 'usdot', 'mc', 'city', 'state',
  'zip', 'lat', 'lng', 'stripe_customer_id', 'created_at', 'updated_at']);
select columns_are('public', 'subscriptions', array[
  'id', 'carrier_id', 'stripe_subscription_id', 'stripe_customer_id', 'status', 'price_id',
  'current_period_end', 'cancel_at_period_end', 'canceled_at', 'created_at', 'updated_at']);
select columns_are('public', 'webhook_events', array[
  'id', 'provider', 'event_id', 'type', 'created_at', 'updated_at']);
select columns_are('public', 'carrier_waitlist', array[
  'id', 'carrier_id', 'zip', 'lat', 'lng', 'created_at', 'updated_at']);

select col_is_unique('carriers', 'profile_id');
select col_is_unique('carriers', 'stripe_customer_id');
select fk_ok('public', 'carriers', 'profile_id', 'public', 'profiles', 'id');
select col_is_unique('subscriptions', 'stripe_subscription_id');
select fk_ok('public', 'subscriptions', 'carrier_id', 'public', 'carriers', 'id');
select col_default_is('subscriptions', 'cancel_at_period_end', 'false');
select col_is_unique('carrier_waitlist', 'carrier_id');
select fk_ok('public', 'carrier_waitlist', 'carrier_id', 'public', 'carriers', 'id');
select col_default_is('webhook_events', 'provider', 'stripe');
select has_index('public', 'subscriptions', 'subscriptions_carrier_id_idx', array['carrier_id']);
select has_index('public', 'carriers', 'carriers_zip_idx', array['zip']);
select has_trigger('carriers', 'carriers_set_updated_at');
select has_trigger('carriers', 'carriers_protect_columns');
select has_trigger('subscriptions', 'subscriptions_set_updated_at');

select function_returns('public', 'current_carrier_id', array[]::text[], 'uuid');
select function_returns('public', 'carrier_has_active_subscription', array[]::text[], 'boolean');
select function_returns('public', 'profile_status', array['uuid'], 'account_status');
select is_definer('public', 'current_carrier_id', array[]::text[]);
select is_definer('public', 'carrier_has_active_subscription', array[]::text[]);
select is_definer('public', 'profile_status', array['uuid']);
select isnt_definer('public', 'search_drivers', array[
  'double precision', 'double precision', 'integer', 'cdl_class', 'endorsement[]', 'integer',
  'boolean', 'boolean', 'boolean', 'equipment_type[]', 'mvr_status', 'integer', 'integer']);

-- ---------------------------------------------------------------------------
-- Fixtures. The seed's drivers and carriers go first (rolled back with everything else), so
-- the counts and the search results below are exact.
-- ---------------------------------------------------------------------------
delete from public.carriers;
delete from public.drivers;

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'), -- listed driver, Houston
  ('22222222-2222-4222-8222-222222222222', '15555559002'), -- listed driver, Pasadena, Class B, fewer letters
  ('33333333-3333-4333-8333-333333333333', '15555559003'), -- admin
  ('44444444-4444-4444-8444-444444444444', '15555559004'), -- carrier, subscribed, Houston yard
  ('55555555-5555-4555-8555-555555555555', '15555559005'), -- carrier, not subscribed
  ('66666666-6666-4666-8666-666666666666', '15555559006'), -- pending driver (not listed)
  ('77777777-7777-4777-8777-777777777777', '15555559007'), -- driver who declined shift texts (listed, marked)
  ('88888888-8888-4888-8888-888888888888', '15555559008'), -- Dallas driver, outside every area (not listed)
  ('99999999-9999-4999-8999-999999999999', '15555559009'); -- carrier whose subscription lapsed

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002', 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'carrier', '+15555559004', 'approved'),
  ('55555555-5555-4555-8555-555555555555', 'carrier', '+15555559005', 'pending'),
  ('66666666-6666-4666-8666-666666666666', 'driver', '+15555559006', 'pending'),
  ('77777777-7777-4777-8777-777777777777', 'driver', '+15555559007', 'approved'),
  ('88888888-8888-4888-8888-888888888888', 'driver', '+15555559008', 'approved'),
  ('99999999-9999-4999-8999-999999999999', 'carrier', '+15555559009', 'approved');

-- A complete card, consented unless told otherwise. Houston 77002 unless told otherwise.
create function pg_temp.card(p_id uuid, p_profile uuid, p_name text, p_lat numeric, p_lng numeric,
  p_class public.cdl_class default 'A', p_letters public.endorsement[] default '{H,N,T,X}',
  p_years int default 8, p_twic boolean default true, p_medical boolean default true,
  p_transmission public.transmission_type default 'manual_ok',
  p_equipment public.equipment_type[] default '{dry_van,flatbed,reefer}',
  p_mvr public.mvr_status default 'clean', p_opted_out boolean default false,
  p_opt_in boolean default true)
returns void language sql as $$
  insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, endorsements,
    years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
    twic_active, medical_card_active, mvr_status, sms_opt_in, sms_opt_in_at, sms_opt_in_text,
    sms_opted_out, sms_opted_out_at, onboarding_step, card_completed)
  values (p_id, p_profile, p_name, '{cdl_driver}', p_class, p_letters, p_years, 'Houston', 'TX', '77002',
    p_lat, p_lng, 50, p_transmission, p_equipment, p_twic, p_medical, p_mvr,
    p_opt_in, case when p_opt_in then now() end, case when p_opt_in then 'I agree' end,
    p_opted_out, case when p_opted_out then now() end, 12, true);
$$;

select pg_temp.card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Listed Houston', 29.7594, -95.3594);
select pg_temp.card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Listed Pasadena', 29.7009, -95.1989,
  'B', '{T}', 2, false, true, 'automatic_only', '{dry_van}', 'minor_1_2');
select pg_temp.card('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '66666666-6666-4666-8666-666666666666', 'Pending Houston', 29.7594, -95.3594);
-- Declined shift texts (0016): listed all the same, with the weakest card so the filters still
-- single out the Houston card.
select pg_temp.card('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '77777777-7777-4777-8777-777777777777', 'Declined texts Houston', 29.7594, -95.3594,
  'B', '{}', 1, false, true, 'automatic_only', '{dry_van}', 'major_3_plus', false, false);
select pg_temp.card('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '88888888-8888-4888-8888-888888888888', 'Dallas', 32.7904, -96.8044);

insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_front', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1.jpg', 'a1.jpg', 'image/jpeg', 1000),
  ('c0000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cdl_front', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/c1.jpg', 'c1.jpg', 'image/jpeg', 1000);

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id) values
  ('c0000000-0000-4000-a000-000000000011', '44444444-4444-4444-8444-444444444444', 'Subscribed Freight', 'Sam Owner', 'sam@subscribed.example', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_sub'),
  ('c0000000-0000-4000-a000-000000000012', '55555555-5555-4555-8555-555555555555', 'Unpaid Freight', 'Pat Owner', 'pat@unpaid.example', 'Houston', 'TX', '77002', 29.7594, -95.3594, null),
  ('c0000000-0000-4000-a000-000000000013', '99999999-9999-4999-8999-999999999999', 'Lapsed Freight', 'Lee Owner', 'lee@lapsed.example', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_lapsed');

insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values
  ('c0000000-0000-4000-a000-000000000011', 'sub_active', 'cus_sub', 'active'),
  ('c0000000-0000-4000-a000-000000000013', 'sub_lapsed', 'cus_lapsed', 'past_due');

create function pg_temp.sign_in(p_user uuid, p_phone text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'phone', p_phone)::text, true);
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
-- Constraints (as the privileged role)
-- ---------------------------------------------------------------------------
create function pg_temp.carrier_insert(p_set text) returns text language sql as $$
  select format($f$insert into public.carriers (profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng) values %s$f$, p_set);
$$;
select throws_ok(pg_temp.carrier_insert($$('44444444-4444-4444-8444-444444444444', 'Twice', 'Sam', 'sam@x.example', 'Houston', 'TX', '77002', 29.7594, -95.3594)$$),
  '23505', null, 'one carrier row per profile');
select throws_ok(
  $$update public.carriers set company_name = 'X' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'a one-letter company name is rejected');
select throws_ok(
  $$update public.carriers set billing_email = 'not-an-email' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'a malformed billing email is rejected');
select throws_ok(
  $$update public.carriers set usdot = '12A' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'a USDOT number must be digits');
select throws_ok(
  $$update public.carriers set mc = '123456789' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'an MC number has at most eight digits');
select lives_ok(
  $$update public.carriers set usdot = '12345678', mc = null where id = 'c0000000-0000-4000-a000-000000000011'$$,
  'USDOT and MC can be set and cleared');
select throws_ok(
  $$update public.carriers set zip = '7700' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'a four-digit yard ZIP is rejected');
select throws_ok(
  $$update public.carriers set state = 'tx' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '23514', null, 'a lowercase state is rejected');
select throws_ok(
  $$insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values ('c0000000-0000-4000-a000-000000000011', 'sub_active', 'cus_sub', 'active')$$,
  '23505', null, 'a Stripe subscription id is unique');
select throws_ok(
  $$insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values ('c0000000-0000-4000-a000-000000000011', 'sub_x', 'cus_sub', 'happy')$$,
  '22P02', null, 'an unknown subscription status is rejected');
select lives_ok(
  $$insert into public.webhook_events (event_id, type) values ('evt_1', 'invoice.paid')$$,
  'a webhook event is recorded');
select throws_ok(
  $$insert into public.webhook_events (event_id, type) values ('evt_1', 'invoice.paid')$$,
  '23505', null, 'the same event id is recorded once');
select throws_ok(
  $$insert into public.webhook_events (event_id, type) values (' ', 'invoice.paid')$$,
  '23514', null, 'a blank event id is rejected');
select throws_ok(
  $$insert into public.carrier_waitlist (carrier_id, zip, lat, lng) values ('c0000000-0000-4000-a000-000000000011', '770', 29.7594, -95.3594)$$,
  '23514', null, 'a waitlist ZIP must be five digits');

-- ---------------------------------------------------------------------------
-- Subscribed carrier
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-8444-444444444444', '15555559004');
select is(public.current_carrier_id(), 'c0000000-0000-4000-a000-000000000011'::uuid, 'current_carrier_id() is the own carrier row');
select is(public.carrier_has_active_subscription(), true, 'an active subscription counts');
select results_eq(
  'select company_name from public.carriers',
  $$values ('Subscribed Freight')$$,
  'a carrier sees only their own carrier row');
select isnt_empty(
  $$update public.carriers set contact_name = 'Sam Updated' where id = 'c0000000-0000-4000-a000-000000000011' returning 1$$,
  'a carrier can update their own row');
select is_empty(
  $$update public.carriers set contact_name = 'Hacked' where id = 'c0000000-0000-4000-a000-000000000012' returning 1$$,
  'a carrier cannot update another carrier');
select throws_ok(
  $$update public.carriers set stripe_customer_id = 'cus_fake' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '42501', null, 'a carrier cannot set their own Stripe customer id');
select throws_ok(
  $$update public.carriers set profile_id = '55555555-5555-4555-8555-555555555555' where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '42501', null, 'a carrier cannot give their row to another profile');
select throws_ok(
  $$delete from public.carriers where id = 'c0000000-0000-4000-a000-000000000011'$$,
  '42501', null, 'a carrier cannot delete their carrier row directly');
select results_eq(
  'select stripe_subscription_id from public.subscriptions',
  $$values ('sub_active')$$,
  'a carrier sees only their own subscription');
select throws_ok(
  $$insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values ('c0000000-0000-4000-a000-000000000011', 'sub_forged', 'cus_sub', 'active')$$,
  '42501', null, 'a carrier cannot create a subscription');
select throws_ok(
  $$update public.subscriptions set status = 'active' where stripe_subscription_id = 'sub_active'$$,
  '42501', null, 'a carrier cannot edit a subscription');
select throws_ok(
  $$select 1 from public.webhook_events$$,
  '42501', null, 'a carrier cannot read webhook events');
select is_empty('select 1 from public.profiles where id <> auth.uid()', 'a carrier reads no other profile, so no driver phone number');

-- Listed drivers only: approved, complete, inside an active area. Shift-text consent does not
-- gate the listing (0016); the carrier sees the flag and the app shows "No shift texts".
select results_eq(
  'select full_name from public.drivers order by full_name',
  $$values ('Declined texts Houston'), ('Listed Houston'), ('Listed Pasadena')$$,
  'a subscribed carrier sees the listed cards and nothing else');
select results_eq(
  $$select sms_opt_in from public.drivers where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  $$values (false)$$,
  'and can tell that a listed driver declined shift texts');
select is_empty(
  $$update public.drivers set full_name = 'Hacked' returning 1$$,
  'a subscribed carrier cannot edit a card');
select results_eq(
  'select id from public.driver_documents',
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid)$$,
  'a subscribed carrier sees the documents of listed drivers only');
select is_empty(
  $$delete from public.driver_documents returning 1$$,
  'a subscribed carrier cannot delete a document');

-- The search from the Houston yard.
select results_eq(
  $$select driver_id, total_count from public.search_drivers(29.7594, -95.3594, 50)$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 3::bigint), ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid, 3::bigint), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 3::bigint)$$,
  'the search returns the listed cards within the radius, nearest first, with the total');
select results_eq(
  $$select distance_miles from public.search_drivers(29.7594, -95.3594, 50) order by distance_miles$$,
  $$values (0.0::numeric), (0.0::numeric), (10.4::numeric)$$,
  'distances are miles from the yard to a tenth');
select is_empty(
  $$select 1 from public.search_drivers(29.7594, -95.3594, 5) where driver_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'a smaller radius drops the farther card');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_cdl_class => 'A')$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'Class A filters to Class A');
select is(
  (select count(*) from public.search_drivers(29.7594, -95.3594, 50, p_cdl_class => 'B')),
  3::bigint,
  'Class B matches A and B (meets or exceeds)');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_endorsements => '{H,T}')$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'every requested endorsement must be on the card');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_min_years => 5)$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'minimum years');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_twic => false)$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)$$,
  'TWIC filter');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_manual => true)$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'manual required');
select is(
  (select count(*) from public.search_drivers(29.7594, -95.3594, 50, p_manual => false)),
  3::bigint,
  'manual not required matches everyone');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_equipment => '{flatbed}')$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'every requested kind of equipment must be on the card');
select results_eq(
  $$select driver_id from public.search_drivers(29.7594, -95.3594, 50, p_mvr_max => 'clean')$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'a clean record only');
select is(
  (select count(*) from public.search_drivers(29.7594, -95.3594, 50, p_mvr_max => 'minor_1_2')),
  2::bigint,
  'up to 1 or 2 minor matches both');
select results_eq(
  $$select driver_id, total_count from public.search_drivers(29.7594, -95.3594, 50, p_limit => 1, p_offset => 1)$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid, 3::bigint)$$,
  'paging keeps the total');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Carrier without a subscription, and one whose subscription lapsed
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('55555555-5555-4555-8555-555555555555', '15555559005');
select is(public.carrier_has_active_subscription(), false, 'no subscription, no access');
select is_empty('select 1 from public.drivers', 'an unsubscribed carrier sees no cards');
select is_empty('select 1 from public.driver_documents', 'an unsubscribed carrier sees no documents');
select is_empty($$select 1 from public.search_drivers(29.7594, -95.3594, 50)$$, 'and the search is empty');
select lives_ok(
  $$insert into public.carrier_waitlist (carrier_id, zip, lat, lng) values ('c0000000-0000-4000-a000-000000000012', '77002', 29.7594, -95.3594)$$,
  'a carrier can join the waitlist');
select throws_ok(
  $$insert into public.carrier_waitlist (carrier_id, zip, lat, lng) values ('c0000000-0000-4000-a000-000000000011', '77002', 29.7594, -95.3594)$$,
  '42501', null, 'a carrier cannot put another carrier on the waitlist');
select results_eq(
  'select carrier_id from public.carrier_waitlist',
  $$values ('c0000000-0000-4000-a000-000000000012'::uuid)$$,
  'a carrier sees only their own waitlist row');
select pg_temp.sign_out();

select pg_temp.sign_in('99999999-9999-4999-8999-999999999999', '15555559009');
select is(public.carrier_has_active_subscription(), false, 'past_due is not active');
select is_empty('select 1 from public.drivers', 'a lapsed carrier sees no cards');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Drivers and admins
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');
select is_empty('select 1 from public.carriers', 'a driver sees no carriers');
select is_empty('select 1 from public.subscriptions', 'a driver sees no subscriptions');
select is_empty('select 1 from public.carrier_waitlist', 'a driver sees no waitlist');
select throws_ok(
  pg_temp.carrier_insert($$('11111111-1111-4111-8111-111111111111', 'Driver Co', 'Pat', 'pat@x.example', 'Houston', 'TX', '77002', 29.7594, -95.3594)$$),
  '42501', null, 'a driver cannot create a carrier row');
select results_eq(
  'select id from public.drivers',
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'a driver still sees only their own card');
select pg_temp.sign_out();

select pg_temp.sign_in('33333333-3333-4333-8333-333333333333', '15555559003');
select is((select count(*) from public.carriers), 3::bigint, 'an admin sees every carrier');
select is((select count(*) from public.subscriptions), 2::bigint, 'an admin sees every subscription');
select is((select count(*) from public.carrier_waitlist), 1::bigint, 'an admin sees the waitlist');
select throws_ok($$select 1 from public.webhook_events$$, '42501', null, 'webhook events are for the service role only');
select pg_temp.sign_out();

-- Anonymous: nothing
set local role anon;
select throws_ok('select 1 from public.carriers', '42501', null, 'anon cannot read carriers');
select throws_ok('select 1 from public.subscriptions', '42501', null, 'anon cannot read subscriptions');
select throws_ok('select 1 from public.carrier_waitlist', '42501', null, 'anon cannot read the waitlist');
select throws_ok($$select public.search_drivers(29.7594, -95.3594, 50)$$, '42501', null, 'anon cannot search');
reset role;

-- Cascade: deleting the auth user takes the carrier, subscription and waitlist rows with it.
delete from auth.users where id = '55555555-5555-4555-8555-555555555555';
select is((select count(*) from public.carriers where id = 'c0000000-0000-4000-a000-000000000012'), 0::bigint, 'deleting the user deletes the carrier');
select is((select count(*) from public.carrier_waitlist where carrier_id = 'c0000000-0000-4000-a000-000000000012'), 0::bigint, 'and the waitlist row');
delete from auth.users where id = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from public.subscriptions where stripe_subscription_id = 'sub_active'), 0::bigint, 'and the subscription');

select * from finish();
rollback;
