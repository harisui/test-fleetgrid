-- RLS: profiles and tos_acceptances
begin;
select no_plan();

-- Fixtures (created as postgres, which bypasses RLS)
insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'), -- driver A
  ('22222222-2222-4222-8222-222222222222', '15555559002'), -- driver B
  ('33333333-3333-4333-8333-333333333333', '15555559003'), -- admin
  ('44444444-4444-4444-8444-444444444444', '15555559004'), -- carrier
  ('55555555-5555-4555-8555-555555555555', '15555559005'), -- signed in, no profile yet
  ('66666666-6666-4666-8666-666666666666', '15555559006'); -- signed in, no profile yet

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'pending'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002', 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'carrier', '+15555559004', 'pending');

insert into public.tos_acceptances (profile_id, version) values
  ('11111111-1111-4111-8111-111111111111', 'v1'),
  ('44444444-4444-4444-8444-444444444444', 'v1');

create function pg_temp.sign_in(p_user uuid, p_phone text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'phone', p_phone)::text,
    true
  );
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
-- RLS is on
-- ---------------------------------------------------------------------------
select ok(relrowsecurity, relname || ' has RLS enabled')
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('profiles', 'drivers', 'driver_documents', 'tos_acceptances');

select is(
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'no table in public ships without RLS'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors: nothing
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.drivers', '42501', null, 'anon cannot read drivers');
select throws_ok('select * from public.driver_documents', '42501', null, 'anon cannot read driver_documents');
select throws_ok('select * from public.tos_acceptances', '42501', null, 'anon cannot read tos_acceptances');
select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('55555555-5555-4555-8555-555555555555', 'driver', '+15555559005')$$,
  '42501', null, 'anon cannot insert profiles'
);
select throws_ok($$update public.profiles set status = 'approved'$$, '42501', null, 'anon cannot update profiles');
select throws_ok('delete from public.profiles', '42501', null, 'anon cannot delete profiles');
select throws_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('11111111-1111-4111-8111-111111111111', 'v2')$$,
  '42501', null, 'anon cannot insert tos_acceptances'
);
reset role;

-- ---------------------------------------------------------------------------
-- Driver A: own profile only
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');

select results_eq(
  'select id from public.profiles',
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'a driver sees only their own profile'
);
select is_empty(
  $$select 1 from public.profiles where id = '22222222-2222-4222-8222-222222222222'$$,
  'a driver cannot read another profile'
);
select is_empty(
  $$update public.profiles set updated_at = now() where id = '22222222-2222-4222-8222-222222222222' returning 1$$,
  'a driver cannot update another profile'
);
select isnt_empty(
  $$update public.profiles set updated_at = now() where id = '11111111-1111-4111-8111-111111111111' returning 1$$,
  'a driver can update their own profile row'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a driver cannot make themselves admin'
);
select throws_ok(
  $$update public.profiles set status = 'approved' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a driver cannot approve themselves'
);
select is_empty(
  $$delete from public.profiles where id = '11111111-1111-4111-8111-111111111111' returning 1$$,
  'a driver cannot delete their own profile'
);
select is_empty(
  $$delete from public.profiles where id = '22222222-2222-4222-8222-222222222222' returning 1$$,
  'a driver cannot delete another profile'
);
select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('11111111-1111-4111-8111-111111111111', 'carrier', '+15555559001')$$,
  '23505', null, 'a profile can be created only once'
);

-- tos_acceptances
select results_eq(
  'select profile_id from public.tos_acceptances',
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'a driver sees only their own terms acceptances'
);
select lives_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('11111111-1111-4111-8111-111111111111', 'v2')$$,
  'a driver can accept terms for themselves'
);
select throws_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('22222222-2222-4222-8222-222222222222', 'v2')$$,
  '42501', null, 'a driver cannot accept terms for someone else'
);
select throws_ok(
  $$update public.tos_acceptances set version = 'v9'$$,
  '42501', null, 'terms acceptances cannot be edited'
);
select throws_ok(
  'delete from public.tos_acceptances',
  '42501', null, 'terms acceptances cannot be deleted'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Carrier: own profile only
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-8444-444444444444', '15555559004');
select results_eq(
  'select id from public.profiles',
  $$values ('44444444-4444-4444-8444-444444444444'::uuid)$$,
  'a carrier sees only their own profile'
);
select isnt_empty(
  $$update public.profiles set updated_at = now() where id = '44444444-4444-4444-8444-444444444444' returning 1$$,
  'a carrier can update their own profile row'
);
select throws_ok(
  $$update public.profiles set status = 'approved' where id = '44444444-4444-4444-8444-444444444444'$$,
  '42501', null, 'a carrier cannot approve themselves'
);
select results_eq(
  'select profile_id from public.tos_acceptances',
  $$values ('44444444-4444-4444-8444-444444444444'::uuid)$$,
  'a carrier sees only their own terms acceptances'
);
select lives_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('44444444-4444-4444-8444-444444444444', 'v2')$$,
  'a carrier can accept terms for themselves'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Profile creation rules
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('55555555-5555-4555-8555-555555555555', '15555559005');
select is_empty('select 1 from public.profiles', 'a user without a profile sees no profiles');
select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('55555555-5555-4555-8555-555555555555', 'admin', '+15555559005')$$,
  '42501', null, 'nobody can sign up as admin'
);
select throws_ok(
  $$insert into public.profiles (id, role, phone, status) values ('55555555-5555-4555-8555-555555555555', 'driver', '+15555559005', 'approved')$$,
  '42501', null, 'nobody can sign up pre-approved'
);
select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('66666666-6666-4666-8666-666666666666', 'driver', '+15555559006')$$,
  '42501', null, 'a profile cannot be created for another user'
);
select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('55555555-5555-4555-8555-555555555555', 'driver', '+15555559999')$$,
  '42501', null, 'the profile phone must be the verified phone'
);
select lives_ok(
  $$insert into public.profiles (id, role, phone) values ('55555555-5555-4555-8555-555555555555', 'driver', '+15555559005')$$,
  'a user can create their own driver profile'
);
select pg_temp.sign_out();

select pg_temp.sign_in('66666666-6666-4666-8666-666666666666', '15555559006');
select lives_ok(
  $$insert into public.profiles (id, role, phone) values ('66666666-6666-4666-8666-666666666666', 'carrier', '+15555559006')$$,
  'a user can create their own carrier profile'
);
select pg_temp.sign_out();

select results_eq(
  $$select role::text, status::text from public.profiles where id in ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666') order by 1$$,
  $$values ('carrier', 'pending'), ('driver', 'pending')$$,
  'self-created profiles are pending'
);

-- ---------------------------------------------------------------------------
-- Admin: everything
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-4333-8333-333333333333', '15555559003');
select cmp_ok((select count(*) from public.profiles), '>=', 6::bigint, 'an admin sees all profiles');
select isnt_empty(
  $$update public.profiles set status = 'blocked' where id = '11111111-1111-4111-8111-111111111111' returning 1$$,
  'an admin can update any profile'
);
select cmp_ok((select count(*) from public.tos_acceptances), '>=', 4::bigint, 'an admin sees all terms acceptances');
select throws_ok(
  'delete from public.tos_acceptances',
  '42501', null, 'even an admin cannot delete terms acceptances'
);
select isnt_empty(
  $$delete from public.profiles where id = '66666666-6666-4666-8666-666666666666' returning 1$$,
  'an admin can delete a profile'
);
select pg_temp.sign_out();

select * from finish();
rollback;
