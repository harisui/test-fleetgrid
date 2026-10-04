-- ---------------------------------------------------------------------------
-- "Other papers" (document type certification) hold up to five files per driver. The
-- service refuses a sixth before issuing an upload token; this trigger makes the database
-- refuse it too, as a check violation (23514) so the app shows it as a validation error.
-- ---------------------------------------------------------------------------

create function public.enforce_certification_document_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if new.type <> 'certification' then
    return new;
  end if;
  select count(*) into current_count
    from public.driver_documents
   where driver_id = new.driver_id and type = 'certification';
  if current_count >= 5 then
    raise exception 'A driver can keep at most 5 certification documents'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger driver_documents_certification_limit
  before insert on public.driver_documents
  for each row execute function public.enforce_certification_document_limit();
