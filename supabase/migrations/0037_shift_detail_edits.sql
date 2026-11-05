-- ---------------------------------------------------------------------------
-- 0037: a carrier edits a shift's details (T3.3, user decision of 2026-11-05).
--
-- Only the work description, the on-site contact and the pay line, on a shift still open or
-- booked and not over. Nothing here sends a text: the booked driver reads them on My shifts.
-- The time, place and requirements cannot change this way: drivers decide on them, so those go
-- through cancel and repost. Each real change is an append-only 'edited' row in shift_events,
-- with who made it and each field's old and new value.
-- ---------------------------------------------------------------------------

alter table public.shift_events drop constraint shift_events_kind;
alter table public.shift_events add constraint shift_events_kind
  check (kind in ('booked', 'check_in', 'started', 'ended', 'released', 'cancelled', 'edited'));

create function public.edit_shift_details(
  p_shift_id uuid,
  p_actor uuid,
  p_work_description text,
  p_onsite_contact_name text,
  p_onsite_contact_phone text,
  p_pay_text text
)
returns setof public.shifts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_changes jsonb := '{}'::jsonb;
begin
  select * into v_shift
  from public.shifts
  where id = p_shift_id and status in ('open', 'booked') and ends_at > now()
  for update;

  if not found then
    return;
  end if;

  if v_shift.work_description is distinct from p_work_description then
    v_changes := v_changes || jsonb_build_object('work_description', jsonb_build_object('from', v_shift.work_description, 'to', p_work_description));
  end if;
  if v_shift.onsite_contact_name is distinct from p_onsite_contact_name then
    v_changes := v_changes || jsonb_build_object('onsite_contact_name', jsonb_build_object('from', v_shift.onsite_contact_name, 'to', p_onsite_contact_name));
  end if;
  if v_shift.onsite_contact_phone is distinct from p_onsite_contact_phone then
    v_changes := v_changes || jsonb_build_object('onsite_contact_phone', jsonb_build_object('from', v_shift.onsite_contact_phone, 'to', p_onsite_contact_phone));
  end if;
  if v_shift.pay_text is distinct from p_pay_text then
    v_changes := v_changes || jsonb_build_object('pay_text', jsonb_build_object('from', v_shift.pay_text, 'to', p_pay_text));
  end if;

  if v_changes = '{}'::jsonb then
    return next v_shift;
    return;
  end if;

  update public.shifts
  set work_description = p_work_description,
      onsite_contact_name = p_onsite_contact_name,
      onsite_contact_phone = p_onsite_contact_phone,
      pay_text = p_pay_text
  where id = p_shift_id
  returning * into v_shift;

  insert into public.shift_events (shift_id, driver_id, kind, detail)
  values (p_shift_id, v_shift.booked_driver_id, 'edited', jsonb_build_object('by', p_actor, 'changes', v_changes));

  return next v_shift;
end;
$$;

revoke execute on function public.edit_shift_details(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.edit_shift_details(uuid, uuid, text, text, text, text) to service_role;
