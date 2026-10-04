-- Schema, constraints and triggers for Milestone 1 tables.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'user_role', array['driver', 'carrier', 'admin']);
select enum_has_labels('public', 'account_status', array['pending', 'approved', 'blocked']);
select enum_has_labels('public', 'operator_type', array['cdl_driver', 'yard_spotter', 'mechanic']);
select enum_has_labels('public', 'cdl_class', array['A', 'B', 'C', 'none']);
select enum_has_labels('public', 'endorsement', array['H', 'N', 'P', 'S', 'T', 'X']);
select enum_has_labels('public', 'availability_type', array['full_time', 'part_time', 'on_call', 'weekends']);
select enum_has_labels('public', 'document_type', array['cdl_front', 'cdl_back', 'medical_card', 'certification', 'other']);

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'drivers', 'drivers exists');
select has_table('public', 'driver_documents', 'driver_documents exists');
select has_table('public', 'tos_acceptances', 'tos_acceptances exists');

select columns_are('public', 'profiles',
  array['id', 'role', 'phone', 'status', 'created_at', 'updated_at']);
select columns_are('public', 'drivers', array[
  'id', 'profile_id', 'full_name', 'operator_types', 'cdl_class', 'endorsements',
  'years_experience', 'city', 'state', 'zip', 'service_radius_miles', 'lat', 'lng', 'availability',
  'certifications', 'bio', 'sms_opt_in', 'sms_opt_in_at', 'sms_opt_in_text', 'sms_opted_out',
  'sms_opted_out_at', 'onboarding_step', 'card_completed', 'created_at', 'updated_at']);
select columns_are('public', 'driver_documents', array[
  'id', 'driver_id', 'type', 'storage_path', 'file_name', 'mime_type', 'size_bytes',
  'created_at', 'updated_at']);
select columns_are('public', 'tos_acceptances', array[
  'id', 'profile_id', 'version', 'accepted_at', 'ip', 'user_agent', 'created_at', 'updated_at']);

-- profiles
select col_is_pk('profiles', 'id', 'profiles.id is the primary key');
select col_type_is('profiles', 'id', 'uuid');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id');
select col_type_is('profiles', 'role', 'user_role');
select col_not_null('profiles', 'role');
select col_type_is('profiles', 'phone', 'text');
select col_not_null('profiles', 'phone');
select col_is_unique('profiles', 'phone');
select col_type_is('profiles', 'status', 'account_status');
select col_not_null('profiles', 'status');
select col_default_is('profiles', 'status', 'pending');

-- drivers
select col_is_pk('drivers', 'id');
select col_has_default('drivers', 'id');
select col_type_is('drivers', 'profile_id', 'uuid');
select col_not_null('drivers', 'profile_id');
select col_is_unique('drivers', 'profile_id');
select fk_ok('public', 'drivers', 'profile_id', 'public', 'profiles', 'id');
select col_type_is('drivers', 'full_name', 'text');
select col_not_null('drivers', 'full_name');
select col_type_is('drivers', 'operator_types', 'operator_type[]');
select col_not_null('drivers', 'operator_types');
select col_type_is('drivers', 'cdl_class', 'cdl_class');
select col_not_null('drivers', 'cdl_class');
select col_default_is('drivers', 'cdl_class', 'none');
select col_type_is('drivers', 'endorsements', 'endorsement[]');
select col_not_null('drivers', 'endorsements');
select col_type_is('drivers', 'years_experience', 'integer');
select col_type_is('drivers', 'city', 'text');
select col_is_null('drivers', 'city');
select col_type_is('drivers', 'state', 'character(2)');
select col_is_null('drivers', 'state', 'state is null until the ZIP screen is saved');
select col_type_is('drivers', 'zip', 'text');
select col_is_null('drivers', 'zip', 'zip is null until the ZIP screen is saved');
select col_type_is('drivers', 'service_radius_miles', 'integer');
select col_not_null('drivers', 'service_radius_miles');
select col_default_is('drivers', 'service_radius_miles', '50');
select col_type_is('drivers', 'availability', 'availability_type[]');
select col_not_null('drivers', 'availability');
select col_type_is('drivers', 'certifications', 'text[]');
select col_not_null('drivers', 'certifications');
select col_type_is('drivers', 'bio', 'text');
select col_type_is('drivers', 'sms_opt_in', 'boolean');
select col_not_null('drivers', 'sms_opt_in');
select col_default_is('drivers', 'sms_opt_in', 'false');
select col_type_is('drivers', 'sms_opt_in_at', 'timestamp with time zone');
select col_type_is('drivers', 'sms_opt_in_text', 'text');
select col_type_is('drivers', 'sms_opted_out', 'boolean');
select col_not_null('drivers', 'sms_opted_out');
select col_default_is('drivers', 'sms_opted_out', 'false');
select col_type_is('drivers', 'sms_opted_out_at', 'timestamp with time zone');
select col_type_is('drivers', 'onboarding_step', 'integer');
select col_not_null('drivers', 'onboarding_step');
select col_default_is('drivers', 'onboarding_step', '1');
select col_type_is('drivers', 'card_completed', 'boolean');
select col_not_null('drivers', 'card_completed');
select col_default_is('drivers', 'card_completed', 'false');

