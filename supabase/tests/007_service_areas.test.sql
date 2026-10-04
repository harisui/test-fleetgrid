-- Service areas (migration 0010): shape, the two launch areas, the distance helper, the live
-- point-in-area check, and that nobody signed in can touch the table.
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'); -- driver
insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved');

-- Shape
select has_table('public', 'service_areas', 'service_areas exists');
select columns_are('public', 'service_areas', array[
  'id', 'name', 'center_zip', 'center_lat', 'center_lng', 'radius_miles', 'is_active',
  'created_at', 'updated_at'
]);
select col_not_null('service_areas', 'name');
select col_not_null('service_areas', 'center_zip');
select col_not_null('service_areas', 'center_lat');
select col_not_null('service_areas', 'center_lng');
select col_not_null('service_areas', 'radius_miles');
select col_default_is('service_areas', 'is_active', 'true');
select col_is_unique('public', 'service_areas', 'name', 'area names are unique');
select has_trigger('public', 'service_areas', 'service_areas_set_updated_at', 'updated_at trigger exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.service_areas'::regclass),
  'row level security is on'
);
select throws_ok(
  $$insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
    values ('Tiny', '77002', 29.7594, -95.3594, 4)$$,
  '23514', null, 'radius below 5 miles is rejected'
);
select throws_ok(
  $$insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
    values ('Huge', '77002', 29.7594, -95.3594, 251)$$,
  '23514', null, 'radius above 250 miles is rejected'
);
select throws_ok(
  $$insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
    values ('Bad ZIP', '7700', 29.7594, -95.3594, 50)$$,
  '23514', null, 'the centre ZIP must be five digits'
);
select throws_ok(
  $$insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
    values ('Off the map', '77002', 95, -95.3594, 50)$$,
  '23514', null, 'latitude must be within range'
);

-- The launch areas
select results_eq(
  $$select name, center_zip, center_lat::text, center_lng::text, radius_miles, is_active
    from public.service_areas order by name$$,
  $$values
    ('Houston, TX', '77002', '29.75940', '-95.35940', 50, true),
    ('Pasadena, TX', '77506', '29.70090', '-95.19890', 50, true)$$,
  'Houston and Pasadena are seeded, active, 50 miles each'
);

-- Distances (haversine). Reference values from the same formula in JavaScript.
select has_function('public', 'miles_between',
  array['double precision', 'double precision', 'double precision', 'double precision']);
select is(
  round(public.miles_between(29.7594, -95.3594, 29.7009, -95.1989)::numeric, 1),
  10.4::numeric,
  'Houston ZIP 77002 to Pasadena ZIP 77506 is about 10 miles'
);
select is(
  round(public.miles_between(29.7594, -95.3594, 32.7904, -96.8044)::numeric),
  226::numeric,
  'Houston to Dallas is about 225 miles'
);
select is(
  round(public.miles_between(29.7594, -95.3594, 30.2713, -97.7426)::numeric),
  147::numeric,
  'Houston to Austin is about 147 miles'
);
select is(public.miles_between(29.7594, -95.3594, 29.7594, -95.3594), 0::double precision, 'a point is 0 miles from itself');
select is(
  public.miles_between(29.7594, -95.3594, 32.7904, -96.8044),
  public.miles_between(32.7904, -96.8044, 29.7594, -95.3594),
  'distance is symmetric'
);

-- Point in area
select has_function('public', 'is_in_service_area', array['double precision', 'double precision']);
select ok(public.is_in_service_area(29.7594, -95.3594), 'the Houston centre is in area');
select ok(public.is_in_service_area(29.7461, -94.9653), 'Baytown (about 24 miles out) is in area');
select ok(public.is_in_service_area(29.6884, -95.0513), 'La Porte is in area');
select ok(not public.is_in_service_area(32.7904, -96.8044), 'Dallas is out of area');
select ok(not public.is_in_service_area(30.2713, -97.7426), 'Austin is out of area');
select is(public.is_in_service_area(null, null), false, 'no coordinates means not in area');

-- Boundary: a point due north of the Houston centre. 50 miles is one degree of latitude
-- times 50 / 69.0933 (miles per degree at the Earth radius the function uses).
select ok(
  abs(public.miles_between(29.7594, -95.3594, 29.7594 + 0.7236579219, -95.3594) - 50) < 0.001,
  'the boundary point is 50.000 miles from the centre'
);
select ok(public.is_in_service_area(29.7594 + 0.7236579219, -95.3594), 'exactly 50 miles out is still in area');
select ok(
  not public.is_in_service_area(29.7594 + 0.7238026, -95.3594),
  '50.01 miles out is out of area'
);

-- Live: deactivating and resizing areas changes the answer at once.
update public.service_areas set is_active = false;
select ok(not public.is_in_service_area(29.7594, -95.3594), 'inactive areas are ignored');
update public.service_areas set is_active = true where name = 'Pasadena, TX';
select ok(public.is_in_service_area(29.7594, -95.3594), 'Houston centre is in area through Pasadena alone');
update public.service_areas set radius_miles = 5 where name = 'Pasadena, TX';
select ok(not public.is_in_service_area(29.7594, -95.3594), 'shrinking the only active area drops the point');
select ok(
  (select updated_at > created_at from public.service_areas where name = 'Pasadena, TX'),
  'updated_at moves on update'
);
update public.service_areas set is_active = true, radius_miles = 50;

-- Access
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

select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');
select throws_ok($$select * from public.service_areas$$, '42501', null, 'a driver cannot read the table');
select throws_ok(
  $$insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles)
    values ('Mine', '77002', 29.7594, -95.3594, 50)$$,
  '42501', null, 'a driver cannot add an area'
);
select throws_ok($$update public.service_areas set is_active = false$$, '42501', null, 'a driver cannot change an area');
select ok(public.is_in_service_area(29.7594, -95.3594), 'a signed-in user can ask whether a point is in area');
select is(round(public.miles_between(29.7594, -95.3594, 32.7904, -96.8044)::numeric), 226::numeric, 'a signed-in user can measure a distance');
select pg_temp.sign_out();

set local role anon;
select throws_ok($$select public.is_in_service_area(29.7594, -95.3594)$$, '42501', null, 'anonymous visitors cannot call the check');
select throws_ok($$select * from public.service_areas$$, '42501', null, 'anonymous visitors cannot read the table');
reset role;

select * from finish();
rollback;
