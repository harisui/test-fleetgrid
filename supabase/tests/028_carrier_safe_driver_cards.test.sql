-- 0038: a carrier reads a driver only through carrier_driver_cards(), and never reliability data,
-- by any path: the table, a view, a function or Realtime. An admin still can; a driver reads only
-- their own card.
begin;
select no_plan();

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555592' || n from unnest(array['71', '72', '73', '74', '75', '76']) as n;
insert into public.profiles (id, role, phone, status)
values ('e0000071-0000-4000-8000-000000000000', 'carrier', '+15555559271', 'approved'),
  ('e0000072-0000-4000-8000-000000000000', 'carrier', '+15555559272', 'approved'),
  ('e0000073-0000-4000-8000-000000000000', 'driver', '+15555559273', 'pending'),
  ('e0000074-0000-4000-8000-000000000000', 'driver', '+15555559274', 'pending'),
  ('e0000075-0000-4000-8000-000000000000', 'admin', '+15555559275', 'approved'),
  ('e0000076-0000-4000-8000-000000000000', 'driver', '+15555559276', 'pending');

create function pg_temp.driver(n text, display text) returns void language sql as $$
  insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
    years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
    twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
  values (('d00000' || n || '-0000-4000-8000-000000000000')::uuid, ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, display, '{cdl_driver}', 'A', 'TX', '{H}', 8,
    'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', false, true, 'clean', 12, true, true, now(), 'consent');
  insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid, t::public.document_type, n || '/' || t || '.png', t || '.png', 'image/png', 100
  from unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
  update public.profiles set status = 'approved' where id = ('e00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
select pg_temp.driver('73', 'Reliable Driver');
select pg_temp.driver('74', 'Paused Driver');
select pg_temp.driver('76', 'Other Driver');
update public.drivers set no_show_count = 2, shifts_paused = true, shifts_paused_reason = 'no_shows', twic_issue_at = now()
where id = 'd0000074-0000-4000-8000-000000000000';

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values ('c0000071-0000-4000-a000-000000000000', 'e0000071-0000-4000-8000-000000000000', 'Paying Freight', 'Sam', 'sam@paying.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_71'),
  ('c0000072-0000-4000-a000-000000000000', 'e0000072-0000-4000-8000-000000000000', 'Lapsed Freight', 'Jo', 'jo@lapsed.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_72');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status)
values ('c0000071-0000-4000-a000-000000000000', 'sub_71', 'cus_71', 'active'),
  ('c0000072-0000-4000-a000-000000000000', 'sub_72', 'cus_72', 'past_due');

create function pg_temp.act_as(n text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'e00000' || n || '-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
$$;

-- What no carrier path may ever carry.
create function pg_temp.forbidden() returns text[] language sql as $$
  select array['no_show_count', 'shifts_paused', 'shifts_paused_reason', 'twic_issue_at', 'twic_issue_prior_at',
    'shift_ready_override_reason', 'rereview_needed', 'sms_opt_in_text', 'heard_from', 'heard_from_other', 'profile_id', 'phone'];
$$;
create function pg_temp.ids() returns uuid[] language sql as $$
  select array['d0000073-0000-4000-8000-000000000000', 'd0000074-0000-4000-8000-000000000000']::uuid[];
$$;

-- A subscribed carrier.
select pg_temp.act_as('71');
set local role authenticated;
select is_empty($$ select id from public.drivers $$, 'a subscribed carrier reads no row of the drivers table');
select is_empty($$ select no_show_count from public.drivers where id = any (pg_temp.ids()) $$, 'so no no_show_count');
select is_empty($$ select twic_issue_at from public.drivers where id = any (pg_temp.ids()) $$, 'no twic_issue_at');
select is_empty($$ select shifts_paused, shifts_paused_reason from public.drivers where id = any (pg_temp.ids()) $$, 'no shifts_paused or its reason');
select is_empty($$ select 1 from public.shift_events $$, 'no release history');
select is_empty($$ select 1 from public.admin_audit_log $$, 'no audit log');
select set_eq(
  $$ select full_name from public.carrier_driver_cards(pg_temp.ids()) $$,
  $$ values ('Reliable Driver'), ('Paused Driver') $$,
  'the card function answers, and a pause or no-shows change nothing about who is listed');
select is((select count(*)::int from public.search_drivers(29.7594, -95.3594, 50) where driver_id = any (pg_temp.ids())), 2, 'and the search finds both, so neither can be worked out');
reset role;

-- The card function's columns, whoever calls it.
select is(
  (select count(*)::int from information_schema.parameters p
   where p.specific_schema = 'public' and p.specific_name like 'carrier\_driver\_cards\_%' and p.parameter_mode = 'OUT' and p.parameter_name = any (pg_temp.forbidden())),
  0, 'none of the forbidden columns is in the card function');

-- No function a signed-in session can call returns one of them; no view exposes one.
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
       and exists (select 1 from unnest(coalesce(p.proargnames, '{}')) with ordinality as a(name, i)
                   where a.name = any (array['no_show_count', 'shifts_paused', 'shifts_paused_reason', 'twic_issue_at', 'twic_issue_prior_at'])) $$,
  'no callable function names a reliability column in what it returns');
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prorettype = 'public.drivers'::regtype $$,
  'no callable function returns a whole drivers row');
