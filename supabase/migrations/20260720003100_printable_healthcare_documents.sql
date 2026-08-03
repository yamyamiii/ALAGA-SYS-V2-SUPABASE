-- Phase 10: minimized printable-document payloads and controlled referrals.
-- Document RPCs repeat the existing authorization rules at the database
-- boundary. They never accept a resident identifier and never return raw IDs,
-- operational notes, audit metadata, or unrelated clinical history.

begin;

create type public.referral_status as enum ('draft', 'finalized', 'archived');

create sequence public.referral_number_seq as bigint start with 1 increment by 1;

create table public.clinical_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_number text not null unique,
  encounter_id uuid not null references public.health_encounters(id) on delete restrict,
  referral_date date not null,
  referring_staff_id uuid not null references public.profiles(id) on delete restrict,
  receiving_facility text not null,
  reason_for_referral text not null,
  clinical_summary text not null,
  status public.referral_status not null default 'draft',
  request_key uuid,
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint clinical_referrals_number_format check (
    referral_number ~ '^REF-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint clinical_referrals_facility_length check (
    char_length(btrim(receiving_facility)) between 2 and 500
  ),
  constraint clinical_referrals_reason_length check (
    char_length(btrim(reason_for_referral)) between 2 and 2000
  ),
  constraint clinical_referrals_summary_length check (
    char_length(btrim(clinical_summary)) between 2 and 5000
  ),
  constraint clinical_referrals_status_consistent check (
    (
      status = 'draft'::public.referral_status
      and finalized_by is null
      and finalized_at is null
      and archived_at is null
    )
    or (
      status = 'finalized'::public.referral_status
      and finalized_by is not null
      and finalized_at is not null
      and archived_at is null
    )
    or (
      status = 'archived'::public.referral_status
      and finalized_by is not null
      and finalized_at is not null
      and archived_at is not null
    )
  )
);

create unique index clinical_referrals_active_encounter_unique
  on public.clinical_referrals(encounter_id)
  where status <> 'archived'::public.referral_status;

create unique index clinical_referrals_request_unique
  on public.clinical_referrals(created_by, request_key)
  where request_key is not null;

create index clinical_referrals_resident_lookup_idx
  on public.clinical_referrals(encounter_id, status, created_at desc);

create or replace function public.set_clinical_referral_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.referral_number := format(
      'REF-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(nextval('public.referral_number_seq')::text, 6, '0')
    );
  elsif new.referral_number is distinct from old.referral_number then
    raise exception 'referral_number is database-generated and immutable';
  end if;
  return new;
end;
$$;

create or replace function public.protect_clinical_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'archived'::public.referral_status then
    raise exception 'archived referrals are immutable' using errcode = '23514';
  end if;

  if old.status = 'finalized'::public.referral_status then
    if new.status <> 'archived'::public.referral_status
      or (to_jsonb(new) - array[
        'status', 'archived_at', 'updated_by', 'updated_at', 'version'
      ]) is distinct from (to_jsonb(old) - array[
        'status', 'archived_at', 'updated_by', 'updated_at', 'version'
      ]) then
      raise exception 'finalized referrals are immutable' using errcode = '23514';
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create or replace function public.audit_clinical_referral_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  action_name := case
    when tg_op = 'INSERT' then 'referral.created'
    when old.status is distinct from new.status
      and new.status = 'finalized'::public.referral_status then 'referral.finalized'
    when old.status is distinct from new.status
      and new.status = 'archived'::public.referral_status then 'referral.archived'
    else 'referral.updated'
  end;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    summary,
    old_values,
    new_values
  )
  values (
    auth.uid(),
    action_name,
    'clinical_referrals',
    new.id,
    case action_name
      when 'referral.created' then 'Created a clinical referral draft'
      when 'referral.finalized' then 'Finalized a clinical referral'
      when 'referral.archived' then 'Archived a clinical referral'
      else 'Updated a clinical referral draft'
    end,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'referral_number', old.referral_number,
      'status', old.status,
      'version', old.version
    ) end,
    jsonb_build_object(
      'referral_number', new.referral_number,
      'status', new.status,
      'version', new.version
    )
  );
  return new;
end;
$$;

create trigger clinical_referrals_set_number
  before insert or update on public.clinical_referrals
  for each row execute function public.set_clinical_referral_number();

create trigger clinical_referrals_protect
  before update on public.clinical_referrals
  for each row execute function public.protect_clinical_referral();

create trigger clinical_referrals_audit
  after insert or update on public.clinical_referrals
  for each row execute function public.audit_clinical_referral_change();

