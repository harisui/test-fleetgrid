-- The driver card answers added by migration 0011 (T1.14), the MVR levels of 0012 and the
-- CDL-only completion rule of 0013: enums, columns, the 12-screen step range and what a
-- completed card must hold.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Enums and columns
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'employment_type', array['w2', 'owner_operator_1099', 'either']);
select enum_has_labels('public', 'driving_style', array['local_day_cab', 'yard_spotter', 'regional', 'otr']);
select enum_has_labels('public', 'transmission_type', array['automatic_only', 'manual_ok']);
select enum_has_labels('public', 'equipment_type', array['container_drayage', 'dry_van', 'flatbed', 'reefer', 'yard_mule']);
select enum_has_labels('public', 'mvr_status', array['clean', 'minor_1_2', 'major_3_plus']);

select col_type_is('drivers', 'employment_type', 'employment_type');
select col_is_null('drivers', 'employment_type', 'employment_type is null until answered');
select col_type_is('drivers', 'driving_styles', 'driving_style[]');
select col_not_null('drivers', 'driving_styles');
select col_default_is('drivers', 'driving_styles', '{}');
select col_type_is('drivers', 'transmission', 'transmission_type');
select col_is_null('drivers', 'transmission');
select col_type_is('drivers', 'equipment_types', 'equipment_type[]');
select col_not_null('drivers', 'equipment_types');
select col_default_is('drivers', 'equipment_types', '{}');
select col_type_is('drivers', 'twic_active', 'boolean');
select col_is_null('drivers', 'twic_active');
select col_type_is('drivers', 'medical_card_active', 'boolean');
select col_is_null('drivers', 'medical_card_active');
select col_type_is('drivers', 'clearinghouse_registered', 'boolean');
select col_is_null('drivers', 'clearinghouse_registered');
select col_type_is('drivers', 'mvr_status', 'mvr_status');
select col_is_null('drivers', 'mvr_status');
select hasnt_column('drivers', 'mvr_clean_3_years', 'the yes-or-no MVR column is gone (0012)');

select has_index('public', 'drivers', 'drivers_driving_styles_idx', array['driving_styles']);
select has_index('public', 'drivers', 'drivers_equipment_types_idx', array['equipment_types']);
select index_is_type('public', 'drivers', 'drivers_driving_styles_idx', 'gin');
select index_is_type('public', 'drivers', 'drivers_equipment_types_idx', 'gin');

-- ---------------------------------------------------------------------------
-- Fixture: one CDL driver's card with the answers of the About mile saved
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values ('11111111-1111-4111-8111-111111111111', '15555559001');
insert into public.profiles (id, role, phone)
  values ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001');
insert into public.drivers (id, profile_id, full_name, state, zip, operator_types, onboarding_step)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Pat Driver',
          'TX', '77002', '{cdl_driver}', 4);

create function pg_temp.update_driver(p_set text) returns text language sql as $$
  select format($f$update public.drivers set %s where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$f$, p_set);
$$;

select results_eq(
  $$select employment_type is null, driving_styles::text, transmission is null, equipment_types::text,
           twic_active is null, medical_card_active is null, clearinghouse_registered is null, mvr_status is null
      from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values (true, '{}', true, '{}', true, true, true, true)$$,
  'the answers start empty'
);

-- ---------------------------------------------------------------------------
-- Values
-- ---------------------------------------------------------------------------
select lives_ok(pg_temp.update_driver($$employment_type = 'owner_operator_1099'$$), 'employment type accepted');
select throws_ok(pg_temp.update_driver($$employment_type = 'contractor'$$), '22P02', null, 'unknown employment type rejected');
select lives_ok(pg_temp.update_driver($$driving_styles = '{local_day_cab,otr}'$$), 'driving styles accepted');
select throws_ok(pg_temp.update_driver($$driving_styles = '{night}'$$), '22P02', null, 'unknown driving style rejected');
select lives_ok(pg_temp.update_driver($$transmission = 'automatic_only'$$), 'transmission accepted');
select throws_ok(pg_temp.update_driver($$transmission = 'stick'$$), '22P02', null, 'unknown transmission rejected');
select lives_ok(pg_temp.update_driver($$equipment_types = '{dry_van,reefer,flatbed}'$$), 'equipment accepted');
select throws_ok(pg_temp.update_driver($$equipment_types = '{tanker}'$$), '22P02', null, 'unknown equipment rejected');
select throws_ok(pg_temp.update_driver($$driving_styles = null$$), '23502', null, 'driving styles cannot be null');
select throws_ok(pg_temp.update_driver($$equipment_types = null$$), '23502', null, 'equipment cannot be null');
select lives_ok(pg_temp.update_driver($$mvr_status = 'minor_1_2'$$), 'an MVR level accepted');
select throws_ok(pg_temp.update_driver($$mvr_status = 'dirty'$$), '22P02', null, 'unknown MVR level rejected');

