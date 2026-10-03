-- ---------------------------------------------------------------------------
-- Onboarding is one question per screen (13 screens, see src/lib/onboarding/steps.ts).
-- The card is created on the first screen with only the name, so state and ZIP
-- become nullable. onboarding_step stores the number of the next screen (1 to 13,
-- 13 is the done screen). A card can only be completed once location, work type,
-- experience, availability and SMS consent are present, and a CDL driver has a class.
-- ---------------------------------------------------------------------------

alter table public.drivers
  alter column state drop not null,
  alter column zip drop not null;

alter table public.drivers
  drop constraint drivers_onboarding_step_range,
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 13);

alter table public.drivers
  drop constraint drivers_card_complete,
  add constraint drivers_card_complete check (
    not card_completed
    or (
      state is not null
      and zip is not null
      and cardinality(operator_types) > 0
      and years_experience is not null
      and cardinality(availability) > 0
      and sms_opt_in
      and (not ('cdl_driver' = any(operator_types)) or cdl_class <> 'none')
    )
  );

-- Cards finished under the old six-step flow are already complete: point them at the done screen.
update public.drivers set onboarding_step = 13 where card_completed;
