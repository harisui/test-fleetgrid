-- ---------------------------------------------------------------------------
-- 0014: the launch scope after the client's review of 2026-10-11 (T1.17).
--
-- Class A and B only (no Class C); the freight endorsements H, N, T and X (no P or S);
-- no yard spotter or OTR driving style (local shift coverage only); no yard mule; and
-- 1099 means a contractor, never an owner-operator (drivers run the carrier's truck).
--
-- Postgres cannot drop a value from an enum, so each enum is recreated without the retired
-- values once no row holds them. A Class C card goes back to the CDL page with its card
-- reopened; a card whose only equipment was the yard mule goes back to the Equipment page.
-- ---------------------------------------------------------------------------

-- Both constraints that mention cdl_class or endorsements go first: a check constraint keeps
-- the old enum type inside its stored expression, so the column type cannot change under it.
alter table public.drivers
  drop constraint drivers_card_complete,
  drop constraint drivers_endorsements_need_cdl;

-- Class C is no longer a class FleetGrid lists. The endorsements go with it (they need a
-- class), and the Letters page asks again after the CDL page.
update public.drivers
   set cdl_class = 'none',
       endorsements = '{}',
       card_completed = false,
       onboarding_step = least(onboarding_step, 4)
 where cdl_class = 'C';

update public.drivers
   set endorsements = array_remove(array_remove(endorsements, 'P'), 'S')
 where endorsements && '{P,S}'::public.endorsement[];

update public.drivers
   set driving_styles = array_remove(array_remove(driving_styles, 'yard_spotter'), 'otr')
 where driving_styles && '{yard_spotter,otr}'::public.driving_style[];

update public.drivers
   set equipment_types = array_remove(equipment_types, 'yard_mule')
 where 'yard_mule' = any(equipment_types);

update public.drivers
   set card_completed = false,
       onboarding_step = 10
 where cardinality(equipment_types) = 0
   and onboarding_step > 10;

-- cdl_class: A, B, none
alter type public.cdl_class rename to cdl_class_old;
create type public.cdl_class as enum ('A', 'B', 'none');
alter table public.drivers
  alter column cdl_class drop default,
  alter column cdl_class type public.cdl_class using cdl_class::text::public.cdl_class,
  alter column cdl_class set default 'none';
drop type public.cdl_class_old;

-- endorsement: H, N, T, X
alter type public.endorsement rename to endorsement_old;
create type public.endorsement as enum ('H', 'N', 'T', 'X');
alter table public.drivers
  alter column endorsements drop default,
  alter column endorsements type public.endorsement[] using endorsements::text[]::public.endorsement[],
  alter column endorsements set default '{}';
drop type public.endorsement_old;

-- driving_style: local_day_cab, regional
alter type public.driving_style rename to driving_style_old;
create type public.driving_style as enum ('local_day_cab', 'regional');
alter table public.drivers
  alter column driving_styles drop default,
  alter column driving_styles type public.driving_style[] using driving_styles::text[]::public.driving_style[],
  alter column driving_styles set default '{}';
drop type public.driving_style_old;

-- equipment_type: container_drayage, dry_van, flatbed, reefer
alter type public.equipment_type rename to equipment_type_old;
create type public.equipment_type as enum ('container_drayage', 'dry_van', 'flatbed', 'reefer');
alter table public.drivers
  alter column equipment_types drop default,
  alter column equipment_types type public.equipment_type[] using equipment_types::text[]::public.equipment_type[],
  alter column equipment_types set default '{}';
drop type public.equipment_type_old;

-- employment_type: the 1099 answer is a contractor, not an owner-operator.
alter type public.employment_type rename value 'owner_operator_1099' to 'contractor_1099';

alter table public.drivers
  add constraint drivers_endorsements_need_cdl check (
    cdl_class <> 'none' or cardinality(endorsements) = 0
  ),
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

comment on column public.drivers.cdl_class is 'Class A or B (the launch scope, 2026-10-11). "none" until the class is picked.';
comment on column public.drivers.endorsements is 'The freight endorsements H, N, T and X. X always comes with H and N.';
comment on column public.drivers.employment_type is 'W-2 employee, 1099 contractor, or either. Profile page only; null until answered.';
comment on column public.drivers.driving_styles is 'Local day cab or regional. Profile page only; empty until answered.';
comment on column public.drivers.equipment_types is 'Container drayage, dry van, flatbed, reefer. At least one on a completed card.';
