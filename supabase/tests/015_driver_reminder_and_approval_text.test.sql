-- 0025: the one-time profile reminder and approval text: who is due, once ever, and who may
-- touch the stamps.
begin;
select no_plan();

select has_column('public', 'drivers', 'reminder_sent_at', 'drivers carry the reminder stamp');
select has_column('public', 'drivers', 'approval_text_due_at', 'drivers carry the approval queue stamp');
select has_column('public', 'drivers', 'approval_text_sent_at', 'drivers carry the approval sent stamp');
select ok(
  not has_function_privilege('authenticated', 'public.claim_profile_reminders(integer)', 'execute'),
  'signed-in users cannot claim reminders'
);

-- The local seed's drivers must not answer for this file.
update public.drivers set reminder_sent_at = now(), approval_text_due_at = now(), approval_text_sent_at = now();

-- Drivers 21 to 27, all incomplete, consenting and idle for two days, except where noted.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555594' || n
from unnest(array['21', '22', '23', '24', '25', '26', '27']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'driver', '+155555594' || n,
  (case when n = '24' then 'blocked' else 'pending' end)::public.account_status
from unnest(array['21', '22', '23', '24', '25', '26', '27']) as n;

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 3,
  n <> '22', case when n <> '22' then now() end, case when n <> '22' then 'consent' end
from unnest(array['21', '22', '23', '24', '25', '26', '27']) as n;

update public.drivers set sms_opted_out = true, sms_opted_out_at = now() where id = pg_temp.did('23');
update public.drivers set shifts_paused = true where id = pg_temp.did('25');
-- 27 finished its card (all the answers, then complete).
update public.drivers set cdl_class = 'A', state = 'TX', zip = '77002', years_experience = 5, mvr_status = 'clean',
  twic_active = true, medical_card_active = true, transmission = 'manual_ok', equipment_types = '{dry_van}',
  onboarding_step = 12, card_completed = true
where id = pg_temp.did('27');
-- Everyone idle for two days, except 26, active an hour ago. The trigger keeps updated_at at
-- now(), so it is set with the trigger off.
alter table public.drivers disable trigger drivers_set_updated_at;
update public.drivers set updated_at = now() - interval '2 days' where id in (select pg_temp.did(n) from unnest(array['21','22','23','24','25','27']) as n);
update public.drivers set updated_at = now() - interval '1 hour' where id = pg_temp.did('26');
alter table public.drivers enable trigger drivers_set_updated_at;

select results_eq(
  $$ select driver_id from public.claim_profile_reminders() $$,
  $$ values ('d0000021-0000-4000-8000-000000000000'::uuid) $$,
  'only the consenting, not opted out, not blocked, not paused, unfinished, idle driver is due'
);
select isnt((select reminder_sent_at from public.drivers where id = pg_temp.did('21')), null, 'the reminder is stamped');
select is_empty($$ select * from public.claim_profile_reminders() $$, 'a second run sends nothing: one reminder, ever');

-- The approval text.
-- The approval text is about the queue, not the Shift-Ready gate (CR-5), so the gate is off
-- while the fixture approves an unfinished card.
alter table public.profiles disable trigger profiles_shift_ready_gate;
update public.profiles set status = 'approved' where id = 'e0000021-0000-4000-8000-000000000000';
alter table public.profiles enable trigger profiles_shift_ready_gate;
select ok(public.queue_approval_text(pg_temp.did('21'), now() + interval '8 hours'), 'a night approval is queued for later');
select is_empty($$ select * from public.claim_approval_texts('d0000021-0000-4000-8000-000000000000') $$, 'nothing goes before it is due');
select ok(not public.queue_approval_text(pg_temp.did('21'), null), 'a second approval queues nothing');
update public.drivers set approval_text_due_at = now() - interval '1 minute' where id = pg_temp.did('21');
select results_eq(
  $$ select driver_id from public.claim_approval_texts() $$,
  $$ values ('d0000021-0000-4000-8000-000000000000'::uuid) $$,
  'at 7 AM the queued text is claimed'
);
select is_empty($$ select * from public.claim_approval_texts() $$, 'and never again');
select ok(not public.queue_approval_text(pg_temp.did('22'), null), 'no consent, nothing queued');
select ok(not public.queue_approval_text(pg_temp.did('23'), null), 'opted out, nothing queued');

-- A driver cannot set or clear the stamps.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000021-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.drivers set reminder_sent_at = null where id = 'd0000021-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot clear the reminder stamp');
select throws_ok($$ update public.drivers set approval_text_sent_at = null where id = 'd0000021-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot clear the approval stamp');
reset role;

select * from finish();
rollback;
