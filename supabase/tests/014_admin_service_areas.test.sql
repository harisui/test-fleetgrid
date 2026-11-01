-- 0024: admins add and edit service areas; nobody else writes them; nobody deletes them.
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('f1111111-1111-4111-8111-111111111111', '15555559401'),
  ('f2222222-2222-4222-8222-222222222222', '15555559402'),
  ('f3333333-3333-4333-8333-333333333333', '15555559403');
insert into public.profiles (id, role, phone, status) values
  ('f1111111-1111-4111-8111-111111111111', 'admin', '+15555559401', 'approved'),
  ('f2222222-2222-4222-8222-222222222222', 'carrier', '+15555559402', 'approved'),
  ('f3333333-3333-4333-8333-333333333333', 'driver', '+15555559403', 'approved');

create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select pg_temp.sign_in('f1111111-1111-4111-8111-111111111111');
select lives_ok($$
  insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
  values ('Test Area 0024', '75201', 32.7904, -96.8044, 40)
$$, 'an admin adds an area');
select lives_ok($$ update public.service_areas set radius_miles = 60 where name = 'Test Area 0024' $$, 'an admin edits it');
select is((select radius_miles from public.service_areas where name = 'Test Area 0024'), 60, 'the edit is saved');
select lives_ok($$ update public.service_areas set is_active = false where name = 'Test Area 0024' $$, 'an admin deactivates it');
select throws_ok($$ update public.service_areas set radius_miles = 300 where name = 'Test Area 0024' $$,
  '23514', null, 'the radius stays between 5 and 250');
select throws_ok($$ delete from public.service_areas where name = 'Test Area 0024' $$, '42501', null, 'nobody deletes an area');
select pg_temp.sign_out();

select pg_temp.sign_in('f2222222-2222-4222-8222-222222222222');
select throws_ok($$
  insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
  values ('Carrier Area', '75201', 32.7904, -96.8044, 40)
$$, '42501', null, 'a carrier cannot add an area');
update public.service_areas set radius_miles = 5 where name = 'Test Area 0024';
select pg_temp.sign_out();
select is((select radius_miles from public.service_areas where name = 'Test Area 0024'), 60, 'a carrier''s update changes nothing');

select pg_temp.sign_in('f3333333-3333-4333-8333-333333333333');
select throws_ok($$
  insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
  values ('Driver Area', '75201', 32.7904, -96.8044, 40)
$$, '42501', null, 'a driver cannot add an area');
select pg_temp.sign_out();

select * from finish();
rollback;