-- The flow has 12 screens; 12 is the done screen.
select lives_ok(pg_temp.update_driver($$onboarding_step = 12$$), 'onboarding step 12 (done) accepted');
select throws_ok(pg_temp.update_driver($$onboarding_step = 13$$), '23514', null, 'onboarding step 13 rejected');
select throws_ok(pg_temp.update_driver($$onboarding_step = 18$$), '23514', null, 'the old done step 18 is rejected');
select lives_ok(pg_temp.update_driver($$onboarding_step = 4$$), 'onboarding step 4 accepted');

-- ---------------------------------------------------------------------------
-- Completion: the sign-up answers, nothing more. The profile-only answers (W-2 or 1099,
-- driving style, Clearinghouse, availability) may stay empty.
-- ---------------------------------------------------------------------------
select lives_ok(
  pg_temp.update_driver($$employment_type = null, driving_styles = '{}', transmission = null, equipment_types = '{}',
    mvr_status = null, cdl_class = 'A', years_experience = 5, sms_opt_in = true, sms_opt_in_at = now(), sms_opt_in_text = 'I agree'$$),
  'reset to a card with the About and CDL class answers'
);
select throws_ok(pg_temp.update_driver($$card_completed = true$$), '23514', null,
  'a card cannot be completed without the MVR, TWIC, medical card, transmission and equipment answers');
select throws_ok(
  pg_temp.update_driver($$card_completed = true, twic_active = false, medical_card_active = true, transmission = 'manual_ok', equipment_types = '{dry_van}'$$),
  '23514', null, 'a card cannot be completed without the MVR answer'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, mvr_status = 'clean', medical_card_active = true, transmission = 'manual_ok', equipment_types = '{dry_van}'$$),
  '23514', null, 'a card cannot be completed without the TWIC answer'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, mvr_status = 'clean', twic_active = false, transmission = 'manual_ok', equipment_types = '{dry_van}'$$),
  '23514', null, 'a card cannot be completed without the medical card answer'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, mvr_status = 'clean', twic_active = false, medical_card_active = true, equipment_types = '{dry_van}'$$),
  '23514', null, 'a card cannot be completed without a transmission answer'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, mvr_status = 'clean', twic_active = false, medical_card_active = true, transmission = 'manual_ok'$$),
  '23514', null, 'a card cannot be completed without equipment'
);
select throws_ok(
  pg_temp.update_driver($$card_completed = true, cdl_class = 'none', mvr_status = 'clean', twic_active = false, medical_card_active = true,
    transmission = 'manual_ok', equipment_types = '{dry_van}'$$),
  '23514', null, 'a card cannot be completed without a CDL class'
);
select lives_ok(
  pg_temp.update_driver($$card_completed = true, onboarding_step = 12, mvr_status = 'major_3_plus', twic_active = false, medical_card_active = true,
    transmission = 'manual_ok', equipment_types = '{container_drayage,dry_van}'$$),
  'a card completes with every sign-up answer, whatever the answers are, and nothing from the profile page'
);
select results_eq(
  $$select employment_type is null, driving_styles::text, clearinghouse_registered is null, availability::text
      from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values (true, '{}', true, '{}')$$,
  'the profile-only answers stay empty on a completed card'
);
select throws_ok(
  pg_temp.update_driver($$mvr_status = null$$),
  '23514', null, 'a completed card cannot drop a sign-up answer'
);
select throws_ok(
  pg_temp.update_driver($$cdl_class = 'none'$$),
  '23514', null, 'a completed card cannot drop its CDL class'
);
select lives_ok(
  pg_temp.update_driver($$employment_type = 'w2', driving_styles = '{regional}', clearinghouse_registered = true, availability = '{full_time}'$$),
  'the profile-only answers can be filled in later'
);

select * from finish();
rollback;
