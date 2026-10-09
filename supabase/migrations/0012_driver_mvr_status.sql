-- ---------------------------------------------------------------------------
-- 0012: the MVR answer in three levels (client decision of 2026-10-09).
--
-- The record screen asked "Any moving violations in the last 3 years?" as None / One or
-- more (mvr_clean_3_years). The client wants three levels instead: clean, 1 to 2 minor
-- violations, 3 or more or a major one. A clean answer carries over; "one or more" cannot be
-- split into the new levels, so those drivers answer the record screen (15) again and their
-- card reopens until they do. CDL drivers only, like the rest of the record screen.
-- ---------------------------------------------------------------------------

create type public.mvr_status as enum ('clean', 'minor_1_2', 'major_3_plus');

alter table public.drivers
  add column mvr_status public.mvr_status;

comment on column public.drivers.mvr_status is 'Moving violations in the last 3 years: none, 1 to 2 minor, or 3 or more or a major one. CDL drivers only; null otherwise.';

alter table public.drivers
  drop constraint drivers_card_complete;

update public.drivers
   set mvr_status = 'clean'
 where mvr_clean_3_years = true;

update public.drivers
   set onboarding_step = 15, card_completed = false
 where mvr_clean_3_years = false
   and onboarding_step > 15;

alter table public.drivers
  drop column mvr_clean_3_years;

alter table public.drivers
  add constraint drivers_card_complete check (
    not card_completed
    or (
      state is not null
      and zip is not null
      and cardinality(operator_types) > 0
      and employment_type is not null
      and years_experience is not null
      and cardinality(availability) > 0
      and twic_active is not null
      and medical_card_active is not null
      and sms_opt_in
      and (
        not ('cdl_driver' = any(operator_types))
        or (
          cdl_class <> 'none'
          and cardinality(driving_styles) > 0
          and transmission is not null
          and cardinality(equipment_types) > 0
          and clearinghouse_registered is not null
          and mvr_status is not null
        )
      )
    )
  );
