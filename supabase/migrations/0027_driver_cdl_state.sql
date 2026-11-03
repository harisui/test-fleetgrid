-- ---------------------------------------------------------------------------
-- 0027: the state that issued the driver's CDL (change request CR-5, part 1, Annie
-- 2026-11-03). Asked on the first sign-up step (default Texas) and, for cards saved before
-- it existed, on a screen every driver must answer before any other page. Additive: the
-- column is nullable, so code deployed before CR-5 keeps working.
--
-- Codes are the 50 states and DC (the same list as US_STATES in src/lib/constants.ts). A
-- driver can change it but never clear it once set; admins and the service role may.
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column cdl_state char(2),
  add constraint drivers_cdl_state_code check (
    cdl_state is null or cdl_state in (
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
      'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
      'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
      'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    )
  );

comment on column public.drivers.cdl_state is 'The state that issued the CDL (CR-5). Shift-Ready needs TX unless an admin overrides it.';

create index drivers_cdl_state_idx on public.drivers (cdl_state);

create function public.protect_driver_cdl_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if old.cdl_state is not null and new.cdl_state is null then
    raise exception 'The CDL state cannot be cleared' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger drivers_protect_cdl_state
  before update on public.drivers
  for each row execute function public.protect_driver_cdl_state();
