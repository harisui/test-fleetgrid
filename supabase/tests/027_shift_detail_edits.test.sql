-- 0037: a carrier edits only the details of a shift still live, each change on record, no way to
-- reach the time, place or requirements, and no way in from a signed-in session.
begin;
select no_plan();

insert into auth.users (id, phone) values ('e0000051-0000-4000-8000-000000000000', '15555559151');
insert into public.profiles (id, role, phone, status) values ('e0000051-0000-4000-8000-000000000000', 'carrier', '+15555559151', 'approved');
insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng)
values ('c0000051-0000-4000-a000-000000000000', 'e0000051-0000-4000-8000-000000000000', 'Edit Freight', 'Sam Owner', 'sam@edit.test', 'Houston', 'TX', '77002', 29.7594, -95.3594);

create function pg_temp.shift(n text, st public.shift_status, hours integer) returns uuid language sql as $$
  insert into public.shifts (id, carrier_id, short_code, status, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, pay_text, broadcast_round, cancelled_at)
  values (('800000' || n || '-0000-4000-8000-000000000000')::uuid, 'c0000051-0000-4000-a000-000000000000', '51' || n, st,
    now() + make_interval(hours => hours - 8), now() + make_interval(hours => hours), '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Yard moves before the edit.', 'Lee Yard', '+17135550100', '$30 an hour', 1, case when st = 'cancelled' then now() end)
  returning id;
$$;
select pg_temp.shift('01', 'open', 48);
select pg_temp.shift('02', 'cancelled', 48);
select pg_temp.shift('03', 'open', 48);
-- Posted in the future, then its time passes.
update public.shifts set starts_at = now() - interval '9 hours', ends_at = now() - interval '1 hour' where id = '80000003-0000-4000-8000-000000000000';

create function pg_temp.edit(n text, work text) returns setof public.shifts language sql as $$
  select * from public.edit_shift_details(('800000' || n || '-0000-4000-8000-000000000000')::uuid, 'e0000051-0000-4000-8000-000000000000', work, 'Ana Gate', '+17135550111', null);
$$;

select is((select work_description from pg_temp.edit('01', 'Yard moves after the edit.')), 'Yard moves after the edit.', 'the work is changed');
select results_eq(
  $$ select onsite_contact_name, onsite_contact_phone, pay_text from public.shifts where id = '80000001-0000-4000-8000-000000000000' $$,
  $$ values ('Ana Gate'::text, '+17135550111'::text, null::text) $$,
  'the contact and the pay too');
select results_eq(
  $$ select detail->>'by', detail #>> '{changes,work_description,from}', detail #>> '{changes,onsite_contact_name,to}', detail #>> '{changes,pay_text,from}'
     from public.shift_events where shift_id = '80000001-0000-4000-8000-000000000000' and kind = 'edited' $$,
  $$ values ('e0000051-0000-4000-8000-000000000000'::text, 'Yard moves before the edit.'::text, 'Ana Gate'::text, '$30 an hour'::text) $$,
  'on record: who, and each old and new value');

select is((select count(*)::int from pg_temp.edit('01', 'Yard moves after the edit.')), 1, 'the same values again answer with the shift');
select is((select count(*)::int from public.shift_events where shift_id = '80000001-0000-4000-8000-000000000000' and kind = 'edited'), 1, 'and record nothing new');

select is((select count(*)::int from pg_temp.edit('02', 'Too late for this one.')), 0, 'a cancelled shift cannot be edited');
select is((select count(*)::int from pg_temp.edit('03', 'Too late for this one.')), 0, 'nor one that is over');
select is((select work_description from public.shifts where id = '80000002-0000-4000-8000-000000000000'), 'Yard moves before the edit.', 'the cancelled shift is unchanged');

select throws_ok($$ delete from public.shift_events where kind = 'edited' $$, null, null, 'the record cannot be removed');
select ok(not has_function_privilege('authenticated', 'public.edit_shift_details(uuid, uuid, text, text, text, text)', 'execute'), 'a signed-in session cannot call it');
select ok(not has_function_privilege('anon', 'public.edit_shift_details(uuid, uuid, text, text, text, text)', 'execute'), 'nor a visitor');

select * from finish();
rollback;
