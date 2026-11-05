-- 0029: only Shift-Ready drivers reach carriers. A Registered driver (even with every
-- document), a Blocked one, and an approved row that misses a document (only a raw insert can
-- make one) never appear in carrier search, never match a shift, never book one. A
-- Shift-Ready driver does all three.
begin;
select no_plan();

-- Drivers 61 Shift-Ready, 62 Registered with documents, 63 Blocked with documents, 64 approved
-- by a raw insert without documents. All complete, Texas, Houston, consenting, two-word names.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555598' || n
from unnest(array['61', '62', '63', '64', '65']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555598' || n, s::public.account_status
from (values ('61', 'driver', 'pending'), ('62', 'driver', 'pending'), ('63', 'driver', 'pending'),
  ('64', 'driver', 'approved'), ('65', 'carrier', 'approved')) as t(n, r, s);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true, true, now(), 'consent'
from unnest(array['61', '62', '63', '64']) as n;

insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['61', '62', '63']) as n cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;

update public.profiles set status = 'approved' where id = 'e0000061-0000-4000-8000-000000000000';
update public.profiles set status = 'blocked' where id = 'e0000063-0000-4000-8000-000000000000';
-- Every other driver of the local database is kept out of these checks.
update public.drivers set shifts_paused = true where id not in (select pg_temp.did(n) from unnest(array['61', '62', '63', '64']) as n);

select ok(public.is_shift_ready(pg_temp.did('61')), '61 is Shift-Ready');
select ok(not public.is_shift_ready(pg_temp.did('62')), '62 is Registered, documents or not');
select ok(not public.is_shift_ready(pg_temp.did('64')), '64 is approved by a raw insert but misses its documents');

-- Matching (broadcasts and the live count).
select set_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', false, false, false)
     where driver_id in (select pg_temp.did(n) from unnest(array['61', '62', '63', '64']) as n) $$,
  $$ values ('d0000061-0000-4000-8000-000000000000'::uuid) $$,
  'only the Shift-Ready driver matches: Registered, Blocked and the approved row without documents never do'
);

-- Carrier search (RLS).
insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values ('c0000065-0000-4000-a000-000000000000', 'e0000065-0000-4000-8000-000000000000', 'Search Freight', 'Sam Owner',
  'sam@search.example', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_search');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status)
values ('c0000065-0000-4000-a000-000000000000', 'sub_search', 'cus_search', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'e0000065-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_eq(
  $$ select id from public.carrier_driver_cards(array(select pg_temp.did(n) from unnest(array['61', '62', '63', '64']) as n)) $$,
  $$ values ('d0000061-0000-4000-8000-000000000000'::uuid) $$,
  'a subscribed carrier reads only the Shift-Ready card'
);
select set_eq(
  $$ select driver_id from public.search_drivers(29.7594, -95.3594, 50, null, '{}', null, null, null, null, '{}', null, 500, 0)
     where driver_id in (select pg_temp.did(n) from unnest(array['61', '62', '63', '64']) as n) $$,
  $$ values ('d0000061-0000-4000-8000-000000000000'::uuid) $$,
  'and the search returns only the Shift-Ready driver'
);
select is_empty(
  $$ select 1 from public.driver_documents where driver_id = 'd0000062-0000-4000-8000-000000000000' $$,
  'a Registered driver''s documents stay hidden'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Booking: a Registered driver offered before CR-5 cannot book.
insert into public.shifts (id, carrier_id, short_code, starts_at, ends_at, zip, city, state, lat, lng,
  work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
values ('50000065-0000-4000-8000-000000000000', 'c0000065-0000-4000-a000-000000000000', '6565',
  now() + interval '1 day', now() + interval '1 day 8 hours', '77002', 'Houston', 'TX', 29.7594, -95.3594,
  'Yard moves for the check.', 'Lee Yard', '+17135550100', 1);
insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status)
select '50000065-0000-4000-8000-000000000000', pg_temp.did(n), 1, row_number() over (), '6565', 'sent'
from unnest(array['62', '64', '61']) as n;
select is((select outcome from public.claim_shift(pg_temp.did('62'), '6565')), 'not_eligible', 'a Registered driver cannot book');
select is((select outcome from public.claim_shift(pg_temp.did('64'), '6565')), 'not_eligible', 'an approved row without documents cannot book');
select is((select outcome from public.claim_shift(pg_temp.did('61'), '6565')), 'won', 'the Shift-Ready driver books it');

select * from finish();
rollback;
