-- The driver card answers added by migration 0011 (T1.14) and the MVR levels of 0012: enums,
-- columns, the 18-screen step range and the completion rule for CDL drivers and everyone else.
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
-- Fixture: one driver with a card that has every answer of the old flow
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values ('11111111-1111-4111-8111-111111111111', '15555559001');
insert into public.profiles (id, role, phone)
  values ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001');
insert into public.drivers (id, profile_id, full_name, state, zip, operator_types, cdl_class, endorsements,
                            years_experience, availability, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Pat Driver',
          'TX', '77002', '{yard_spotter}', 'none', '{}', 5, '{full_time}', true, now(), 'I agree');

create function pg_temp.update_driver(p_set text) returns text language sql as $$
  select format($f$update public.drivers set %s where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$f$, p_set);
$$;

select results_eq(
  $$select employment_type is null, driving_styles::text, transmission is null, equipment_types::text,
           twic_active is null, medical_card_active is null, clearinghouse_registered is null, mvr_status is null
      from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values (true, '{}', true, '{}', true, true, true, true)$$,
  'the new answers start empty'
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

-- The flow has 18 screens; 18 is the done screen.
select lives_ok(pg_temp.update_driver($$onboarding_step = 18$$), 'onboarding step 18 (done) accepted');
select throws_ok(pg_temp.update_driver($$onboarding_step = 19$$), '23514', null, 'onboarding step 19 rejected');
select lives_ok(pg_temp.update_driver($$onboarding_step = 5$$), 'onboarding step 5 accepted');

-- ---------------------------------------------------------------------------
-- Completion: everyone answers employment type, TWIC and medical card
-- ---------------------------------------------------------------------------
select lives_ok(
  pg_temp.update_driver($$employment_type = null, twic_active = null, medical_card_active = null,
    driving_styles = '{}', transmission = null, equipment_types = '{}', mvr_status = null$$),
  'reset'
);
select throws_ok(pg_temp.update_driver($$card_completed = true$$), '23514', null,
  'a card cannot be completed without employment type, TWIC and medical card');
select throws_ok(pg_temp.update_driver($$card_completed = true, employment_type = 'w2'$$), '23514', null,
  'a card cannot be completed without the TWIC and medical card answers');
select throws_ok(pg_temp.update_driver($$card_completed = true, employment_type = 'w2', twic_active = false$$), '23514', null,
  'a card cannot be completed without the medical card answer');
select lives_ok(
  pg_temp.update_driver($$card_completed = true, onboarding_step = 18, employment_type = 'w2', twic_active = false, medical_card_active = true$$),
  'a yard spotter completes with employment type, TWIC and medical card; the CDL checks are not needed'
);
select results_eq(
  $$select driving_styles::text, transmission is null, equipment_types::text, clearinghouse_registered is null, mvr_status is null
      from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values ('{}', true, '{}', true, true)$$,
  'the CDL-only answers stay empty on a completed non-CDL card'
);

-- ---------------------------------------------------------------------------
-- Completion: a CDL driver also answers driving style, transmission, equipment,
-- Clearinghouse and MVR
-- ---------------------------------------------------------------------------
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A'$$),
  '23514', null, 'a completed card cannot become a CDL driver card without the CDL checks'
);
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A', driving_styles = '{regional}',
    transmission = 'manual_ok', equipment_types = '{dry_van}', clearinghouse_registered = true$$),
  '23514', null, 'a CDL driver cannot complete without the MVR answer'
);
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A', driving_styles = '{regional}',
    transmission = 'manual_ok', equipment_types = '{dry_van}', mvr_status = 'clean'$$),
  '23514', null, 'a CDL driver cannot complete without the Clearinghouse answer'
);
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A', driving_styles = '{}',
    transmission = 'manual_ok', equipment_types = '{dry_van}', clearinghouse_registered = true, mvr_status = 'clean'$$),
  '23514', null, 'a CDL driver cannot complete without a driving style'
);
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A', driving_styles = '{regional}',
    transmission = null, equipment_types = '{dry_van}', clearinghouse_registered = true, mvr_status = 'clean'$$),
  '23514', null, 'a CDL driver cannot complete without a transmission answer'
);
select throws_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver}', cdl_class = 'A', driving_styles = '{regional}',
    transmission = 'manual_ok', equipment_types = '{}', clearinghouse_registered = true, mvr_status = 'clean'$$),
  '23514', null, 'a CDL driver cannot complete without equipment'
);
select lives_ok(
  pg_temp.update_driver($$operator_types = '{cdl_driver,yard_spotter}', cdl_class = 'A', driving_styles = '{local_day_cab,regional}',
    transmission = 'manual_ok', equipment_types = '{container_drayage,dry_van}', clearinghouse_registered = true, mvr_status = 'major_3_plus'$$),
  'a CDL driver completes with every check answered, whatever the answers are'
);
select throws_ok(
  pg_temp.update_driver($$mvr_status = null$$),
  '23514', null, 'a completed CDL driver card cannot drop a check'
);
select lives_ok(
  pg_temp.update_driver($$operator_types = '{mechanic}', cdl_class = 'none', endorsements = '{}', mvr_status = null$$),
  'leaving CDL work makes the CDL checks optional again'
);

select * from finish();
rollback;
