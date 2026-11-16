-- 0042: the Terms archive (exact text and hash, append-only, publish refuses changed text),
-- acceptances of archived versions only, the one-time links, and offers paused until a driver
-- accepts a version that needs everyone again.
begin;
select no_plan();

-- Inside this transaction only, a clean slate: no other version needs re-acceptance.
create function pg_temp.session(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555594' || n
from unnest(array['61', '62', '63']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555594' || n, 'pending'
from (values ('61', 'driver'), ('62', 'driver'), ('63', 'carrier')) as t(n, r);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;
create function pg_temp.pid(n text) returns uuid language sql as $$
  select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, twic_expires_on, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), pg_temp.pid(n), 'Driver ' || n, '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', true, current_date + 400, true, 'clean', 12, true, true, now(), 'consent'
from unnest(array['61', '62']) as n;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['61', '62']) as n cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
update public.profiles set status = 'approved' where id in (pg_temp.pid('61'), pg_temp.pid('62'));
update public.drivers set rereview_needed = false where id in (pg_temp.did('61'), pg_temp.did('62'));
update public.drivers set shifts_paused = true where id not in (pg_temp.did('61'), pg_temp.did('62'));

create function pg_temp.matched() returns setof uuid language sql as $$
  select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', false, false, false, '{}',
    now() + interval '1 day', now() + interval '1 day 8 hours');
$$;

-- Publishing ------------------------------------------------------------------
select is(
  (select body_sha256 from public.publish_terms_version('2099-01-v1', 'Terms of Service', '2099-01-01', 'First text.', false)),
  encode(sha256(convert_to('First text.', 'UTF8')), 'hex'),
  'a published version is stored with the SHA-256 of its exact text'
);
select lives_ok(
  $$ select * from public.publish_terms_version('2099-01-v1', 'Terms of Service', '2099-01-01', 'First text.', false) $$,
  'publishing the same version with the same text again is fine'
);
select throws_ok(
  $$ select * from public.publish_terms_version('2099-01-v1', 'Terms of Service', '2099-01-01', 'Changed text.', false) $$,
  '23505', null, 'but different text under a published version is refused'
);
select throws_ok($$ update public.terms_versions set body = 'x' where version = '2099-01-v1' $$, '42501', null, 'the archive cannot be edited');
select throws_ok($$ delete from public.terms_versions where version = '2099-01-v1' $$, '42501', null, 'or emptied');

set local role anon;
select is((select body from public.terms_versions where version = '2099-01-v1'), 'First text.', 'anyone can read the archived text');
select throws_ok($$ select * from public.publish_terms_version('2099-01-v2', 'T', '2099-01-01', 'x', false) $$, '42501', null, 'a visitor cannot publish');
reset role;
select pg_temp.session(pg_temp.pid('61')::text);
set local role authenticated;
select throws_ok($$ select * from public.publish_terms_version('2099-01-v2', 'T', '2099-01-01', 'x', false) $$, '42501', null, 'nor a signed-in user');
select throws_ok($$ insert into public.terms_versions (version, title, effective_date, body, body_sha256) values ('2099-01-v3', 'T', '2099-01-01', 'x', repeat('0', 64)) $$, '42501', null, 'nor write the table directly');
reset role;

-- Acceptances ----------------------------------------------------------------
select pg_temp.session(pg_temp.pid('61')::text);
set local role authenticated;
select is(
  (select method || ' ' || statement from public.record_tos_acceptance('2099-01-v1', '1.2.3.4', 'Browser', 'signup', 'I agree')),
  'signup I agree',
  'a driver accepts an archived version, with how and the words they agreed to'
);
select throws_ok($$ select * from public.record_tos_acceptance('2099-09-v9', null, null, 'gate', 'I agree') $$, '23503', null, 'a version that was never archived cannot be accepted');
select throws_ok($$ select * from public.record_tos_acceptance('2099-01-v1', null, null, 'link', 'I agree') $$, '42501', null, 'and a link acceptance needs the link');
select ok(public.my_terms_ok(), 'with nothing that needs re-acceptance, everyone is fine');
select throws_ok($$ select public.terms_ok(gen_random_uuid()) $$, '42501', null, 'a signed-in user cannot ask about someone else');
reset role;

