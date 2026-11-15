-- 0039: an admin acts as an admin only in a session that signed in with a password and passed
-- the authenticator step; admins may be email-only; drivers and carriers are unaffected.
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('e0000051-0000-4000-8000-000000000000', '15555559451'),
  ('e0000052-0000-4000-8000-000000000000', '15555559452');
insert into auth.users (id, email) values ('e0000053-0000-4000-8000-000000000000', 'boss@fleetgrid.test');
insert into public.profiles (id, role, phone, email, status) values
  ('e0000051-0000-4000-8000-000000000000', 'admin', '+15555559451', null, 'approved'),
  ('e0000052-0000-4000-8000-000000000000', 'driver', '+15555559452', null, 'pending'),
  ('e0000053-0000-4000-8000-000000000000', 'admin', null, 'boss@fleetgrid.test', 'approved');

-- A session as the given user, with the given assurance level and sign-in methods.
create function pg_temp.session(p_user text, p_aal text, p_methods text[]) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'amr', (select coalesce(json_agg(json_build_object('method', m)), '[]'::json) from unnest(p_methods) as m)
  )::text, true);
$$;

-- A phone-code session: no admin access, however strong the second factor.
select pg_temp.session('e0000051-0000-4000-8000-000000000000', 'aal1', array['otp']);
set local role authenticated;
select is(public.auth_role(), null, 'a phone-code admin session has no role');
select ok(not public.is_admin(), 'and is not an admin');
select is((select count(*)::int from public.profiles), 1, 'it reads only its own profile');
select throws_ok($$ select * from public.write_admin_audit('driver_approved', 'driver', gen_random_uuid()) $$, '42501', null, 'and writes no audit entry');
reset role;

select pg_temp.session('e0000051-0000-4000-8000-000000000000', 'aal2', array['otp', 'totp']);
set local role authenticated;
select ok(not public.is_admin(), 'a phone code plus an authenticator is still not enough');
reset role;

-- A password without the authenticator step: still nothing.
select pg_temp.session('e0000051-0000-4000-8000-000000000000', 'aal1', array['password']);
set local role authenticated;
select ok(not public.is_admin(), 'a password alone is not enough');
select is((select count(*)::int from public.admin_audit_log), 0, 'and reads no audit log');
reset role;

-- Password plus authenticator: an admin.
select pg_temp.session('e0000051-0000-4000-8000-000000000000', 'aal2', array['password', 'totp']);
set local role authenticated;
select is(public.auth_role()::text, 'admin', 'a password plus the authenticator is an admin');
select ok(public.is_admin(), 'with admin access');
select ok((select count(*)::int from public.profiles) >= 3, 'that reads every profile');
select lives_ok($$ select * from public.write_admin_audit('driver_approved', 'driver', 'e0000052-0000-4000-8000-000000000000') $$, 'and writes the audit log');
reset role;
select results_eq(
  $$ select admin_phone, admin_email from public.admin_audit_log where admin_id = 'e0000051-0000-4000-8000-000000000000' $$,
  $$ values ('+15555559451'::text, null::text) $$,
  'named by its phone'
);

-- An email-only admin: no phone at all, named by email in the audit log.
select pg_temp.session('e0000053-0000-4000-8000-000000000000', 'aal2', array['password', 'totp']);
set local role authenticated;
select ok(public.is_admin(), 'an email-only admin is an admin with a strong session');
select lives_ok($$ select * from public.write_admin_audit('driver_blocked', 'driver', 'e0000052-0000-4000-8000-000000000000') $$, 'and writes the audit log');
reset role;
select results_eq(
  $$ select admin_phone, admin_email from public.admin_audit_log where admin_id = 'e0000053-0000-4000-8000-000000000000' $$,
  $$ values (null::text, 'boss@fleetgrid.test'::text) $$,
  'named by its email'
);

-- Drivers are unaffected: a phone-code session keeps its role.
select pg_temp.session('e0000052-0000-4000-8000-000000000000', 'aal1', array['otp']);
set local role authenticated;
select is(public.auth_role()::text, 'driver', 'a driver with a phone code is a driver');
select throws_ok($$ update public.profiles set email = 'me@example.com' where id = 'e0000052-0000-4000-8000-000000000000' $$, '42501', null, 'and cannot set an email on the profile');
reset role;

-- Who may have no phone: only an admin with an email.
insert into auth.users (id, email) values ('e0000054-0000-4000-8000-000000000000', 'nobody@fleetgrid.test');
select throws_ok($$ insert into public.profiles (id, role, phone, status) values ('e0000054-0000-4000-8000-000000000000', 'driver', null, 'pending') $$,
  '23514', null, 'a driver needs a phone');
select throws_ok($$ insert into public.profiles (id, role, phone, email, status) values ('e0000054-0000-4000-8000-000000000000', 'admin', null, null, 'approved') $$,
  '23514', null, 'an admin needs a phone or an email');
select throws_ok($$ insert into public.profiles (id, role, phone, email, status) values ('e0000054-0000-4000-8000-000000000000', 'admin', null, 'BOSS@fleetgrid.test', 'approved') $$,
  '23505', null, 'an email belongs to one account, whatever its case');
select throws_ok($$ insert into public.profiles (id, role, phone, email, status) values ('e0000054-0000-4000-8000-000000000000', 'admin', null, 'not-an-email', 'approved') $$,
  '23514', null, 'and looks like an email');

select * from finish();
rollback;
