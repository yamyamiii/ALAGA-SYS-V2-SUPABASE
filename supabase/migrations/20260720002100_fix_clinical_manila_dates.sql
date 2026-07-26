-- Clinical date-only values follow the Brgy. Bagongpook business timezone.
-- Event timestamps remain timestamptz instants and continue to be stored in UTC.

begin;

alter table public.health_encounters
  drop constraint health_encounters_date_valid;

alter table public.health_encounters
  add constraint health_encounters_date_valid check (
    encounter_date <=
      (pg_catalog.now() at time zone 'Asia/Manila')::date
  );

alter table public.resident_medical_history
  drop constraint resident_medical_history_onset_valid;

alter table public.resident_medical_history
  add constraint resident_medical_history_onset_valid check (
    onset_date is null
    or onset_date <=
      (pg_catalog.now() at time zone 'Asia/Manila')::date
  );

create or replace function public.health_encounter_create(
  p_resident_id uuid,
  p_appointment_id uuid,
  p_encounter_type public.health_encounter_type,
  p_encounter_date date,
  p_request_key uuid
)
returns table (
  id uuid,
  encounter_number text,
  status public.health_encounter_status,
  version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  manila_today date :=
    (pg_catalog.now() at time zone 'Asia/Manila')::date;
  appointment_record public.appointments%rowtype;
  existing_record public.health_encounters%rowtype;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'encounter creation requires authorized clinical staff'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an encounter request key is required' using errcode = '23502';
  end if;
  if actor_role = 'midwife'::public.app_role
    and p_encounter_type not in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    ) then
    raise exception 'midwives may create only maternal or child encounters'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_key::text, 0)
  );

  select * into existing_record
  from public.health_encounters as e
  where e.created_by = actor_id
    and e.request_key = p_request_key;
  if found then
    if existing_record.resident_id is distinct from p_resident_id
      or existing_record.appointment_id is distinct from p_appointment_id
      or existing_record.encounter_type is distinct from p_encounter_type
      or existing_record.encounter_date is distinct from
        coalesce(p_encounter_date, manila_today) then
      raise exception 'encounter request key was reused with different data'
        using errcode = '23514';
    end if;
    return query
    select existing_record.id, existing_record.encounter_number,
      existing_record.status, existing_record.version;
    return;
  end if;

  if not exists (
    select 1 from public.residents as r
    where r.id = p_resident_id
      and r.status = 'active'::public.resident_status
      and r.archived_at is null
  ) then
    raise exception 'resident must be active for a health encounter'
      using errcode = '23514';
  end if;

  if p_appointment_id is not null then
    select * into appointment_record
    from public.appointments as a
    where a.id = p_appointment_id
    for update;
    if not found then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;
    if appointment_record.resident_id <> p_resident_id then
      raise exception 'appointment and encounter resident do not match'
        using errcode = '23514';
    end if;
    if appointment_record.status not in ('in_progress', 'completed') then
      raise exception 'appointment must be in progress or completed'
        using errcode = '23514';
    end if;
    if appointment_record.archived_at is not null then
      raise exception 'archived appointment cannot start an encounter'
        using errcode = '23514';
    end if;
    if actor_role = 'nurse'::public.app_role
      and appointment_record.assigned_staff_id <> actor_id then
      raise exception 'nurse must be assigned to the linked appointment'
        using errcode = '42501';
    end if;
    if actor_role = 'midwife'::public.app_role
      and (
        appointment_record.assigned_staff_id <> actor_id
        or appointment_record.service_type not in ('Maternal Care', 'Child Health')
      ) then
      raise exception 'midwife appointment scope does not allow this encounter'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.health_encounters as e
      where e.appointment_id = p_appointment_id
    ) then
      raise exception 'an encounter already exists for this appointment'
        using errcode = '23505';
    end if;
  end if;

  return query
  insert into public.health_encounters (
    resident_id, appointment_id, encounter_type, encounter_date,
    attending_staff_id, status, request_key, created_by, updated_by
  ) values (
    p_resident_id, p_appointment_id, p_encounter_type,
    coalesce(p_encounter_date, manila_today), actor_id,
    'draft'::public.health_encounter_status, p_request_key, actor_id, actor_id
  )
  returning health_encounters.id, health_encounters.encounter_number,
    health_encounters.status, health_encounters.version;
end;
$$;