select set_eq($$ select * from pg_temp.matched() $$, $$ values (pg_temp.did('61')), (pg_temp.did('62')) $$, 'both drivers get offers');

-- A version that needs everyone again: offers pause for whoever has not accepted it.
select * from public.publish_terms_version('2099-02-v2', 'Terms of Service', '2099-02-01', 'Second text.', true);
select is(public.required_terms_version(), '2099-02-v2', 'the newest version that needs everyone again');
select ok(not public.terms_ok(pg_temp.pid('61')), 'accepting an older version does not count');
select set_eq($$ select * from pg_temp.matched() $$, $$ select null::uuid where false $$, 'no offers until a driver accepts');

select set_eq(
  $$ select profile_id from public.drivers_awaiting_terms() where profile_id in (pg_temp.pid('61'), pg_temp.pid('62')) $$,
  $$ values (pg_temp.pid('61')), (pg_temp.pid('62')) $$,
  'both drivers are waiting to accept'
);

select pg_temp.session(pg_temp.pid('62')::text);
set local role authenticated;
select throws_ok($$ select * from public.drivers_awaiting_terms() $$, '42501', null, 'a signed-in user cannot list who is waiting');
select ok(not public.my_terms_ok(), 'the driver page sees it must ask');
select lives_ok($$ select * from public.record_tos_acceptance('2099-02-v2', null, null, 'gate', 'I agree') $$, 'the driver accepts on the Terms page');
select ok(public.my_terms_ok(), 'and is fine again');
reset role;
select set_eq($$ select * from pg_temp.matched() $$, $$ values (pg_temp.did('62')) $$, 'offers resume for that driver only');

-- The one-time link ----------------------------------------------------------
insert into public.driver_terms_links (profile_id, version, token_hash, expires_at) values
  (pg_temp.pid('61'), '2099-02-v2', repeat('a', 64), now() + interval '14 days'),
  (pg_temp.pid('61'), '2099-02-v2', repeat('b', 64), now() + interval '1 second');

select pg_temp.session(pg_temp.pid('61')::text);
set local role authenticated;
select throws_ok($$ select * from public.driver_terms_links $$, '42501', null, 'a signed-in user cannot read links');
select throws_ok($$ select * from public.accept_terms_by_link(repeat('a', 64)) $$, '42501', null, 'or redeem one directly');
reset role;

select is((select outcome from public.accept_terms_by_link(repeat('c', 64))), 'not_found', 'an unknown token');
update public.driver_terms_links set created_at = now() - interval '15 days', expires_at = now() - interval '1 day' where token_hash = repeat('b', 64);
select is((select outcome from public.accept_terms_by_link(repeat('b', 64))), 'expired', 'an expired link');
select ok(not public.terms_ok(pg_temp.pid('61')), 'opening or trying a link records nothing');
select is(
  (select outcome || ' ' || version from public.accept_terms_by_link(repeat('a', 64), '5.6.7.8', 'Phone', 'I agree')),
  'accepted 2099-02-v2',
  'a valid link accepts the version it was issued for'
);
select results_eq(
  $$ select method, ip, user_agent, statement, terms_link_id is not null from public.tos_acceptances where profile_id = pg_temp.pid('61') and version = '2099-02-v2' $$,
  $$ values ('link'::text, '5.6.7.8'::text, 'Phone'::text, 'I agree'::text, true) $$,
  'recorded with the link, the address, the device and the words'
);
select is((select outcome from public.accept_terms_by_link(repeat('a', 64))), 'used', 'and cannot be used again');
select set_eq($$ select * from pg_temp.matched() $$, $$ values (pg_temp.did('61')), (pg_temp.did('62')) $$, 'both drivers get offers again');
select is((select status::text from public.profiles where id = pg_temp.pid('61')), 'approved', 'the driver''s status never changed');

-- A deleted account: the acceptance stays, without the person or the link.
delete from auth.users where id = pg_temp.pid('61');
select is((select count(*)::int from public.tos_acceptances where version in ('2099-01-v1', '2099-02-v2') and profile_id is null), 2,
  'proof of acceptance outlives the account');

select * from finish();
rollback;