alter table public.clinical_referrals enable row level security;

create or replace function public.document_appointment_slip(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  appointment_record public.appointments%rowtype;
  result jsonb;
begin
  select * into appointment_record
  from public.appointments as a
  where a.id = p_appointment_id;

  if not found
    or appointment_record.archived_at is not null
    or appointment_record.status not in (
      'confirmed'::public.appointment_status,
      'checked_in'::public.appointment_status,
      'in_progress'::public.appointment_status,
      'completed'::public.appointment_status
    ) then
    raise exception 'appointment slip is unavailable' using errcode = 'P0002';
  end if;

  if actor_role = 'resident'::public.app_role then
    if appointment_record.resident_id is distinct from public.current_resident_id() then
      raise exception 'appointment slip is unavailable' using errcode = 'P0002';
    end if;
  elsif actor_role = 'nurse'::public.app_role then
    if appointment_record.assigned_staff_id is distinct from actor_id then
      raise exception 'appointment document access denied' using errcode = '42501';
    end if;
  elsif actor_role = 'midwife'::public.app_role then
    if appointment_record.assigned_staff_id is distinct from actor_id
      or appointment_record.service_type not in ('Maternal Care', 'Child Health') then
      raise exception 'appointment document access denied' using errcode = '42501';
    end if;
  elsif actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role
  ) then
    raise exception 'appointment document access denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'document_type', 'appointment_slip',
    'appointment_number', a.appointment_number,
    'resident_name', concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    'service_type', a.service_type::text,
    'appointment_type', a.appointment_type::text,
    'scheduled_date', a.scheduled_date,
    'start_time', a.start_time,
    'assigned_staff_name', case when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix)
    end,
    'status', a.status::text
  ) into result
  from public.appointments as a
  join public.residents as r on r.id = a.resident_id
  left join public.profiles as staff on staff.id = a.assigned_staff_id
  where a.id = appointment_record.id;

  return result;
end;
$$;

create or replace function public.document_consultation_summary(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  encounter_record public.health_encounters%rowtype;
  result jsonb;
begin
  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id;

  if not found
    or encounter_record.archived_at is not null
    or encounter_record.status not in (
      'signed'::public.health_encounter_status,
      'amended'::public.health_encounter_status
    ) then
    raise exception 'consultation summary is unavailable' using errcode = 'P0002';
  end if;

  if actor_role = 'resident'::public.app_role then
    if encounter_record.resident_id is distinct from public.current_resident_id() then
      raise exception 'consultation summary is unavailable' using errcode = 'P0002';
    end if;
  elsif actor_role = 'midwife'::public.app_role then
    if encounter_record.encounter_type not in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    ) then
      raise exception 'consultation document access denied' using errcode = '42501';
    end if;
  elsif actor_role <> 'nurse'::public.app_role then
    raise exception 'consultation document access denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'document_type', 'consultation_summary',
    'encounter_number', e.encounter_number,
    'resident_name', concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    'encounter_date', e.encounter_date,
    'encounter_type', e.encounter_type::text,
    'attending_staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
    'chief_complaint', e.chief_complaint,
    'assessment', e.assessment,
    'plan', e.plan,
    'follow_up_date', e.follow_up_date,
    'status', e.status::text,
    'is_amended', (e.status = 'amended'::public.health_encounter_status or e.amends_encounter_id is not null),
    'amends_encounter_number', original.encounter_number,
    'vital_signs', case when vitals.id is null then null else jsonb_build_object(
      'recorded_at', vitals.recorded_at,
      'temperature_c', vitals.temperature_c,
      'systolic_bp', vitals.systolic_bp,
      'diastolic_bp', vitals.diastolic_bp,
      'pulse_bpm', vitals.pulse_bpm,
      'respiratory_rate', vitals.respiratory_rate,
      'oxygen_saturation', vitals.oxygen_saturation,
      'height_cm', vitals.height_cm,
      'weight_kg', vitals.weight_kg,
      'bmi', case
        when vitals.height_cm is not null and vitals.weight_kg is not null
          and vitals.height_cm > 0
          then round(vitals.weight_kg / power(vitals.height_cm / 100, 2), 1)
        else null
      end,
      'pain_score', vitals.pain_score
    ) end
  ) into result
  from public.health_encounters as e
  join public.residents as r on r.id = e.resident_id
  join public.profiles as staff on staff.id = e.attending_staff_id
  left join public.health_encounters as original on original.id = e.amends_encounter_id
  left join public.vital_signs as vitals on vitals.encounter_id = e.id
  where e.id = encounter_record.id;

  return result;
