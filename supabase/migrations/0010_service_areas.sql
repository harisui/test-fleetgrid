-- ---------------------------------------------------------------------------
-- Service areas: where FleetGrid is live. A driver whose ZIP sits inside an active area is
-- "in area"; everyone else can still sign up and is told the launch has not reached them.
-- Membership is computed live by is_in_service_area(), never stored, so changing an area
-- takes effect at once. Admin management arrives in Milestone 3; until then the two launch
-- areas below are the data.
--
-- No signed-in role may read or write the table. Server code reads through the service role,
-- and the point-in-area check runs as a security definer function that only signed-in users
-- and the service role may call.
-- ---------------------------------------------------------------------------

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  center_zip text not null,
  center_lat numeric(8, 5) not null,
  center_lng numeric(8, 5) not null,
  radius_miles integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_areas_name_present check (length(btrim(name)) > 0),
  constraint service_areas_center_zip_format check (center_zip ~ '^[0-9]{5}$'),
  constraint service_areas_center_lat_range check (center_lat between -90 and 90),
  constraint service_areas_center_lng_range check (center_lng between -180 and 180),
  constraint service_areas_radius_range check (radius_miles between 5 and 250)
);

comment on table public.service_areas is
  'Launch areas: a centre ZIP with its coordinates and a radius in miles. Membership is computed live.';

create trigger service_areas_set_updated_at
  before update on public.service_areas
  for each row execute function public.set_updated_at();

alter table public.service_areas enable row level security;
revoke all on public.service_areas from anon, authenticated;
-- No policies on purpose: nobody signed in reads or writes the table directly.

-- Great-circle distance in statute miles (haversine, mean Earth radius 3958.7613 miles).
create function public.miles_between(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select 2 * 3958.7613 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- True when the point is within radius_miles of any active area. A point exactly on the
-- edge counts as inside: the distance is rounded to a thousandth of a mile (about 1.6
-- metres) before the comparison, so floating-point noise never pushes an edge point out.
create function public.is_in_service_area(lat double precision, lng double precision)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_areas area
    where area.is_active
      and round(public.miles_between(lat, lng, area.center_lat, area.center_lng)::numeric, 3)
        <= area.radius_miles
  );
$$;

revoke execute on function public.miles_between(double precision, double precision, double precision, double precision) from public, anon;
revoke execute on function public.is_in_service_area(double precision, double precision) from public, anon;
grant execute on function public.miles_between(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.is_in_service_area(double precision, double precision) to authenticated, service_role;

-- The launch areas. Coordinates are the ZIP centres from the bundled dataset (src/data/us-zips.tsv).
insert into public.service_areas (name, center_zip, center_lat, center_lng, radius_miles) values
  ('Houston, TX', '77002', 29.7594, -95.3594, 50),
  ('Pasadena, TX', '77506', 29.7009, -95.1989, 50);
