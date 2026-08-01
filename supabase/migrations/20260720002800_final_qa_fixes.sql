-- Final QA corrections for notification validation, resident-request schedule
-- metadata, and the vital-sign upsert contract. Earlier migrations are
-- already deployed and intentionally remain unchanged.

begin;

-- PostgreSQL's ARE engine rejects repetition bounds greater than 255. The
-- previous {1,300} path expression was evaluated by appointment notification
-- triggers and could roll back otherwise-valid cancellation transactions.
alter table public.assistance_notifications
  drop constraint assistance_notification_path_safe;

alter table public.assistance_notifications
  add constraint assistance_notification_path_safe check (
    action_path is null or (
      char_length(action_path) between 2 and 301
      and action_path ~ '^/[a-z0-9_/?=&-]+$'
      and action_path !~ '//'
    )
  );

-- Resident preference fields are immutable request metadata. Current
-- scheduling fields remain staff-managed through the existing trusted RPCs.
-- Do not couple those operational fields to the original request metadata.
alter table public.appointments
  drop constraint appointments_resident_request_consistent;

alter table public.appointments
  add constraint appointments_resident_request_consistent check (
    (
      request_source = 'staff'
      and requested_date is null
      and requested_start_time is null
      and requested_end_time is null
      and resident_requested_at is null
    )
    or (
      request_source = 'resident'
      and requested_date is not null
      and requested_start_time is not null
      and requested_end_time is not null
      and requested_end_time > requested_start_time
      and resident_requested_at is not null
    )
  );

create or replace function public.protect_appointment_request_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_source is distinct from old.request_source then
    raise exception 'appointment request source is immutable'
      using errcode = '23514';
  end if;

  if old.request_source = 'resident'::public.appointment_request_source
    and (
      new.resident_id is distinct from old.resident_id
      or new.created_by is distinct from old.created_by
      or new.requested_date is distinct from old.requested_date
      or new.requested_start_time is distinct from old.requested_start_time
      or new.requested_end_time is distinct from old.requested_end_time
      or new.resident_requested_at is distinct from old.resident_requested_at
    ) then
    raise exception 'resident appointment preference metadata is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_appointment_request_metadata()
  from public, anon, authenticated;

drop trigger if exists appointments_protect_request_metadata
  on public.appointments;
create trigger appointments_protect_request_metadata
  before update on public.appointments
  for each row execute function public.protect_appointment_request_metadata();

-- Audit snapshots already exclude cancellation text. Also omit the sensitive
-- field name from changed-fields metadata so cancellation details cannot be
-- inferred from broad audit consumers.
create or replace function public.appointment_changed_fields(
  old_row jsonb,
  new_row jsonb
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
  from unnest(array[
    'assigned_staff_id', 'appointment_type', 'service_type', 'scheduled_date',
    'start_time', 'end_time', 'priority', 'status', 'rescheduled_from_id',
    'checked_in_at', 'started_at', 'completed_at', 'cancelled_at', 'archived_at'
  ]) as field
  where old_row -> field is distinct from new_row -> field
$$;

revoke all on function public.appointment_changed_fields(jsonb, jsonb)
  from public, anon, authenticated;

-- The RETURNS TABLE output name encounter_id is also a PL/pgSQL variable.
-- Target the named unique constraint and consistently qualify row sources so
-- PostgreSQL never has to choose between an output variable and table column.
create or replace function public.health_vital_signs_save(
  p_encounter_id uuid,
  p_temperature_c numeric,
  p_systolic_bp smallint,
  p_diastolic_bp smallint,
  p_pulse_bpm smallint,
  p_respiratory_rate smallint,
  p_oxygen_saturation numeric,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_pain_score smallint
)
returns table (id uuid, encounter_id uuid, bmi numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role := public.current_profile_role();
  v_encounter_record public.health_encounters%rowtype;
  v_vital_record public.vital_signs%rowtype;
begin
  select e.* into v_encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;

  if not found then
    raise exception 'health encounter not found' using errcode = 'P0002';
  end if;
  if v_encounter_record.status <>
      'draft'::public.health_encounter_status then
    raise exception 'vital signs cannot change after an encounter is signed'
      using errcode = '23514';
  end if;

  if v_actor_role = 'barangay_health_worker'::public.app_role then
    if v_encounter_record.appointment_id is null or not exists (
      select 1
      from public.appointments as a
      where a.id = v_encounter_record.appointment_id
        and a.status in ('checked_in', 'in_progress')
        and a.archived_at is null
    ) then
      raise exception 'BHW preliminary vitals require a checked-in appointment'
        using errcode = '42501';
    end if;
  elsif v_actor_role in (
    'nurse'::public.app_role,
    'midwife'::public.app_role
  ) then
    if v_encounter_record.attending_staff_id <> v_actor_id
      or (
        v_actor_role = 'midwife'::public.app_role
        and v_encounter_record.encounter_type not in (
          'maternal_care',
          'child_health'
        )
      ) then
      raise exception 'you are not authorized to record these vital signs'
        using errcode = '42501';
    end if;
  else
    raise exception 'vital-sign recording requires authorized health staff'
      using errcode = '42501';
  end if;

  insert into public.vital_signs as saved_vital (
    encounter_id,
    temperature_c,
    systolic_bp,
    diastolic_bp,
    pulse_bpm,
    respiratory_rate,
    oxygen_saturation,
    height_cm,
    weight_kg,
    pain_score,
    recorded_by
  ) values (
    p_encounter_id,
    p_temperature_c,
    p_systolic_bp,
    p_diastolic_bp,
    p_pulse_bpm,
    p_respiratory_rate,
    p_oxygen_saturation,
    p_height_cm,
    p_weight_kg,
    p_pain_score,
    v_actor_id
  )
  on conflict on constraint vital_signs_encounter_unique do update
  set temperature_c = excluded.temperature_c,
      systolic_bp = excluded.systolic_bp,
      diastolic_bp = excluded.diastolic_bp,
      pulse_bpm = excluded.pulse_bpm,
      respiratory_rate = excluded.respiratory_rate,
      oxygen_saturation = excluded.oxygen_saturation,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      pain_score = excluded.pain_score,
      recorded_by = v_actor_id,
      recorded_at = pg_catalog.now()
  returning saved_vital.* into v_vital_record;

  return query
  select
    v_vital_record.id,
    v_vital_record.encounter_id,
    case
      when v_vital_record.height_cm is not null
        and v_vital_record.weight_kg is not null
        then round(
          v_vital_record.weight_kg /
            power(v_vital_record.height_cm / 100, 2),
          1
        )
      else null
    end;
end;
$$;

-- CREATE OR REPLACE retains the existing owner and EXECUTE grants. Browser
-- table writes remain revoked by the previously applied workflow migrations.

commit;
