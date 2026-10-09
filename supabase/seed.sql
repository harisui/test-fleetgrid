-- Local seed data only. Fake phone numbers in the +1555555xxxx range. Never real data.
--
--   Admin:   +15555550102 (log in locally with code 123456)
--   Drivers: +15555551001 to +15555551025 (seeded for search and admin screens, no login)
--
-- +15555550100 (driver) and +15555550101 (carrier) are left unseeded so the
-- sign-up flow can be exercised by hand and by e2e tests.

create function pg_temp.seed_user(p_id uuid, p_phone text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at,
    encrypted_password, email_change, email_change_token_new, email_change_token_current,
    confirmation_token, recovery_token, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    ltrim(p_phone, '+'), now(),
    '', '', '', '', '', '', '', '', '',
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text, 'phone',
    jsonb_build_object('sub', p_id::text, 'phone', ltrim(p_phone, '+'), 'phone_verified', true),
    now(), now(), now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select pg_temp.seed_user('00000000-0000-4000-a000-000000000102', '+15555550102');

insert into public.profiles (id, role, phone, status)
values ('00000000-0000-4000-a000-000000000102', 'admin', '+15555550102', 'approved');

-- ---------------------------------------------------------------------------
-- 25 drivers across states, operator types, CDL classes, endorsements and statuses
-- ---------------------------------------------------------------------------
do $$
declare
  v_names text[] := array[
    'Marcus Hill', 'Dana Whitfield', 'Luis Ortega', 'Priya Nair', 'Tom Becker',
    'Aisha Coleman', 'Victor Tran', 'Hannah Schultz', 'Omar Haddad', 'Grace Kim',
    'Derek Lawson', 'Nina Petrov', 'Carlos Mendez', 'Shawn Brooks', 'Emily Carter',
    'Raj Patel', 'Tyrone Banks', 'Olivia Reyes', 'Kevin O''Brien', 'Fatima Zahra',
    'Brandon Lee', 'Sofia Rossi', 'Andre Williams', 'Megan Fox-Daly', 'Walter Nguyen'
  ];
  -- City, state, ZIP, and the ZIP centre from src/data/us-zips.tsv. Six Houston-area places
  -- (inside the launch areas) and four outside, so both paths show up in local data.
  v_places text[][] := array[
    array['Houston', 'TX', '77002', '29.7594', '-95.3594'],
    array['Pasadena', 'TX', '77506', '29.7009', '-95.1989'],
    array['Baytown', 'TX', '77520', '29.7461', '-94.9653'],
    array['La Porte', 'TX', '77571', '29.6884', '-95.0513'],
    array['Houston', 'TX', '77002', '29.7594', '-95.3594'],
    array['Pasadena', 'TX', '77506', '29.7009', '-95.1989'],
    array['Dallas', 'TX', '75201', '32.7904', '-96.8044'],
    array['Austin', 'TX', '78701', '30.2713', '-97.7426'],
    array['Chicago', 'IL', '60601', '41.8858', '-87.6181'],
    array['Atlanta', 'GA', '30303', '33.7525', '-84.3888']
  ];
  v_id uuid;
  v_phone text;
  v_place text[];
  v_operator_types public.operator_type[];
  v_cdl public.cdl_class;
  v_endorsements public.endorsement[];
  v_availability public.availability_type[];
  v_status public.account_status;
  v_opted_out boolean;
  v_cdl_driver boolean;
begin
  for i in 1..25 loop
    v_id := ('00000000-0000-4000-a000-' || lpad((1000 + i)::text, 12, '0'))::uuid;
    v_phone := '+1555555' || (1000 + i)::text;
    v_place := v_places[1 + (i % 10) : 1 + (i % 10)][1:5];

    v_operator_types := case i % 5
      when 0 then array['mechanic']::public.operator_type[]
      when 1 then array['cdl_driver']::public.operator_type[]
      when 2 then array['yard_spotter']::public.operator_type[]
      when 3 then array['cdl_driver', 'yard_spotter']::public.operator_type[]
      else array['cdl_driver', 'mechanic']::public.operator_type[]
    end;

    v_cdl := case
      when i % 5 = 0 then 'none'
      when i % 5 = 2 then (array['B', 'C', 'none'])[1 + (i % 3)]
      else (array['A', 'A', 'B'])[1 + (i % 3)]
    end::public.cdl_class;

    v_endorsements := case
      when v_cdl = 'none' then '{}'
      when i % 4 = 0 then array['H', 'N']
      when i % 4 = 1 then array['T']
      when i % 4 = 2 then array['X', 'P']
      else '{}'
    end::public.endorsement[];

    v_availability := case i % 4
      when 0 then array['full_time']
      when 1 then array['part_time', 'weekends']
      when 2 then array['on_call']
      else array['full_time', 'on_call']
    end::public.availability_type[];

    -- 1 to 17 approved, 18 to 22 pending, 23 to 25 blocked. Driver 7 has opted out of SMS.
    v_status := case when i <= 17 then 'approved' when i <= 22 then 'pending' else 'blocked' end;
    v_opted_out := (i = 7);
    -- Driving style, transmission, equipment, Clearinghouse and MVR are CDL-driver answers.
    v_cdl_driver := ('cdl_driver' = any(v_operator_types));

    perform pg_temp.seed_user(v_id, v_phone);

    insert into public.profiles (id, role, phone, status)
    values (v_id, 'driver', v_phone, v_status);

    insert into public.drivers (
      profile_id, full_name, operator_types, cdl_class, endorsements, years_experience,
      city, state, zip, lat, lng, service_radius_miles, availability, certifications, bio,
      employment_type, driving_styles, transmission, equipment_types,
      twic_active, medical_card_active, clearinghouse_registered, mvr_status,
      sms_opt_in, sms_opt_in_at, sms_opt_in_text, sms_opted_out, sms_opted_out_at,
      onboarding_step, card_completed
    ) values (
      v_id, v_names[i], v_operator_types, v_cdl, v_endorsements, (i * 3) % 31,
      v_place[1][1], v_place[1][2], v_place[1][3], v_place[1][4]::numeric, v_place[1][5]::numeric,
      25 + (i % 6) * 25, v_availability,
      case when i % 3 = 0 then array['Forklift'] when i % 3 = 1 then array['OSHA 10'] else '{}'::text[] end,
      'Seed driver ' || i || '. Reliable, on time, clean record.',
      (array['w2', 'owner_operator_1099', 'either'])[1 + (i % 3)]::public.employment_type,
      case when not v_cdl_driver then '{}'
           when i % 4 = 0 then array['local_day_cab']
           when i % 4 = 1 then array['regional', 'otr']
           when i % 4 = 2 then array['local_day_cab', 'yard_spotter']
           else array['otr'] end::public.driving_style[],
      case when not v_cdl_driver then null
           when i % 3 = 0 then 'automatic_only' else 'manual_ok' end::public.transmission_type,
      case when not v_cdl_driver then '{}'
           when i % 4 = 0 then array['container_drayage', 'dry_van']
           when i % 4 = 1 then array['dry_van', 'reefer']
           when i % 4 = 2 then array['flatbed']
           else array['yard_mule', 'dry_van'] end::public.equipment_type[],
      (i % 2 = 0), (i % 7 <> 0),
      case when v_cdl_driver then (i % 4 <> 3) end,
      case when not v_cdl_driver then null
           when i % 5 = 4 then 'major_3_plus'
           when i % 5 = 2 then 'minor_1_2'
           else 'clean' end::public.mvr_status,
      true, now() - make_interval(days => i),
      'I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.',
      v_opted_out, case when v_opted_out then now() - interval '1 day' end,
      18, true
    );
  end loop;
end;
$$;
