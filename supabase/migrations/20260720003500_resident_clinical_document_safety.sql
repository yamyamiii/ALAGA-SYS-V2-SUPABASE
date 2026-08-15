-- Resident UAT hardening: keep trusted health-record detail responses aligned
-- with the approved finalized resident-facing document boundary. Earlier
-- migrations remain immutable.

begin;

create or replace function public.health_record_get(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  actor_resident_id uuid := public.current_resident_id();
  encounter_record public.health_encounters%rowtype;
  resident_can_view boolean := false;
  can_view_narrative boolean := false;
  can_view_vitals boolean := false;
  result jsonb;
begin
  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id;
  if not found then
    raise exception 'health encounter not found' using errcode = 'P0002';
  end if;

  resident_can_view :=
    actor_role = 'resident'::public.app_role
    and encounter_record.resident_id = actor_resident_id
    and encounter_record.status in (
      'signed'::public.health_encounter_status,
      'amended'::public.health_encounter_status
    );

  can_view_narrative :=
    actor_role = 'nurse'::public.app_role
    or (
      actor_role = 'midwife'::public.app_role
      and encounter_record.encounter_type in (
        'maternal_care'::public.health_encounter_type,
        'child_health'::public.health_encounter_type
      )
    );

  can_view_vitals := can_view_narrative
    or (
      actor_role = 'barangay_health_worker'::public.app_role
      and encounter_record.status = 'draft'::public.health_encounter_status
      and encounter_record.appointment_id is not null
      and exists (
        select 1
        from public.appointments as appointment
        where appointment.id = encounter_record.appointment_id
          and appointment.status in ('checked_in', 'in_progress')
          and appointment.archived_at is null
      )
    );

  if actor_role is null
    or (
      actor_role = 'midwife'::public.app_role
      and encounter_record.encounter_type not in (
        'maternal_care'::public.health_encounter_type,
        'child_health'::public.health_encounter_type
      )
    )
    or (
      actor_role = 'resident'::public.app_role
      and not resident_can_view
    )
    or (
      encounter_record.status = 'archived'::public.health_encounter_status
      and actor_role <> 'admin'::public.app_role
    ) then
    raise exception 'you are not authorized to view this health encounter'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', e.id,
    'encounter_number', e.encounter_number,
    'resident_id', e.resident_id,
    'appointment_id', e.appointment_id,
    'encounter_type', e.encounter_type,
    'encounter_date', e.encounter_date,
    'attending_staff_id', e.attending_staff_id,
    'status', e.status,
    'amends_encounter_id', e.amends_encounter_id,
    'amendment_reason', case
      when can_view_narrative then e.amendment_reason else null
    end,
    'signed_by', e.signed_by,
    'signed_at', e.signed_at,
    'version', e.version,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'archived_at', e.archived_at,
    'resident', jsonb_build_object(
      'id', r.id,
      'resident_number', r.resident_number,
      'first_name', r.first_name,
      'middle_name', r.middle_name,
      'last_name', r.last_name,
      'suffix', r.suffix,
      'date_of_birth', r.date_of_birth,
      'sex', r.sex,
      'blood_type', r.blood_type,
      'status', r.status
    ),
    'appointment', case when a.id is null then null else jsonb_build_object(
      'id', a.id,
      'appointment_number', a.appointment_number,
      'appointment_type', a.appointment_type,
      'service_type', a.service_type,
      'scheduled_date', a.scheduled_date,
      'start_time', a.start_time,
      'end_time', a.end_time,
      'status', a.status
    ) end,
    'attending_staff', jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'middle_name', p.middle_name,
      'last_name', p.last_name,
      'suffix', p.suffix,
      'role', p.role
    ),
    'clinical', case when can_view_narrative then jsonb_build_object(
      'chief_complaint', e.chief_complaint,
      'subjective_notes', e.subjective_notes,
      'objective_notes', e.objective_notes,
      'assessment', e.assessment,
      'plan', e.plan,
      'diagnosis_text', e.diagnosis_text,
      'treatment_notes', e.treatment_notes,
      'follow_up_date', e.follow_up_date
    ) else null end,
    'vital_signs', case when can_view_vitals then (
      select jsonb_build_object(
        'id', v.id,
        'temperature_c', v.temperature_c,
        'systolic_bp', v.systolic_bp,
        'diastolic_bp', v.diastolic_bp,
        'pulse_bpm', v.pulse_bpm,
        'respiratory_rate', v.respiratory_rate,
        'oxygen_saturation', v.oxygen_saturation,
        'height_cm', v.height_cm,
        'weight_kg', v.weight_kg,
        'bmi', case
          when v.height_cm is not null and v.weight_kg is not null
            and v.height_cm > 0
            then round(v.weight_kg / power(v.height_cm / 100, 2), 1)
          else null
        end,
        'pain_score', v.pain_score,
        'recorded_by', v.recorded_by,
        'recorded_at', v.recorded_at,
        'updated_at', v.updated_at
      )
      from public.vital_signs as v
      where v.encounter_id = e.id
    ) else null end
  )
  into result
  from public.health_encounters as e
  join public.residents as r on r.id = e.resident_id
  join public.profiles as p on p.id = e.attending_staff_id
  left join public.appointments as a on a.id = e.appointment_id
  where e.id = encounter_record.id;

  return result;
end;
$$;

-- CREATE OR REPLACE preserves the existing function owner and EXECUTE grants.
-- Keep the browser contract explicit and unchanged.
revoke all on function public.health_record_get(uuid) from public, anon;
grant execute on function public.health_record_get(uuid)
  to authenticated, service_role;

commit;
