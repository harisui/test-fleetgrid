-- 0027: the CDL state: a known code, nullable for old cards, set and changed by the driver,
-- never cleared by them.
begin;
select no_plan();

select has_column('public', 'drivers', 'cdl_state', 'drivers carry the CDL state');
select col_type_is('public', 'drivers', 'cdl_state', 'character(2)', 'two letters');
select col_is_null('public', 'drivers', 'cdl_state', 'nullable, for cards saved before CR-5');

insert into auth.users (id, phone) values ('e0000041-0000-4000-8000-000000000000', '15555559641');
insert into public.profiles (id, role, phone, status) values ('e0000041-0000-4000-8000-000000000000', 'driver', '+15555559641', 'pending');
insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step)
values ('d0000041-0000-4000-8000-000000000000', 'e0000041-0000-4000-8000-000000000000', 'Tex Driver', '{cdl_driver}', 2);

select throws_ok($$ update public.drivers set cdl_state = 'ZZ' where id = 'd0000041-0000-4000-8000-000000000000' $$,
  '23514', null, 'an unknown code is refused');
select throws_ok($$ update public.drivers set cdl_state = 'tx' where id = 'd0000041-0000-4000-8000-000000000000' $$,
  '23514', null, 'lower case is refused');

select set_config('request.jwt.claims', json_build_object('sub', 'e0000041-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ update public.drivers set cdl_state = 'TX' where id = 'd0000041-0000-4000-8000-000000000000' $$, 'the driver sets it');
select lives_ok($$ update public.drivers set cdl_state = 'DC' where id = 'd0000041-0000-4000-8000-000000000000' $$, 'and changes it (DC counts)');
select throws_ok($$ update public.drivers set cdl_state = null where id = 'd0000041-0000-4000-8000-000000000000' $$,
  '23514', null, 'but never clears it');
reset role;
select is((select cdl_state::text from public.drivers where id = 'd0000041-0000-4000-8000-000000000000'), 'DC', 'the last answer stays');
select lives_ok($$ update public.drivers set cdl_state = null where id = 'd0000041-0000-4000-8000-000000000000' $$, 'the service role may clear it');

select * from finish();
rollback;
