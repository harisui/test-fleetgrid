-- QR links, scans and sign-up sources (0018): shape, constraints, who reads and writes, and
-- that a driver cannot rewrite where they came from.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'heard_from',
  array['flyer', 'facebook_instagram', 'google_search', 'friend_coworker', 'other']);
select has_table('public', 'qr_links', 'qr_links exists');
select has_table('public', 'qr_scans', 'qr_scans exists');
select columns_are('public', 'qr_links', array[
  'id', 'slug', 'location_name', 'campaign', 'target_path', 'utm_source', 'utm_medium', 'is_active',
  'created_by', 'created_at', 'updated_at']);
select columns_are('public', 'qr_scans', array['id', 'qr_link_id', 'scanned_at', 'ip_hash', 'user_agent']);
select col_is_unique('qr_links', 'slug');
select col_default_is('qr_links', 'utm_source', 'flyer');
select col_default_is('qr_links', 'utm_medium', 'qr');
select col_default_is('qr_links', 'target_path', '/');
select fk_ok('public', 'qr_scans', 'qr_link_id', 'public', 'qr_links', 'id');
select has_column('public', 'profiles', 'signup_utm_campaign', 'profiles carry the sign-up campaign');
select has_column('public', 'profiles', 'qr_link_id', 'profiles carry the QR link');
select fk_ok('public', 'profiles', 'qr_link_id', 'public', 'qr_links', 'id');
select has_column('public', 'drivers', 'heard_from', 'drivers carry how they heard');
select has_trigger('qr_links', 'qr_links_set_updated_at');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('b1111111-1111-4111-8111-111111111111', '15555559201'), -- admin
  ('b2222222-2222-4222-8222-222222222222', '15555559202'), -- driver
  ('b3333333-3333-4333-8333-333333333333', '15555559203'); -- carrier

insert into public.profiles (id, role, phone, status, signup_utm_campaign, signup_landing_path) values
  ('b1111111-1111-4111-8111-111111111111', 'admin', '+15555559201', 'approved', null, null),
  ('b2222222-2222-4222-8222-222222222222', 'driver', '+15555559202', 'pending', 'pasadena-225', '/'),
  ('b3333333-3333-4333-8333-333333333333', 'carrier', '+15555559203', 'approved', null, null);

insert into public.drivers (profile_id, full_name, state, zip, onboarding_step) values
  ('b2222222-2222-4222-8222-222222222222', 'Source Driver', 'TX', '77506', 2);

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
  $$insert into public.qr_links (slug, location_name, campaign, created_by) values ('Loves 225', 'Love''s, Hwy 225', 'pasadena-225', 'b1111111-1111-4111-8111-111111111111')$$,
  '23514', null, 'the slug is lowercase letters, digits and dashes');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, created_by) values ('loves-225', 'L', 'pasadena-225', 'b1111111-1111-4111-8111-111111111111')$$,
  '23514', null, 'the location name has at least two characters');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, created_by) values ('loves-225', 'Love''s', 'Pasadena 225', 'b1111111-1111-4111-8111-111111111111')$$,
  '23514', null, 'the campaign is a slug too');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, target_path, created_by) values ('loves-225', 'Love''s', 'pasadena-225', 'drivers', 'b1111111-1111-4111-8111-111111111111')$$,
  '23514', null, 'the landing page is a path');

-- ---------------------------------------------------------------------------
-- An admin creates, reads and updates links, and reads scans
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b1111111-1111-4111-8111-111111111111', '+15555559201');
select lives_ok(
  $$insert into public.qr_links (id, slug, location_name, campaign, created_by)
    values ('d1111111-1111-4111-8111-111111111111', 'loves-hwy-225', 'Love''s, Hwy 225', 'pasadena-225', 'b1111111-1111-4111-8111-111111111111')$$,
  'an admin creates a link in their own name');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, created_by)
    values ('other-admin', 'Elsewhere', 'pasadena-225', 'b3333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'an admin cannot create a link in someone else''s name');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, created_by)
    values ('loves-hwy-225', 'Twice', 'pasadena-225', 'b1111111-1111-4111-8111-111111111111')$$,
  '23505', null, 'a slug is used once');
select is(
  (select utm_source || '/' || utm_medium || '/' || target_path from public.qr_links where slug = 'loves-hwy-225'),
  'flyer/qr//', 'the defaults are flyer, qr and the home page');
