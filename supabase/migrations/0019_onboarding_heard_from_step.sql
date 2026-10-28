-- Milestone 3, part 4 (client brief of 2026-10-28): "How did you hear about FleetGrid?" is a
-- screen of its own before the consent, so the flow has thirteen steps. Cards that were
-- done (step 12) are done still (step 13); a card about to see the consent (11) now sees
-- the question first, which is optional.
alter table public.drivers drop constraint drivers_onboarding_step_range;

update public.drivers set onboarding_step = 13 where onboarding_step = 12;

alter table public.drivers
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 13);
