-- The admin audit log (0017): shape, who writes it, who reads it, and that nobody signed in
-- can change or remove an entry. Also: admins, and only admins, read the service areas.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select has_table('public', 'admin_audit_log', 'admin_audit_log exists');
select columns_are('public', 'admin_audit_log', array[
  'id', 'admin_id', 'admin_phone', 'action', 'target_type', 'target_id', 'detail', 'created_at']);
select col_default_is('admin_audit_log', 'detail', '{}');
select has_index('public', 'admin_audit_log', 'admin_audit_log_target_idx', array['target_type', 'target_id', 'created_at']);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('a1111111-1111-4111-8111-111111111111', '15555559101'), -- admin
  ('a2222222-2222-4222-8222-222222222222', '15555559102'), -- another admin
  ('a3333333-3333-4333-8333-333333333333', '15555559103'), -- driver
  ('a4444444-4444-4444-8444-444444444444', '15555559104'); -- carrier

insert into public.profiles (id, role, phone, status) values
  ('a1111111-1111-4111-8111-111111111111', 'admin', '+15555559101', 'approved'),
  ('a2222222-2222-4222-8222-222222222222', 'admin', '+15555559102', 'approved'),
  ('a3333333-3333-4333-8333-333333333333', 'driver', '+15555559103', 'pending'),
  ('a4444444-4444-4444-8444-444444444444', 'carrier', '+15555559104', 'approved');

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
-- Constraints (as the owner)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id)
    values ('a1111111-1111-4111-8111-111111111111', '+15555559101', 'Driver Approved', 'driver', 'a3333333-3333-4333-8333-333333333333')$$,
  '23514', null, 'the action is a lowercase snake_case word');
select throws_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id)
    values ('a1111111-1111-4111-8111-111111111111', '+15555559101', 'driver_approved', 'shift', 'a3333333-3333-4333-8333-333333333333')$$,
  '23514', null, 'the target type is one of the known kinds');
select throws_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id)
    values ('a1111111-1111-4111-8111-111111111111', '5555559101', 'driver_approved', 'driver', 'a3333333-3333-4333-8333-333333333333')$$,
  '23514', null, 'the admin phone is E.164');

-- ---------------------------------------------------------------------------
-- An admin writes in their own name and reads everything
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1111111-1111-4111-8111-111111111111', '+15555559101');
select lives_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id, detail)
    values ('a1111111-1111-4111-8111-111111111111', '+15555559101', 'driver_approved', 'driver', 'a3333333-3333-4333-8333-333333333333', '{"from": "pending", "to": "approved"}')$$,
  'an admin writes an entry in their own name');
select throws_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id)
    values ('a2222222-2222-4222-8222-222222222222', '+15555559102', 'driver_blocked', 'driver', 'a3333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'an admin cannot write an entry in another admin''s name');
-- The local database may carry entries from other test runs (the log has no foreign key to
-- clean through), so every count below is for this file's driver.
create function pg_temp.mine() returns bigint language sql as $$
  select count(*) from public.admin_audit_log where target_id = 'a3333333-3333-4333-8333-333333333333';
$$;
select is(pg_temp.mine(), 1::bigint, 'an admin reads the log');
select is(
  (select detail->>'to' from public.admin_audit_log
    where target_id = 'a3333333-3333-4333-8333-333333333333' and action = 'driver_approved'),
  'approved', 'the detail is kept as given');

-- No update or delete grant, let alone a policy: the statements are refused outright.
select throws_ok(
  $$update public.admin_audit_log set action = 'driver_blocked' where target_id = 'a3333333-3333-4333-8333-333333333333'$$,
  '42501', null, 'an admin cannot change an entry');
select throws_ok(
  $$delete from public.admin_audit_log where target_id = 'a3333333-3333-4333-8333-333333333333'$$,
  '42501', null, 'an admin cannot delete an entry');
select is(pg_temp.mine(), 1::bigint, 'the entry is still there');

-- Admins read the service areas; the launch rows are there.
select ok((select count(*) from public.service_areas) >= 2, 'an admin reads the service areas');
select pg_temp.sign_out();

-- The other admin reads the first one's entry.
select pg_temp.sign_in('a2222222-2222-4222-8222-222222222222', '+15555559102');
select is(pg_temp.mine(), 1::bigint, 'every admin reads every entry');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- A driver and a carrier see and write nothing
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a3333333-3333-4333-8333-333333333333', '+15555559103');
select is_empty('select 1 from public.admin_audit_log', 'a driver reads no entries at all');
select throws_ok(
  $$insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id)
    values ('a3333333-3333-4333-8333-333333333333', '+15555559103', 'driver_approved', 'driver', 'a3333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'a driver cannot write an entry');
select is_empty('select 1 from public.service_areas', 'a driver reads no service areas');
select pg_temp.sign_out();

select pg_temp.sign_in('a4444444-4444-4444-8444-444444444444', '+15555559104');
select is_empty('select 1 from public.admin_audit_log', 'a carrier reads no entries');
select is_empty('select 1 from public.service_areas', 'a carrier reads no service areas');
select pg_temp.sign_out();

-- Anonymous: nothing.
set local role anon;
select throws_ok('select 1 from public.admin_audit_log', '42501', null, 'anon cannot read the log');
select throws_ok('select 1 from public.service_areas', '42501', null, 'anon cannot read the service areas');
reset role;

select * from finish();
rollback;