end;
$$;

create or replace function public.document_prenatal_summary(p_pregnancy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  pregnancy_record public.maternal_pregnancies%rowtype;
  clinical_visible boolean := false;
  result jsonb;
begin
  select * into pregnancy_record
  from public.maternal_pregnancies as p
  where p.id = p_pregnancy_id;
  if not found then
    raise exception 'prenatal summary is unavailable' using errcode = 'P0002';
  end if;

  if actor_role = 'resident'::public.app_role then
    if pregnancy_record.resident_id is distinct from public.current_resident_id() then
      raise exception 'prenatal summary is unavailable' using errcode = 'P0002';
    end if;
  elsif actor_role = 'nurse'::public.app_role then
    if not public.maternal_child_can_access(pregnancy_record.resident_id) then
      raise exception 'prenatal document access denied' using errcode = '42501';
    end if;
  elsif actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role,
    'midwife'::public.app_role
  ) then
    raise exception 'prenatal document access denied' using errcode = '42501';
  end if;
  clinical_visible := actor_role in ('nurse'::public.app_role, 'midwife'::public.app_role);

  select jsonb_build_object(
    'document_type', 'prenatal_summary',
    'pregnancy_number', p.pregnancy_number,
    'resident_name', concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    'last_menstrual_period', p.last_menstrual_period,
    'estimated_delivery_date', p.estimated_delivery_date,
    'gravida', p.gravida,
    'para', p.para,
    'term_births', p.term_births,
    'preterm_births', p.preterm_births,
    'pregnancy_losses', p.abortions,
    'living_children', p.living_children,
    'risk_level', case when clinical_visible then p.pregnancy_risk_level::text end,
    'status', p.status::text,
    'attending_midwife_name', case when midwife.id is null then null
      else concat_ws(' ', midwife.first_name, midwife.middle_name, midwife.last_name, midwife.suffix)
    end,
    'prenatal_visits', case when clinical_visible then coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_date', visits.visit_date,
        'gestational_age_weeks', visits.gestational_age_weeks,
        'attending_staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix)
      ) order by visits.visit_date, visits.id)
      from (
        select v.id, v.visit_date, v.gestational_age_weeks, v.recorded_by
        from public.maternal_prenatal_visits as v
        where v.pregnancy_id = p.id and v.archived_at is null
        order by v.visit_date desc, v.id desc
        limit 50
      ) as visits
      join public.profiles as staff on staff.id = visits.recorded_by
    ), '[]'::jsonb) else '[]'::jsonb end,
    'clinical_fields_visible', clinical_visible
  ) into result
  from public.maternal_pregnancies as p
  join public.residents as r on r.id = p.resident_id
  left join public.profiles as midwife on midwife.id = p.attending_midwife_id
  where p.id = pregnancy_record.id;

  return result;
end;
$$;

