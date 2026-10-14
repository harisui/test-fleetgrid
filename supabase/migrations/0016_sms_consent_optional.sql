-- ---------------------------------------------------------------------------
-- 0016: shift-text consent is optional (2026-10-14, for the Twilio toll-free review).
--
-- Twilio rejects a program where SMS consent is a condition of creating the account. The
-- last sign-up screen keeps its box, but the card completes with or without it, and a
-- driver who declined is still listed to subscribed carriers, marked "No shift texts" in
-- the app. A driver who replied STOP stays listed the same way; only START turns texts back
-- on. The opt-in evidence rule (0002) and the consent log (0009) are unchanged.
-- ---------------------------------------------------------------------------

alter table public.drivers
  drop constraint drivers_card_complete;

alter table public.drivers
  add constraint drivers_card_complete check (
    not card_completed
    or (
      state is not null
      and zip is not null
      and cardinality(operator_types) > 0
      and cdl_class <> 'none'
      and years_experience is not null
      and mvr_status is not null
      and twic_active is not null
      and medical_card_active is not null
      and transmission is not null
      and cardinality(equipment_types) > 0
    )
  );

comment on column public.drivers.sms_opt_in is
  'Shift-text consent, optional since 0016. A listed driver without it is shown to carriers marked "No shift texts".';

-- Listed drivers: approved, complete, inside an active area. Consent no longer gates it.
drop policy drivers_select_subscribed_carrier on public.drivers;

create policy drivers_select_subscribed_carrier on public.drivers
  for select to authenticated
  using (
    (select public.auth_role()) = 'carrier'
    and (select public.carrier_has_active_subscription())
    and card_completed
    and public.profile_status(profile_id) = 'approved'
    and lat is not null
    and lng is not null
    and public.is_in_service_area(lat::double precision, lng::double precision)
  );
