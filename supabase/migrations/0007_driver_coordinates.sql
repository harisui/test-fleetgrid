-- ---------------------------------------------------------------------------
-- Where the driver's ZIP sits, in decimal degrees, filled in by the server from the bundled
-- GeoNames dataset whenever the ZIP is saved. Null when the ZIP is unknown. Stored now so a
-- later milestone can match by distance without a backfill; nothing reads it yet.
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column lat numeric(8, 5),
  add column lng numeric(8, 5),
  add constraint drivers_lat_range check (lat is null or lat between -90 and 90),
  add constraint drivers_lng_range check (lng is null or lng between -180 and 180),
  add constraint drivers_coordinates_pair check ((lat is null) = (lng is null));

comment on column public.drivers.lat is 'Latitude of the ZIP centre, from the bundled dataset. Null when unknown.';
comment on column public.drivers.lng is 'Longitude of the ZIP centre, from the bundled dataset. Null when unknown.';