create or replace function public.document_child_health_summary(p_child_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  child_record public.child_health_profiles%rowtype;
  clinical_visible boolean := false;
  result jsonb;
begin
  select * into child_record
  from public.child_health_profiles as c
  where c.id = p_child_profile_id;
  if not found then
    raise exception 'child health summary is unavailable' using errcode = 'P0002';
  end if;

  if actor_role = 'resident'::public.app_role then
    if child_record.child_resident_id is distinct from public.current_resident_id() then
      raise exception 'child health summary is unavailable' using errcode = 'P0002';
    end if;
  elsif actor_role = 'nurse'::public.app_role then
    if not public.maternal_child_can_access(child_record.child_resident_id) then
      raise exception 'child health document access denied' using errcode = '42501';
    end if;
  elsif actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role,
    'midwife'::public.app_role
  ) then
    raise exception 'child health document access denied' using errcode = '42501';
  end if;
  clinical_visible := actor_role in ('nurse'::public.app_role, 'midwife'::public.app_role);

  select jsonb_build_object(
    'document_type', 'child_health_summary',
    'child_number', c.child_number,
    'child_name', concat_ws(' ', child.first_name, child.middle_name, child.last_name, child.suffix),
    'birth_date', c.birth_date,
    'mother_name', case when mother.id is null then null
      else concat_ws(' ', mother.first_name, mother.middle_name, mother.last_name, mother.suffix)
    end,
    'guardian_name', case when guardian.id is null then null
      else concat_ws(' ', guardian.first_name, guardian.middle_name, guardian.last_name, guardian.suffix)
    end,
    'growth_measurements', case when clinical_visible then coalesce((
      select jsonb_agg(jsonb_build_object(
        'measured_at', measurements.measured_at,
        'weight_kg', measurements.weight_kg,
        'height_cm', measurements.height_cm,
        'head_circumference_cm', measurements.head_circumference_cm,
        'mid_upper_arm_circumference_cm', measurements.mid_upper_arm_circumference_cm
      ) order by measurements.measured_at desc, measurements.id desc)
      from (
        select g.id, g.measured_at, g.weight_kg, g.height_cm,
          g.head_circumference_cm, g.mid_upper_arm_circumference_cm
        from public.child_growth_measurements as g
        where g.child_profile_id = c.id and g.archived_at is null
        order by g.measured_at desc, g.id desc
        limit 12
      ) as measurements
    ), '[]'::jsonb) else '[]'::jsonb end,
    'immunizations', case when clinical_visible then coalesce((
      select jsonb_agg(jsonb_build_object(
        'vaccine_name', immunizations.vaccine_name,
        'dose_number', immunizations.dose_number,
        'administered_date', immunizations.administered_date
      ) order by immunizations.administered_date desc, immunizations.id desc)
      from (
        select i.id, i.vaccine_name, i.dose_number, i.administered_date
        from public.child_immunizations as i
        where i.child_profile_id = c.id
          and i.archived_at is null
          and i.status = 'completed'::public.child_immunization_status
          and i.administered_date is not null
        order by i.administered_date desc, i.id desc
        limit 100
      ) as immunizations
    ), '[]'::jsonb) else '[]'::jsonb end,
    'latest_child_visit', case when clinical_visible then (
      select jsonb_build_object(
        'visit_date', visit.visit_date,
        'attending_staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix)
      )
      from public.child_health_visits as visit
      join public.profiles as staff on staff.id = visit.recorded_by
      where visit.child_profile_id = c.id and visit.archived_at is null
      order by visit.visit_date desc, visit.id desc
      limit 1
    ) end,
    'clinical_fields_visible', clinical_visible
  ) into result
  from public.child_health_profiles as c
  join public.residents as child on child.id = c.child_resident_id
  left join public.residents as mother on mother.id = c.mother_resident_id
  left join public.residents as guardian on guardian.id = c.guardian_resident_id
  where c.id = child_record.id;

  return result;
end;
$$;

create or replace function public.referral_save(
  p_id uuid,
  p_expected_version bigint,
  p_encounter_id uuid,
  p_receiving_facility text,
  p_reason_for_referral text,
  p_clinical_summary text,
  p_request_key uuid
)
returns table (id uuid, referral_number text, status public.referral_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  encounter_record public.health_encounters%rowtype;
  referral_record public.clinical_referrals%rowtype;
  manila_today date := (statement_timestamp() at time zone 'Asia/Manila')::date;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'referral documentation requires authorized clinical staff'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_receiving_facility), '') is null
    or nullif(btrim(p_reason_for_referral), '') is null
    or nullif(btrim(p_clinical_summary), '') is null then
    raise exception 'referral fields are required' using errcode = '23514';
  end if;

  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id;
  if not found or encounter_record.archived_at is not null
    or encounter_record.status not in (
      'signed'::public.health_encounter_status,
      'amended'::public.health_encounter_status
    ) then
    raise exception 'signed health encounter not found' using errcode = 'P0002';
  end if;
  if encounter_record.attending_staff_id is distinct from actor_id
    or (
      actor_role = 'midwife'::public.app_role
      and encounter_record.encounter_type not in (
        'maternal_care'::public.health_encounter_type,
        'child_health'::public.health_encounter_type
      )
    ) then
    raise exception 'referral is outside your clinical scope' using errcode = '42501';
  end if;

  if p_id is null then
    if p_request_key is null then
      raise exception 'referral request key is required' using errcode = '23502';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(actor_id::text || ':' || p_request_key::text, 0)
    );
    select * into referral_record
    from public.clinical_referrals as referral
    where referral.created_by = actor_id and referral.request_key = p_request_key
    limit 1;
    if found then
      if referral_record.encounter_id is distinct from p_encounter_id
        or referral_record.receiving_facility is distinct from btrim(p_receiving_facility)
        or referral_record.reason_for_referral is distinct from btrim(p_reason_for_referral)
        or referral_record.clinical_summary is distinct from btrim(p_clinical_summary) then
        raise exception 'referral request key was reused with different data'
          using errcode = '23505';
      end if;
      return query select referral_record.id, referral_record.referral_number,
        referral_record.status, referral_record.version;
      return;
    end if;

    return query
    insert into public.clinical_referrals (
      referral_number,
      encounter_id,
      referral_date,
      referring_staff_id,
      receiving_facility,
      reason_for_referral,
      clinical_summary,
      request_key,
      created_by,
      updated_by
    ) values (
      'PENDING',
      encounter_record.id,
      manila_today,
      actor_id,
      btrim(p_receiving_facility),
      btrim(p_reason_for_referral),
      btrim(p_clinical_summary),
      p_request_key,
      actor_id,
      actor_id
    )
    returning clinical_referrals.id, clinical_referrals.referral_number,
      clinical_referrals.status, clinical_referrals.version;
    return;
  end if;

  select * into referral_record
  from public.clinical_referrals as referral
  where referral.id = p_id
  for update;
  if not found then
    raise exception 'referral not found' using errcode = 'P0002';
  end if;
  if referral_record.version is distinct from p_expected_version then
    raise exception 'referral was changed by another user' using errcode = '40001';
  end if;
  if referral_record.status <> 'draft'::public.referral_status
    or referral_record.referring_staff_id is distinct from actor_id
    or referral_record.encounter_id is distinct from encounter_record.id then
    raise exception 'only your referral draft can be changed' using errcode = '42501';
  end if;

  return query
  update public.clinical_referrals as referral
  set receiving_facility = btrim(p_receiving_facility),
      reason_for_referral = btrim(p_reason_for_referral),
      clinical_summary = btrim(p_clinical_summary),
      updated_by = actor_id
  where referral.id = referral_record.id
  returning referral.id, referral.referral_number, referral.status, referral.version;
