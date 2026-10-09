-- ---------------------------------------------------------------------------
-- 0013: the short sign-up, CDL drivers only (client decisions of 2026-10-09).
--
-- The flow drops from 18 screens to 12 in six miles (src/lib/onboarding/steps.ts): name,
-- ZIP, distance | CDL class, years, MVR | TWIC and medical card | endorsements, transmission
-- | equipment | consent, done. Work type is no longer asked: every card is a CDL driver at
-- launch. W-2 or 1099, driving style, availability, certifications, papers, Clearinghouse
-- and about you leave the sign-up and stay on the profile page, optional.
--
-- Existing cards: the work type becomes CDL driver, progress is re-pointed at the first
-- page of the new flow whose answers are missing, and a completed card without the
-- answers the new rule requires reopens.
-- ---------------------------------------------------------------------------

alter table public.drivers
  drop constraint drivers_onboarding_step_range,
  drop constraint drivers_card_complete;

update public.drivers
   set operator_types = '{cdl_driver}',
       card_completed = card_completed
         and cdl_class <> 'none'
         and years_experience is not null
         and mvr_status is not null
         and twic_active is not null
         and medical_card_active is not null
         and transmission is not null
         and cardinality(equipment_types) > 0,
       onboarding_step = case
         when onboarding_step <= 3 then onboarding_step
         when cdl_class = 'none' then 4
         when years_experience is null then 5
         when mvr_status is null then 6
         when twic_active is null or medical_card_active is null then 7
         -- Endorsements were screen 11 of the old flow; "none" is a valid answer, so the
         -- old step number is the only sign they were answered.
         when onboarding_step <= 11 then 8
         when transmission is null then 9
         when cardinality(equipment_types) = 0 then 10
         when card_completed then 12
         else 11
       end;

alter table public.drivers
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 12),
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
      and sms_opt_in
    )
  );

comment on column public.drivers.operator_types is 'CDL driver for every card at launch (2026-10-09); other work types return when the client opens them up.';
comment on column public.drivers.employment_type is 'W-2 employee, 1099 owner-operator, or either. Profile page only; null until answered.';
comment on column public.drivers.driving_styles is 'Kinds of driving the driver does. Profile page only; empty until answered.';
comment on column public.drivers.clearinghouse_registered is 'Registered in the FMCSA Clearinghouse. Profile page only; null until answered.';
comment on column public.drivers.availability is 'When the driver can work. Profile page only; empty until answered.';
