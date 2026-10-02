-- 0005: private storage bucket for driver documents (Milestone 1)
--
-- Object path: {driver_id}/{uuid}.{ext}
-- Drivers can upload, read and delete only inside their own {driver_id}/ folder.
-- Admins can read and delete everything. Carriers get signed URLs from the server in Milestone 2.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

create policy driver_documents_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-documents'
    and (
      (storage.foldername(name))[1] = (select public.current_driver_id())::text
      or (select public.is_admin())
    )
  );

create policy driver_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = (select public.current_driver_id())::text
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
  );

create policy driver_documents_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'driver-documents'
    and (
      (storage.foldername(name))[1] = (select public.current_driver_id())::text
      or (select public.is_admin())
    )
  );