end;
$$;

create or replace function public.referral_finalize(
  p_referral_id uuid,
  p_expected_version bigint
)
returns table (id uuid, referral_number text, status public.referral_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  referral_record public.clinical_referrals%rowtype;
begin
  select * into referral_record
  from public.clinical_referrals as referral
  where referral.id = p_referral_id
  for update;
  if not found then raise exception 'referral not found' using errcode = 'P0002'; end if;
  if referral_record.version is distinct from p_expected_version then
    raise exception 'referral was changed by another user' using errcode = '40001';
  end if;
  if public.current_profile_role() not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or referral_record.referring_staff_id is distinct from actor_id
    or referral_record.status <> 'draft'::public.referral_status then
    raise exception 'only the referring clinician can finalize this referral'
      using errcode = '42501';
  end if;

  return query
  update public.clinical_referrals as referral
  set status = 'finalized'::public.referral_status,
      finalized_by = actor_id,
      finalized_at = statement_timestamp(),
      updated_by = actor_id
  where referral.id = referral_record.id
  returning referral.id, referral.referral_number, referral.status, referral.version;
end;
$$;

create or replace function public.referral_archive(
  p_referral_id uuid,
  p_expected_version bigint
)
returns table (id uuid, referral_number text, status public.referral_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  referral_record public.clinical_referrals%rowtype;
begin
  select * into referral_record
  from public.clinical_referrals as referral
  where referral.id = p_referral_id
  for update;
  if not found then raise exception 'referral not found' using errcode = 'P0002'; end if;
  if referral_record.version is distinct from p_expected_version then
    raise exception 'referral was changed by another user' using errcode = '40001';
  end if;
  if public.current_profile_role() not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or referral_record.referring_staff_id is distinct from actor_id
    or referral_record.status <> 'finalized'::public.referral_status then
    raise exception 'only the referring clinician can archive a finalized referral'
      using errcode = '42501';
  end if;

  return query
  update public.clinical_referrals as referral
  set status = 'archived'::public.referral_status,
      archived_at = statement_timestamp(),
      updated_by = actor_id
  where referral.id = referral_record.id
  returning referral.id, referral.referral_number, referral.status, referral.version;
end;
$$;

create or replace function public.referral_for_encounter(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  encounter_record public.health_encounters%rowtype;
  result jsonb;
begin
  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id;
  if not found or encounter_record.archived_at is not null
    or encounter_record.status not in (
      'signed'::public.health_encounter_status,
      'amended'::public.health_encounter_status
    ) then
    raise exception 'referral encounter not found' using errcode = 'P0002';
  end if;

  if actor_role = 'resident'::public.app_role then
    if encounter_record.resident_id is distinct from public.current_resident_id() then
      raise exception 'referral encounter not found' using errcode = 'P0002';
    end if;
  elsif actor_role = 'midwife'::public.app_role then
    if encounter_record.encounter_type not in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    ) then
      raise exception 'referral access denied' using errcode = '42501';
    end if;
  elsif actor_role <> 'nurse'::public.app_role then
    raise exception 'referral access denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', referral.id,
    'referral_number', referral.referral_number,
    'encounter_number', encounter.encounter_number,
    'referral_date', referral.referral_date,
    'referring_staff_id', referral.referring_staff_id,
    'referring_staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
    'receiving_facility', referral.receiving_facility,
    'reason_for_referral', referral.reason_for_referral,
    'clinical_summary', referral.clinical_summary,
    'status', referral.status::text,
    'version', referral.version,
    'finalized_at', referral.finalized_at
  ) into result
  from public.clinical_referrals as referral
  join public.health_encounters as encounter on encounter.id = referral.encounter_id
  join public.profiles as staff on staff.id = referral.referring_staff_id
  where referral.encounter_id = encounter_record.id
    and referral.status <> 'archived'::public.referral_status
    and (
      actor_role <> 'resident'::public.app_role
      or referral.status = 'finalized'::public.referral_status
    )
  order by referral.created_at desc
  limit 1;

  return result;
end;
$$;

create or replace function public.document_referral_form(p_referral_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  referral_record public.clinical_referrals%rowtype;
  encounter_record public.health_encounters%rowtype;
  result jsonb;
begin
  select * into referral_record
  from public.clinical_referrals as referral
  where referral.id = p_referral_id
    and referral.status = 'finalized'::public.referral_status;
  if not found then raise exception 'referral form is unavailable' using errcode = 'P0002'; end if;

  select * into encounter_record
  from public.health_encounters as e
  where e.id = referral_record.encounter_id;

  if actor_role = 'resident'::public.app_role then
    if encounter_record.resident_id is distinct from public.current_resident_id() then
      raise exception 'referral form is unavailable' using errcode = 'P0002';
    end if;
  elsif actor_role = 'midwife'::public.app_role then
    if encounter_record.encounter_type not in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    ) then
      raise exception 'referral document access denied' using errcode = '42501';
    end if;
  elsif actor_role <> 'nurse'::public.app_role then
    raise exception 'referral document access denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'document_type', 'referral_form',
    'referral_number', referral.referral_number,
    'resident_name', concat_ws(' ', resident.first_name, resident.middle_name, resident.last_name, resident.suffix),
    'referral_date', referral.referral_date,
    'referring_staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
    'referring_staff_role', staff.role::text,
    'receiving_facility', referral.receiving_facility,
    'reason_for_referral', referral.reason_for_referral,
    'clinical_summary', referral.clinical_summary,
    'finalized_at', referral.finalized_at
  ) into result
  from public.clinical_referrals as referral
  join public.health_encounters as encounter on encounter.id = referral.encounter_id
  join public.residents as resident on resident.id = encounter.resident_id
  join public.profiles as staff on staff.id = referral.referring_staff_id
  where referral.id = referral_record.id;

  return result;
