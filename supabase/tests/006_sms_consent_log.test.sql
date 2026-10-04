-- SMS consent log (migration 0009): shape, who may read, nobody signed in may write, and
-- rows outlive the account they describe.
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'), -- driver
  ('33333333-3333-4333-8333-333333333333', '15555559003'), -- admin
  ('44444444-4444-4444-8444-444444444444', '15555559004'); -- carrier

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'carrier', '+15555559004', 'approved');

select has_table('public', 'sms_consent_log', 'sms_consent_log exists');
select columns_are('public', 'sms_consent_log',
  array['id', 'phone', 'event', 'consent_text', 'consent_version', 'source', 'created_at']);
select enum_has_labels('public', 'sms_consent_event', array['opt_in', 'opt_out', 'opt_in_again']);
select enum_has_labels('public', 'sms_consent_source', array['onboarding', 'sms_stop', 'sms_start', 'profile']);
select col_not_null('sms_consent_log', 'phone');
select col_not_null('sms_consent_log', 'consent_text');
select col_not_null('sms_consent_log', 'consent_version');
select col_default_is('sms_consent_log', 'created_at', 'now()');
select has_index('public', 'sms_consent_log', 'sms_consent_log_phone_idx', 'phone index exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sms_consent_log'::regclass),
  'row level security is on'
);
-- No foreign key: deleting the user must not delete the proof.
select results_eq(
  $$select count(*)::int from pg_constraint where conrelid = 'public.sms_consent_log'::regclass and contype = 'f'$$,
  $$values (0)$$,
  'the log has no foreign keys'
);

-- The service role (here: the test's superuser session) writes.
insert into public.sms_consent_log (phone, event, consent_text, consent_version, source) values
  ('+15555559001', 'opt_in', 'I agree to receive text messages from FleetGrid.', '2026-10-v1', 'onboarding');
select throws_ok(
  $$insert into public.sms_consent_log (phone, event, consent_text, consent_version, source)
    values ('5555559001', 'opt_in', 'text', '2026-10-v1', 'onboarding')$$,
  '23514', null, 'phone must be E.164'
);
select throws_ok(
  $$insert into public.sms_consent_log (phone, event, consent_text, consent_version, source)
    values ('+15555559001', 'opt_in', ' ', '2026-10-v1', 'onboarding')$$,
  '23514', null, 'consent text must be present'
);
select throws_ok(
  $$insert into public.sms_consent_log (phone, event, consent_text, consent_version, source)
    values ('+15555559001', 'opt_in', 'text', ' ', 'onboarding')$$,
  '23514', null, 'consent version must be present'
);

create function pg_temp.sign_in(p_user uuid, p_phone text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'phone', p_phone)::text,
    true
  );
  set local role authenticated;
end;
$$;

create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Driver: sees nothing, writes nothing.
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');
select is_empty('select * from public.sms_consent_log', 'a driver cannot read the log, not even their own number');
select throws_ok(
  $$insert into public.sms_consent_log (phone, event, consent_text, consent_version, source)
    values ('+15555559001', 'opt_out', 'STOP', '2026-10-v1', 'sms_stop')$$,
  '42501', null, 'a driver cannot write to the log'
);
select throws_ok($$delete from public.sms_consent_log$$, '42501', null, 'a driver cannot delete from the log');
select pg_temp.sign_out();

-- Carrier: nothing either.
select pg_temp.sign_in('44444444-4444-4444-8444-444444444444', '15555559004');
select is_empty('select * from public.sms_consent_log', 'a carrier cannot read the log');
select pg_temp.sign_out();

-- Admin: read only.
select pg_temp.sign_in('33333333-3333-4333-8333-333333333333', '15555559003');
select results_eq(
  $$select phone, event::text, source::text, consent_version from public.sms_consent_log$$,
  $$values ('+15555559001', 'opt_in', 'onboarding', '2026-10-v1')$$,
  'an admin reads the log'
);
select throws_ok(
  $$insert into public.sms_consent_log (phone, event, consent_text, consent_version, source)
    values ('+15555559001', 'opt_out', 'STOP', '2026-10-v1', 'sms_stop')$$,
  '42501', null, 'an admin cannot write to the log'
);
select throws_ok($$delete from public.sms_consent_log$$, '42501', null, 'an admin cannot delete from the log');
select pg_temp.sign_out();

-- Anonymous: no privileges at all.
set local role anon;
select throws_ok($$select * from public.sms_consent_log$$, '42501', null, 'anonymous cannot read the log');
reset role;

-- The proof outlives the account.
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is_empty(
  $$select * from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  'the profile is gone with the user'
);
select results_eq(
  $$select count(*)::int from public.sms_consent_log where phone = '+15555559001'$$,
  $$values (1)$$,
  'the consent row is still there after the user is deleted'
);

select * from finish();
rollback;
