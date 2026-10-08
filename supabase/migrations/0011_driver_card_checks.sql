-- ---------------------------------------------------------------------------
-- 0011: the driver card after the client's review of 2026-10-08 (T1.14).
--
-- New answers: employment type (W-2, 1099 or either), driving style, transmission and
-- equipment, an active TWIC card, a current DOT medical card, FMCSA Clearinghouse
-- registration and a clean MVR. The onboarding grows from 13 to 18 screens
-- (src/lib/onboarding/steps.ts). Driving style, transmission, equipment, Clearinghouse and
-- MVR are asked of CDL drivers only, so a card is complete without them unless its work
-- type includes cdl_driver.
-- ---------------------------------------------------------------------------

create type public.employment_type as enum ('w2', 'owner_operator_1099', 'either');
create type public.driving_style as enum ('local_day_cab', 'yard_spotter', 'regional', 'otr');
create type public.transmission_type as enum ('automatic_only', 'manual_ok');
create type public.equipment_type as enum ('container_drayage', 'dry_van', 'flatbed', 'reefer', 'yard_mule');

alter table public.drivers
  add column employment_type public.employment_type,
  add column driving_styles public.driving_style[] not null default '{}',
  add column transmission public.transmission_type,
  add column equipment_types public.equipment_type[] not null default '{}',
  add column twic_active boolean,
  add column medical_card_active boolean,
  add column clearinghouse_registered boolean,
  add column mvr_clean_3_years boolean;

comment on column public.drivers.employment_type is 'W-2 employee, 1099 owner-operator, or either. Null until answered.';
comment on column public.drivers.driving_styles is 'Kinds of driving the driver does. CDL drivers only; empty otherwise.';
comment on column public.drivers.transmission is 'Automatic only, or automatic and manual. CDL drivers only; null otherwise.';
comment on column public.drivers.equipment_types is 'Equipment the driver runs. CDL drivers only; empty otherwise.';
comment on column public.drivers.twic_active is 'Has an active TWIC card. Null until answered.';
comment on column public.drivers.medical_card_active is 'DOT medical card is current. Null until answered.';
comment on column public.drivers.clearinghouse_registered is 'Registered in the FMCSA Clearinghouse. CDL drivers only; null otherwise.';
comment on column public.drivers.mvr_clean_3_years is 'True when the driver reports no moving violations in the last 3 years. CDL drivers only; null otherwise.';

create index drivers_driving_styles_idx on public.drivers using gin (driving_styles);
create index drivers_equipment_types_idx on public.drivers using gin (equipment_types);

-- The new questions sit between the work-type screen (4) and the rest of the flow. Every card
-- that had passed the work-type screen goes back to the first new question (5); its other
-- answers are kept and shown again, so finishing is a few taps. A completed card reopens
-- because the new questions are required: the profile page sends the driver back to
-- onboarding until they are answered, and the original SMS consent is kept.
alter table public.drivers
  drop constraint drivers_onboarding_step_range,
  drop constraint drivers_card_complete;

update public.drivers
   set onboarding_step = 5, card_completed = false
 where onboarding_step >= 5;

alter table public.drivers
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 18),
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
          and mvr_clean_3_years is not null
        )
      )
    )
  );
