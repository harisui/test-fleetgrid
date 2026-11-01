-- ---------------------------------------------------------------------------
-- 0024: Milestone 3 admin (T3.11): admins add and edit the service areas. Reads were opened
-- to admins in 0017. Nobody deletes an area: an admin deactivates it, so the history of
-- where FleetGrid ran stays. Drivers, carriers and anonymous visitors still read nothing.
-- ---------------------------------------------------------------------------

grant insert, update on public.service_areas to authenticated;

create policy service_areas_insert_admin on public.service_areas
  for insert to authenticated
  with check ((select public.is_admin()));

create policy service_areas_update_admin on public.service_areas
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