-- driver_documents
select col_is_pk('driver_documents', 'id');
select col_not_null('driver_documents', 'driver_id');
select fk_ok('public', 'driver_documents', 'driver_id', 'public', 'drivers', 'id');
select col_type_is('driver_documents', 'type', 'document_type');
select col_not_null('driver_documents', 'type');
select col_not_null('driver_documents', 'storage_path');
select col_is_unique('driver_documents', 'storage_path');
select col_not_null('driver_documents', 'file_name');
select col_not_null('driver_documents', 'mime_type');
select col_type_is('driver_documents', 'size_bytes', 'integer');
select col_not_null('driver_documents', 'size_bytes');

-- tos_acceptances
select col_is_pk('tos_acceptances', 'id');
select col_not_null('tos_acceptances', 'profile_id');
select fk_ok('public', 'tos_acceptances', 'profile_id', 'public', 'profiles', 'id');
select col_not_null('tos_acceptances', 'version');
select col_type_is('tos_acceptances', 'accepted_at', 'timestamp with time zone');
select col_not_null('tos_acceptances', 'accepted_at');
select col_has_default('tos_acceptances', 'accepted_at');
select col_is_null('tos_acceptances', 'ip');
select col_is_null('tos_acceptances', 'user_agent');

-- created_at / updated_at on every table
select col_not_null(t, 'created_at', t || '.created_at is not null')
  from unnest(array['profiles', 'drivers', 'driver_documents', 'tos_acceptances']) as t;
select col_not_null(t, 'updated_at', t || '.updated_at is not null')
  from unnest(array['profiles', 'drivers', 'driver_documents', 'tos_acceptances']) as t;
select col_has_default(t, 'created_at', t || '.created_at has a default')
  from unnest(array['profiles', 'drivers', 'driver_documents', 'tos_acceptances']) as t;
select col_has_default(t, 'updated_at', t || '.updated_at has a default')
  from unnest(array['profiles', 'drivers', 'driver_documents', 'tos_acceptances']) as t;

-- ---------------------------------------------------------------------------
-- Indexes, triggers, functions
-- ---------------------------------------------------------------------------
select has_index('public', 'drivers', 'drivers_state_idx', array['state']);
select has_index('public', 'drivers', 'drivers_zip_idx', array['zip']);
select has_index('public', 'drivers', 'drivers_operator_types_idx', array['operator_types']);
select has_index('public', 'drivers', 'drivers_endorsements_idx', array['endorsements']);
select has_index('public', 'drivers', 'drivers_availability_idx', array['availability']);
select index_is_type('public', 'drivers', 'drivers_operator_types_idx', 'gin');
select index_is_type('public', 'drivers', 'drivers_endorsements_idx', 'gin');
select index_is_type('public', 'drivers', 'drivers_availability_idx', 'gin');
select has_index('public', 'driver_documents', 'driver_documents_driver_id_idx', array['driver_id']);

