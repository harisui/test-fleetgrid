-- ---------------------------------------------------------------------------
-- 0022: the "Clearinghouse and SAP" sign-up screen (client brief of 2026-10-29).
--
-- The sign-up gains an optional screen after the Driving page (step 5,
-- src/lib/onboarding/steps.ts), so every card at step 5 or later moves down one step: nobody
-- is sent back, finished cards move from 11 to 12. The completion rule does not change: the
-- self-report (0021) is never required.
--
-- Deploy note: the code before this change does not know step 12, and the code after it
-- writes 12 for a finished card. Push this migration right as the matching deploy goes live.
-- ---------------------------------------------------------------------------

alter table public.drivers drop constraint drivers_onboarding_step_range;

update public.drivers set onboarding_step = onboarding_step + 1 where onboarding_step >= 5;

alter table public.drivers
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 12);

comment on column public.drivers.onboarding_step is
  'The next screen to show, 1 (the lead) to 12 (done). See src/lib/onboarding/steps.ts.';