end;
$$;

revoke all on table public.clinical_referrals from public, anon, authenticated;
revoke all on sequence public.referral_number_seq from public, anon, authenticated;
grant all on table public.clinical_referrals to service_role;
grant usage, select on sequence public.referral_number_seq to service_role;

revoke all on function public.set_clinical_referral_number(),
  public.protect_clinical_referral(),
  public.audit_clinical_referral_change() from public, anon, authenticated;

revoke all on function public.document_appointment_slip(uuid),
  public.document_consultation_summary(uuid),
  public.document_prenatal_summary(uuid),
  public.document_child_health_summary(uuid),
  public.document_referral_form(uuid),
  public.referral_for_encounter(uuid),
  public.referral_save(uuid,bigint,uuid,text,text,text,uuid),
  public.referral_finalize(uuid,bigint),
  public.referral_archive(uuid,bigint) from public, anon, authenticated;

grant execute on function public.document_appointment_slip(uuid),
  public.document_consultation_summary(uuid),
  public.document_prenatal_summary(uuid),
  public.document_child_health_summary(uuid),
  public.document_referral_form(uuid),
  public.referral_for_encounter(uuid),
  public.referral_save(uuid,bigint,uuid,text,text,text,uuid),
  public.referral_finalize(uuid,bigint),
  public.referral_archive(uuid,bigint) to authenticated, service_role;

commit;