select has_trigger('profiles', 'profiles_set_updated_at');
select has_trigger('drivers', 'drivers_set_updated_at');
select has_trigger('driver_documents', 'driver_documents_set_updated_at');
select has_trigger('tos_acceptances', 'tos_acceptances_set_updated_at');
select has_trigger('profiles', 'profiles_protect_columns');
select has_trigger('drivers', 'drivers_protect_columns');

select function_returns('public', 'auth_role', array[]::text[], 'user_role');
select function_returns('public', 'is_admin', array[]::text[], 'boolean');
select function_returns('public', 'current_driver_id', array[]::text[], 'uuid');
select is_definer('public', 'auth_role', array[]::text[]);
select is_definer('public', 'is_admin', array[]::text[]);
select is_definer('public', 'current_driver_id', array[]::text[]);
select volatility_is('public', 'auth_role', array[]::text[], 'stable');
select volatility_is('public', 'is_admin', array[]::text[], 'stable');
select volatility_is('public', 'current_driver_id', array[]::text[], 'stable');
select ok(
  (select bool_and(proconfig @> array['search_path=public'])
     from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('auth_role', 'is_admin', 'current_driver_id')),
  'helper functions pin search_path to public'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'),
  ('22222222-2222-4222-8222-222222222222', '15555559002'),
  ('33333333-3333-4333-8333-333333333333', '15555559003');

insert into public.profiles (id, role, phone) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002');
insert into public.profiles (id, role, phone, status) values
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved');

-- ---------------------------------------------------------------------------
-- profiles constraints
-- ---------------------------------------------------------------------------
select is(
  (select status from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'pending'::public.account_status,
  'new profiles start as pending'
);

select throws_ok(
  $$insert into public.profiles (id, role, phone) values ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559009')$$,
  '23505', null, 'one profile per user'
);
select throws_ok(
  $$update public.profiles set phone = '+15555559002' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23505', null, 'phone is unique'
);
select throws_ok(
  $$update public.profiles set phone = '5555559001' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'phone must be E.164'
);
select throws_ok(
  $$insert into public.profiles (id, role, phone) values (gen_random_uuid(), 'driver', '+15555559010')$$,
  '23503', null, 'profile must reference an auth user'
);

-- ---------------------------------------------------------------------------
-- drivers constraints
-- ---------------------------------------------------------------------------
-- Partial save on the first onboarding screen: only the name is known.
select lives_ok(
  $$insert into public.drivers (id, profile_id, full_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Pat Driver')$$,
  'a card can be created with only a name'
);
select results_eq(
  $$select operator_types::text, cdl_class::text, endorsements::text, service_radius_miles,
           availability::text, certifications::text, sms_opt_in, sms_opted_out, onboarding_step, card_completed,
           state is null, zip is null
      from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values ('{}', 'none', '{}', 50, '{}', '{}', false, false, 1, false, true, true)$$,
  'partial card gets the documented defaults'
);

select throws_ok(
  $$insert into public.drivers (profile_id, full_name)
    values ('11111111-1111-4111-8111-111111111111', 'Again')$$,
  '23505', null, 'one card per profile'
);

create function pg_temp.update_driver(p_set text) returns text language sql as $$
  select format($f$update public.drivers set %s where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$f$, p_set);
$$;

select throws_ok(pg_temp.update_driver($$full_name = ' '$$), '23514', null, 'blank full name rejected');
select throws_ok(pg_temp.update_driver($$full_name = repeat('x', 101)$$), '23514', null, 'full name over 100 chars rejected');
select throws_ok(pg_temp.update_driver($$years_experience = -1$$), '23514', null, 'negative experience rejected');
select throws_ok(pg_temp.update_driver($$years_experience = 61$$), '23514', null, 'experience over 60 rejected');
select lives_ok(pg_temp.update_driver($$years_experience = 0$$), 'experience 0 accepted');
select lives_ok(pg_temp.update_driver($$years_experience = 60$$), 'experience 60 accepted');
select throws_ok(pg_temp.update_driver($$zip = '7520'$$), '23514', null, '4 digit zip rejected');
select throws_ok(pg_temp.update_driver($$zip = '752011'$$), '23514', null, '6 digit zip rejected');
select throws_ok(pg_temp.update_driver($$zip = '75A01'$$), '23514', null, 'non numeric zip rejected');
select throws_ok(pg_temp.update_driver($$state = 'tx'$$), '23514', null, 'lowercase state rejected');
select throws_ok(pg_temp.update_driver($$state = 'T'$$), '23514', null, 'one letter state rejected');
select throws_ok(pg_temp.update_driver($$service_radius_miles = 4$$), '23514', null, 'radius under 5 rejected');
select throws_ok(pg_temp.update_driver($$service_radius_miles = 501$$), '23514', null, 'radius over 500 rejected');
select lives_ok(pg_temp.update_driver($$service_radius_miles = 5$$), 'radius 5 accepted');
select lives_ok(pg_temp.update_driver($$service_radius_miles = 500$$), 'radius 500 accepted');
-- Coordinates (0007): optional, always as a pair, inside the valid ranges.
select has_column('drivers', 'lat');
select has_column('drivers', 'lng');
select col_type_is('drivers', 'lat', 'numeric(8,5)');
select col_type_is('drivers', 'lng', 'numeric(8,5)');
select col_is_null('drivers', 'lat');
select col_is_null('drivers', 'lng');
select lives_ok(pg_temp.update_driver($$lat = 32.78111, lng = -96.79722$$), 'coordinates accepted');
select throws_ok(pg_temp.update_driver($$lat = 90.00001, lng = 0$$), '23514', null, 'latitude over 90 rejected');
select throws_ok(pg_temp.update_driver($$lat = 0, lng = -180.5$$), '23514', null, 'longitude under -180 rejected');
select throws_ok(pg_temp.update_driver($$lat = 32.78111, lng = null$$), '23514', null, 'latitude without longitude rejected');
select lives_ok(pg_temp.update_driver($$lat = null, lng = null$$), 'coordinates can be cleared together');
select throws_ok(pg_temp.update_driver($$bio = repeat('x', 501)$$), '23514', null, 'bio over 500 chars rejected');
select lives_ok(pg_temp.update_driver($$bio = repeat('x', 500)$$), 'bio of 500 chars accepted');
select throws_ok(pg_temp.update_driver($$onboarding_step = 0$$), '23514', null, 'onboarding step 0 rejected');
select throws_ok(pg_temp.update_driver($$onboarding_step = 14$$), '23514', null, 'onboarding step 14 rejected');
select lives_ok(pg_temp.update_driver($$onboarding_step = 13$$), 'onboarding step 13 (done) accepted');
select lives_ok(pg_temp.update_driver($$onboarding_step = 1$$), 'onboarding step 1 accepted');
select throws_ok(pg_temp.update_driver($$operator_types = '{pilot}'$$), '22P02', null, 'unknown operator type rejected');
select throws_ok(
  pg_temp.update_driver($$cdl_class = 'none', endorsements = '{H}'$$),
  '23514', null, 'endorsements require a CDL class'
);
select lives_ok(
  pg_temp.update_driver($$cdl_class = 'A', endorsements = '{H,T}'$$),
  'endorsements accepted with a CDL class'
);

-- SMS consent evidence
select throws_ok(pg_temp.update_driver($$sms_opt_in = true$$), '23514', null, 'opt-in without timestamp and text rejected');
select throws_ok(
  pg_temp.update_driver($$sms_opt_in = true, sms_opt_in_at = now()$$),
  '23514', null, 'opt-in without consent text rejected'
);
select throws_ok(
  pg_temp.update_driver($$sms_opt_in = true, sms_opt_in_text = 'I agree'$$),
  '23514', null, 'opt-in without timestamp rejected'
);

-- card_completed requires every required field
select throws_ok(pg_temp.update_driver($$card_completed = true$$), '23514', null, 'incomplete card cannot be completed');
select throws_ok(
  pg_temp.update_driver($$card_completed = true, operator_types = '{cdl_driver}', availability = '{full_time}', years_experience = 5$$),
  '23514', null, 'card cannot be completed without SMS consent'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, operator_types = '{}', availability = '{full_time}', years_experience = 5,
    sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  '23514', null, 'card cannot be completed without an operator type'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, operator_types = '{cdl_driver}', availability = '{}', years_experience = 5,
    sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  '23514', null, 'card cannot be completed without availability'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, operator_types = '{cdl_driver}', availability = '{full_time}', years_experience = null,
    sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  '23514', null, 'card cannot be completed without years of experience'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, operator_types = '{cdl_driver}', availability = '{full_time}', years_experience = 5,
    sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  '23514', null, 'card cannot be completed without a state and ZIP'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, state = 'TX', zip = '75201', cdl_class = 'none', operator_types = '{cdl_driver}',
    availability = '{full_time}', years_experience = 5, sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  '23514', null, 'a CDL driver cannot complete the card without a CDL class'
);
select lives_ok(
  pg_temp.update_driver($$card_completed = true, onboarding_step = 13, state = 'TX', zip = '75201', cdl_class = 'none',
    endorsements = '{}', operator_types = '{yard_spotter}', availability = '{full_time}', years_experience = 5,
    sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  'a yard spotter without a CDL can complete the card'
);
select lives_ok(
  pg_temp.update_driver($$cdl_class = 'A', operator_types = '{cdl_driver}'$$),
  'a full card can be completed'
);
select throws_ok(
  pg_temp.update_driver($$sms_opt_in = false$$),
  '23514', null, 'a completed card cannot drop SMS consent'
);

-- ---------------------------------------------------------------------------
-- driver_documents constraints
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_front', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.jpg', 'front.jpg', 'image/jpeg', 10485760)$$,
  'a 10 MB document is accepted'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_back', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/two.jpg', 'back.jpg', 'image/jpeg', 10485761)$$,
  '23514', null, 'a document over 10 MB is rejected'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_back', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/three.jpg', 'back.jpg', 'image/jpeg', 0)$$,
  '23514', null, 'an empty document is rejected'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_back', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.jpg', 'back.jpg', 'image/jpeg', 100)$$,
  '23505', null, 'storage_path is unique'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'other', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/four.exe', 'virus.exe', 'application/x-msdownload', 100)$$,
  '23514', null, 'a disallowed mime type is rejected'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'passport', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/five.jpg', 'p.jpg', 'image/jpeg', 100)$$,
  '22P02', null, 'an unknown document type is rejected'
);