select is_empty(
  $$ select c.table_name from information_schema.columns c
     join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind in ('v', 'm')
     where c.table_schema = 'public' and c.column_name = any (array['no_show_count', 'shifts_paused', 'shifts_paused_reason', 'twic_issue_at', 'twic_issue_prior_at']) $$,
  'no view exposes one');
select is_empty(
  $$ select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('drivers', 'shift_events', 'profiles') $$,
  'Realtime does not carry drivers, release history or profiles');

-- A carrier whose subscription lapsed, and a blocked carrier: nothing by any path.
select pg_temp.act_as('72');
set local role authenticated;
select is_empty($$ select 1 from public.carrier_driver_cards(pg_temp.ids()) $$, 'a lapsed carrier gets no card');
select is_empty($$ select 1 from public.search_drivers(29.7594, -95.3594, 50) $$, 'and no search result');
reset role;
update public.profiles set status = 'blocked' where id = 'e0000071-0000-4000-8000-000000000000';
select pg_temp.act_as('71');
set local role authenticated;
select is_empty($$ select 1 from public.carrier_driver_cards(pg_temp.ids()) $$, 'a blocked carrier gets no card, with the session still valid');
select is_empty($$ select 1 from public.search_drivers(29.7594, -95.3594, 50) $$, 'and no search result');
reset role;
update public.profiles set status = 'approved' where id = 'e0000071-0000-4000-8000-000000000000';

-- An admin still reads everything.
select pg_temp.act_as('75');
set local role authenticated;
select results_eq(
  $$ select no_show_count, shifts_paused, shifts_paused_reason, twic_issue_at is not null from public.drivers where id = 'd0000074-0000-4000-8000-000000000000' $$,
  $$ values (2, true, 'no_shows'::text, true) $$,
  'an admin reads the reliability data');
select is_empty($$ select 1 from public.carrier_driver_cards(pg_temp.ids()) $$, 'the card function is for carriers only');
reset role;

-- A driver reads only their own card, with their own data.
select pg_temp.act_as('74');
set local role authenticated;
select results_eq(
  $$ select id, no_show_count, shifts_paused from public.drivers $$,
  $$ values ('d0000074-0000-4000-8000-000000000000'::uuid, 2, true) $$,
  'a driver reads their own row only');
select is_empty($$ select 1 from public.drivers where id = 'd0000073-0000-4000-8000-000000000000' $$, 'never another driver');
select is_empty($$ select 1 from public.carrier_driver_cards(pg_temp.ids()) $$, 'and no card through the function');
select is_empty($$ select 1 from public.search_drivers(29.7594, -95.3594, 50) $$, 'or the search');
reset role;

-- A visitor.
select ok(not has_function_privilege('anon', 'public.carrier_driver_cards(uuid[])', 'execute'), 'a visitor cannot call the card function');

select * from finish();
rollback;
