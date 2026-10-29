-- The self-reported Clearinghouse and SAP answer (0021): only a yes and the database's time;
-- the driver writes, withdraws and reads their own; admins read all; a subscribed carrier who
-- can read the driver's card still reads nothing here; anonymous is refused.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select has_table('public', 'driver_clearinghouse_self_reports', 'the self-report table exists');
select columns_are('public', 'driver_clearinghouse_self_reports', array['driver_id', 'confirmed', 'confirmed_at']);
select col_is_pk('public', 'driver_clearinghouse_self_reports', 'driver_id', 'one answer per driver');
select hasnt_column('public', 'drivers', 'clearinghouse_self_report', 'the answer is not a drivers column, which carriers can read');

-- ---------------------------------------------------------------------------
-- Fixtures: an admin, two drivers (the first listed: approved, complete, in Houston), a
-- carrier with an active subscription.
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('b1111111-1111-4111-8111-111111111111', '15555559201'),
  ('b2222222-2222-4222-8222-222222222222', '15555559202'),
  ('b3333333-3333-4333-8333-333333333333', '15555559203'),
  ('b4444444-4444-4444-8444-444444444444', '15555559204');

insert into public.profiles (id, role, phone, status) values
  ('b1111111-1111-4111-8111-111111111111', 'admin', '+15555559201', 'approved'),
  ('b2222222-2222-4222-8222-222222222222', 'driver', '+15555559202', 'approved'),
  ('b3333333-3333-4333-8333-333333333333', 'driver', '+15555559203', 'pending'),
  ('b4444444-4444-4444-8444-444444444444', 'carrier', '+15555559204', 'approved');

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, endorsements,
  years_experience, city, state, zip, lat, lng, transmission, equipment_types, twic_active,
  medical_card_active, mvr_status, onboarding_step, card_completed) values
  ('d2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222', 'Listed Driver', '{cdl_driver}', 'A', '{}',
   8, 'Houston', 'TX', '77002', 29.7594, -95.3594, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true),
  ('d3333333-3333-4333-8333-333333333333', 'b3333333-3333-4333-8333-333333333333', 'Other Driver', '{cdl_driver}', 'B', '{}',
   null, 'Houston', 'TX', '77002', 29.7594, -95.3594, null, '{}', null, null, null, 3, false);

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id) values
  ('c4444444-4444-4444-a444-444444444444', 'b4444444-4444-4444-8444-444444444444', 'Watching Freight', 'Sam Owner', 'sam@watching.example',
   'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_watch');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status) values
  ('c4444444-4444-4444-a444-444444444444', 'sub_watch', 'cus_watch', 'active');

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
-- A yes only, stamped by the database
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id, confirmed, confirmed_at)
    values ('d3333333-3333-4333-8333-333333333333', false, '2000-01-01')$$,
  'a row can be written');
select is(
  (select confirmed from public.driver_clearinghouse_self_reports where driver_id = 'd3333333-3333-4333-8333-333333333333'),
  true, 'a row is always a yes: a no is never stored');
select ok(
  (select confirmed_at > now() - interval '1 minute' from public.driver_clearinghouse_self_reports where driver_id = 'd3333333-3333-4333-8333-333333333333'),
  'the time is the database''s, not the one sent');
delete from public.driver_clearinghouse_self_reports where driver_id = 'd3333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------
-- The driver confirms, withdraws and confirms again; the other driver's row is out of reach
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b2222222-2222-4222-8222-222222222222', '+15555559202');
select lives_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id) values ('d2222222-2222-4222-8222-222222222222')$$,
  'a driver confirms their own answer');
select is((select count(*) from public.driver_clearinghouse_self_reports), 1::bigint, 'and reads it back');
select throws_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id) values ('d3333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'a driver cannot answer for another driver');
select lives_ok(
  $$delete from public.driver_clearinghouse_self_reports where driver_id = 'd2222222-2222-4222-8222-222222222222'$$,
  'a driver withdraws their answer');
select is_empty('select 1 from public.driver_clearinghouse_self_reports', 'withdrawn: the answer and its date are gone');
select lives_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id) values ('d2222222-2222-4222-8222-222222222222')$$,
  'and confirms again, with a new time');
select pg_temp.sign_out();

-- The other driver answers too, as themselves.
select pg_temp.sign_in('b3333333-3333-4333-8333-333333333333', '+15555559203');
select lives_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id) values ('d3333333-3333-4333-8333-333333333333')$$,
  'the second driver confirms their own');
select is((select count(*) from public.driver_clearinghouse_self_reports), 1::bigint, 'and sees only their own');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- An admin reads every answer and changes none
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b1111111-1111-4111-8111-111111111111', '+15555559201');
select is(
  (select count(*) from public.driver_clearinghouse_self_reports
    where driver_id in ('d2222222-2222-4222-8222-222222222222', 'd3333333-3333-4333-8333-333333333333')),
  2::bigint, 'an admin reads every answer');
select is_empty(
  $$delete from public.driver_clearinghouse_self_reports where driver_id = 'd2222222-2222-4222-8222-222222222222' returning 1$$,
  'an admin cannot delete a driver''s answer');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- A subscribed carrier reads the listed driver's card, and still nothing of this
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b4444444-4444-4444-8444-444444444444', '+15555559204');
select is(
  (select count(*) from public.drivers where id = 'd2222222-2222-4222-8222-222222222222'),
  1::bigint, 'the carrier can read the listed driver''s card');
select is_empty('select 1 from public.driver_clearinghouse_self_reports', 'but never the self-reported answer');
select throws_ok(
  $$insert into public.driver_clearinghouse_self_reports (driver_id) values ('d2222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'nor write one');
select pg_temp.sign_out();

set local role anon;
select throws_ok('select 1 from public.driver_clearinghouse_self_reports', '42501', null, 'anonymous cannot read it');
reset role;

-- ---------------------------------------------------------------------------
-- Deleting the card deletes the answer
-- ---------------------------------------------------------------------------
delete from public.drivers where id = 'd3333333-3333-4333-8333-333333333333';
select is_empty(
  $$select 1 from public.driver_clearinghouse_self_reports where driver_id = 'd3333333-3333-4333-8333-333333333333'$$,
  'the answer goes with the card');

select * from finish();
rollback;