select lives_ok(
  $$update public.qr_links set is_active = false where slug = 'loves-hwy-225'$$,
  'an admin deactivates a link');
select is((select is_active from public.qr_links where slug = 'loves-hwy-225'), false, 'and it is off');
select throws_ok(
  $$insert into public.qr_scans (qr_link_id) values ('d1111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'an admin does not write scans; the short link route does, with the service role');
select is_empty($$select 1 from public.qr_scans where qr_link_id = 'd1111111-1111-4111-8111-111111111111'$$, 'no scans yet');
select pg_temp.sign_out();

-- The service role (here: the owner) logs a scan with a hashed address only.
select lives_ok(
  $$insert into public.qr_scans (qr_link_id, ip_hash, user_agent)
    values ('d1111111-1111-4111-8111-111111111111', repeat('ab', 32), 'Mozilla/5.0')$$,
  'the service role logs a scan');
select throws_ok(
  $$insert into public.qr_scans (qr_link_id, ip_hash) values ('d1111111-1111-4111-8111-111111111111', '203.0.113.9')$$,
  '23514', null, 'a raw address is refused: the hash must be 64 hex characters');

select pg_temp.sign_in('b1111111-1111-4111-8111-111111111111', '+15555559201');
select is(
  (select count(*) from public.qr_scans where qr_link_id = 'd1111111-1111-4111-8111-111111111111'),
  1::bigint, 'an admin reads the scans');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- A driver sees nothing of the links or scans, and cannot rewrite their source
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b2222222-2222-4222-8222-222222222222', '+15555559202');
select is_empty('select 1 from public.qr_links', 'a driver reads no links');
select is_empty('select 1 from public.qr_scans', 'a driver reads no scans');
select throws_ok(
  $$insert into public.qr_links (slug, location_name, campaign, created_by) values ('mine', 'Mine', 'pasadena-225', 'b2222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'a driver cannot create a link');
select is(
  (select signup_utm_campaign from public.profiles where id = 'b2222222-2222-4222-8222-222222222222'),
  'pasadena-225', 'a driver reads their own source');
select throws_ok(
  $$update public.profiles set signup_utm_campaign = 'other' where id = 'b2222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'a driver cannot rewrite their campaign');
select throws_ok(
  $$update public.profiles set qr_link_id = 'd1111111-1111-4111-8111-111111111111' where id = 'b2222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'a driver cannot attach a QR code to themselves');
select lives_ok(
  $$update public.drivers set heard_from = 'flyer', heard_from_other = null where profile_id = 'b2222222-2222-4222-8222-222222222222'$$,
  'a driver answers how they heard of FleetGrid');
select throws_ok(
  $$update public.drivers set heard_from = 'other', heard_from_other = repeat('x', 81) where profile_id = 'b2222222-2222-4222-8222-222222222222'$$,
  '23514', null, 'the "other" answer is at most 80 characters');
select pg_temp.sign_out();

-- A carrier sees nothing either.
select pg_temp.sign_in('b3333333-3333-4333-8333-333333333333', '+15555559203');
select is_empty('select 1 from public.qr_links', 'a carrier reads no links');
select pg_temp.sign_out();

-- An admin may correct a source.
select pg_temp.sign_in('b1111111-1111-4111-8111-111111111111', '+15555559201');
select lives_ok(
  $$update public.profiles set qr_link_id = 'd1111111-1111-4111-8111-111111111111' where id = 'b2222222-2222-4222-8222-222222222222'$$,
  'an admin attaches a QR code to a profile');
select pg_temp.sign_out();

-- Removing a link clears the profile's pointer and takes its scans along.
delete from public.qr_links where slug = 'loves-hwy-225';
select is((select qr_link_id from public.profiles where id = 'b2222222-2222-4222-8222-222222222222'), null, 'a removed link leaves the profile without one');
select is_empty($$select 1 from public.qr_scans where qr_link_id = 'd1111111-1111-4111-8111-111111111111'$$, 'and its scans are gone');

set local role anon;
select throws_ok('select 1 from public.qr_links', '42501', null, 'anon cannot read the links');
select throws_ok('select 1 from public.qr_scans', '42501', null, 'anon cannot read the scans');
reset role;

select * from finish();
rollback;
