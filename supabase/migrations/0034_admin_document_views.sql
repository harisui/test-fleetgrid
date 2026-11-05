-- ---------------------------------------------------------------------------
-- 0034: admin views go in the document view log too (M3 additions of 2026-11-03, Part C).
-- Called before a signed link is made, so no link exists without its row. Refused for anyone
-- who is not an admin.
-- ---------------------------------------------------------------------------

create function public.record_admin_document_view(p_document_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_document public.driver_documents;
begin
  if (select public.auth_role()) is distinct from 'admin' then
    return false;
  end if;
  select * into v_document from public.driver_documents where id = p_document_id;
  if not found then
    return false;
  end if;
  insert into public.document_views (viewer_id, viewer_role, driver_id, document_id, document_type)
  values ((select auth.uid()), 'admin', v_document.driver_id, v_document.id, v_document.type);
  return true;
end;
$$;

revoke execute on function public.record_admin_document_view(uuid) from public, anon;
grant execute on function public.record_admin_document_view(uuid) to authenticated;