create or replace function public.health_encounter_amend(
  p_encounter_id uuid,
  p_expected_version bigint,
  p_amendment_reason text,
  p_request_key uuid
)
returns table (
  id uuid,
  encounter_number text,
  status public.health_encounter_status,
  version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  manila_today date :=
    (pg_catalog.now() at time zone 'Asia/Manila')::date;
  current_record public.health_encounters%rowtype;
  amendment_record public.health_encounters%rowtype;
  existing_record public.health_encounters%rowtype;
begin
  if p_request_key is null then
    raise exception 'an amendment request key is required' using errcode = '23502';
  end if;
  if nullif(btrim(p_amendment_reason), '') is null
    or char_length(btrim(p_amendment_reason)) > 1000 then
    raise exception 'a valid amendment reason is required' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_key::text, 0)
  );

  select * into existing_record
  from public.health_encounters as e
  where e.created_by = actor_id and e.request_key = p_request_key;
  if found then
    if existing_record.amends_encounter_id is distinct from p_encounter_id then
      raise exception 'amendment request key was reused for another encounter'
        using errcode = '23514';
    end if;
    return query
    select existing_record.id, existing_record.encounter_number,
      existing_record.status, existing_record.version;
    return;
  end if;

  select * into current_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then
    raise exception 'health encounter not found' using errcode = 'P0002';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'health encounter was changed by another user' using errcode = '40001';
  end if;
  if current_record.status <> 'signed'::public.health_encounter_status then
    raise exception 'only a signed encounter may be amended' using errcode = '23514';
  end if;
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or (
      actor_role = 'midwife'::public.app_role
      and current_record.encounter_type not in ('maternal_care', 'child_health')
    ) then
    raise exception 'you are not authorized to amend this encounter'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.health_encounters as e
    where e.amends_encounter_id = current_record.id
  ) then
    raise exception 'an amendment already exists for this encounter'
      using errcode = '23505';
  end if;

  insert into public.health_encounters (
    resident_id, encounter_type, encounter_date, attending_staff_id,
    chief_complaint, subjective_notes, objective_notes, assessment, plan,
    diagnosis_text, treatment_notes, follow_up_date, status,
    amends_encounter_id, amendment_reason, request_key, created_by, updated_by
  ) values (
    current_record.resident_id, current_record.encounter_type, manila_today,
    actor_id, current_record.chief_complaint, current_record.subjective_notes,
    current_record.objective_notes, current_record.assessment,
    current_record.plan, current_record.diagnosis_text,
    current_record.treatment_notes, current_record.follow_up_date,
    'draft'::public.health_encounter_status, current_record.id,
    btrim(p_amendment_reason), p_request_key, actor_id, actor_id
  )
  returning * into amendment_record;

  insert into public.vital_signs (
    encounter_id, temperature_c, systolic_bp, diastolic_bp, pulse_bpm,
    respiratory_rate, oxygen_saturation, height_cm, weight_kg, pain_score,
    recorded_by, recorded_at
  )
  select
    amendment_record.id, v.temperature_c, v.systolic_bp, v.diastolic_bp,
    v.pulse_bpm, v.respiratory_rate, v.oxygen_saturation, v.height_cm,
    v.weight_kg, v.pain_score, actor_id, pg_catalog.now()
  from public.vital_signs as v
  where v.encounter_id = current_record.id;

  return query
  select amendment_record.id, amendment_record.encounter_number,
    amendment_record.status, amendment_record.version;
end;
$$;

create or replace function public.health_medical_history_save(
  p_id uuid,
  p_resident_id uuid,
  p_condition_name text,
  p_details text,
  p_onset_date date,
  p_status public.clinical_item_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  manila_today date :=
    (pg_catalog.now() at time zone 'Asia/Manila')::date;
  saved_id uuid;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'medical-history documentation requires clinical staff'
      using errcode = '42501';
  end if;
  if actor_role = 'midwife'::public.app_role and not exists (
    select 1 from public.health_encounters as e
    where e.resident_id = p_resident_id
      and e.encounter_type in ('maternal_care', 'child_health')
      and e.status <> 'archived'
  ) then
    raise exception 'resident is outside midwife clinical scope'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_condition_name), '') is null
    or char_length(btrim(p_condition_name)) > 200
    or char_length(coalesce(p_details, '')) > 2000
    or p_onset_date > manila_today then
    raise exception 'invalid medical-history documentation' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.resident_medical_history (
      resident_id, condition_name, details, onset_date, status, noted_by
    ) values (
      p_resident_id, btrim(p_condition_name), nullif(btrim(p_details), ''),
      p_onset_date, coalesce(p_status, 'active'), actor_id
    ) returning id into saved_id;
  else
    update public.resident_medical_history as h
    set condition_name = btrim(p_condition_name),
        details = nullif(btrim(p_details), ''),
        onset_date = p_onset_date,
        status = coalesce(p_status, h.status),
        updated_at = pg_catalog.now()
    where h.id = p_id and h.resident_id = p_resident_id and h.archived_at is null
    returning h.id into saved_id;
    if saved_id is null then
      raise exception 'medical-history record not found' using errcode = 'P0002';
    end if;
  end if;
  return saved_id;
end;
$$;

commit;