-- ---------------------------------------------------------------------------
-- tos_acceptances
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('11111111-1111-4111-8111-111111111111', '2026-10-v1')$$,
  'terms acceptance can be recorded'
);
select throws_ok(
  $$insert into public.tos_acceptances (profile_id, version) values ('11111111-1111-4111-8111-111111111111', '2026-10-v1')$$,
  '23505', null, 'the same version cannot be accepted twice'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
update public.profiles set updated_at = '2000-01-01' where id = '22222222-2222-4222-8222-222222222222';
select isnt(
  (select updated_at from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  '2000-01-01'::timestamptz,
  'profiles.updated_at is maintained by the trigger, not the caller'
);
update public.drivers set bio = 'changed', updated_at = '2000-01-01' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select updated_at from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  now(),
  'drivers.updated_at is set to now() on update'
);
update public.driver_documents set file_name = 'renamed.jpg', updated_at = '2000-01-01';
select is((select min(updated_at) from public.driver_documents), now(), 'driver_documents.updated_at is maintained');
update public.tos_acceptances set ip = '127.0.0.1', updated_at = '2000-01-01';
select is((select min(updated_at) from public.tos_acceptances), now(), 'tos_acceptances.updated_at is maintained');

-- ---------------------------------------------------------------------------
-- Helper functions and protection triggers, as real signed-in users
-- ---------------------------------------------------------------------------
create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

-- Driver 1
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111');
select is(public.auth_role(), 'driver'::public.user_role, 'auth_role() returns the caller role');
select is(public.is_admin(), false, 'a driver is not admin');
select is(public.current_driver_id(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'current_driver_id() returns the caller card');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'Changing role is not allowed', 'a user cannot change their own role'
);
select throws_ok(
  $$update public.profiles set status = 'approved' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'Changing status is not allowed', 'a user cannot change their own status'
);
select throws_ok(
  $$update public.profiles set phone = '+15555559099' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'Changing phone is not allowed', 'a user cannot change their own phone'
);
select throws_ok(
  $$update public.drivers set sms_opted_out = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', 'Changing SMS opt-out state is not allowed', 'a driver cannot change SMS opt-out state'
);
select throws_ok(
  $$update public.drivers set profile_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', 'Changing the card owner is not allowed', 'a driver cannot move their card to another profile'
);
select lives_ok(
  $$update public.drivers set bio = 'My own edit' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'a driver can still edit normal card fields'
);
reset role;

-- Driver 2 has no card yet
select pg_temp.sign_in('22222222-2222-4222-8222-222222222222');
select is(public.current_driver_id(), null::uuid, 'current_driver_id() is null without a card');
reset role;

-- A signed-in user without a profile
select pg_temp.sign_in('99999999-9999-4999-8999-999999999999');
select is(public.auth_role(), null::public.user_role, 'auth_role() is null without a profile');
select is(public.is_admin(), false, 'is_admin() is false without a profile');
reset role;

-- Admin
select pg_temp.sign_in('33333333-3333-4333-8333-333333333333');
select is(public.auth_role(), 'admin'::public.user_role, 'auth_role() returns admin');
select is(public.is_admin(), true, 'is_admin() is true for admins');
select lives_ok(
  $$update public.profiles set status = 'approved' where id = '11111111-1111-4111-8111-111111111111'$$,
  'an admin can change status'
);
select lives_ok(
  $$update public.profiles set role = 'carrier' where id = '22222222-2222-4222-8222-222222222222'$$,
  'an admin can change role'
);
select lives_ok(
  $$update public.drivers set sms_opted_out = true, sms_opted_out_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'an admin can change SMS opt-out state'
);
reset role;

-- Service role (server code)
set local role service_role;
select lives_ok(
  $$update public.profiles set status = 'blocked' where id = '11111111-1111-4111-8111-111111111111'$$,
  'the service role can change status'
);
select lives_ok(
  $$update public.drivers set sms_opted_out = false, sms_opted_out_at = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'the service role can change SMS opt-out state'
);
reset role;

select is(
  (select status from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'blocked'::public.account_status,
  'privileged status change was applied'
);

-- Anonymous visitors cannot call the helpers
set local role anon;
select throws_ok($$select public.is_admin()$$, '42501', null, 'anon cannot call is_admin()');
select throws_ok($$select public.auth_role()$$, '42501', null, 'anon cannot call auth_role()');
select throws_ok($$select public.current_driver_id()$$, '42501', null, 'anon cannot call current_driver_id()');
reset role;

-- ---------------------------------------------------------------------------
-- Cascades
-- ---------------------------------------------------------------------------
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'deleting the auth user deletes the profile');
select is((select count(*) from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'and the driver card');
select is((select count(*) from public.driver_documents where driver_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'and the documents');
select is((select count(*) from public.tos_acceptances where profile_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'and the terms acceptances');

select * from finish();
rollback;
