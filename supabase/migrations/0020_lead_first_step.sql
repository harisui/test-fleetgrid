-- ---------------------------------------------------------------------------
-- 0020: the faster first step (client brief of 2026-10-28, Milestone 3 part 5).
--
-- Mile 1 is now one screen, the lead: name, ZIP, CDL class and the optional shift-text
-- consent. Saving it creates the card at once (card_completed false, the captured lead).
-- The flow (src/lib/onboarding/steps.ts) is then: 1 lead | 2 distance, 3 years, 4 record |
-- 5 cards | 6 endorsements, 7 transmission | 8 equipment | 9 heard from, 10 consent, 11 done.
-- The end consent screen shows only to drivers who did not opt in on the lead.
--
-- Existing cards keep their place: a card without a ZIP or a class goes back to the lead
-- (its name and ZIP are filled in), every other card moves down by the two screens that
-- left the flow (ZIP and CDL class joined the name on the lead), and a finished card sits
-- on the new done step. Nobody is sent backwards past an unanswered question.
-- ---------------------------------------------------------------------------

alter table public.drivers drop constraint drivers_onboarding_step_range;

update public.drivers
   set onboarding_step = case
     when card_completed then 11
     when zip is null or cdl_class = 'none' then 1
     when onboarding_step >= 5 then onboarding_step - 2
     else 2
   end;

alter table public.drivers
  add constraint drivers_onboarding_step_range check (onboarding_step between 1 and 11);

comment on column public.drivers.onboarding_step is
  'The next screen to show, 1 (the lead: name, ZIP, class, consent) to 11 (done). See src/lib/onboarding/steps.ts.';
