-- Resident appointment requests may omit a visit reason. Staff-created
-- scheduled appointments retain their existing reason requirement.

begin;

create or replace function public.appointment_validate_schedule(
  p_resident_id uuid,
  p_appointment_type public.appointment_type,
  p_service_type text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_staff_id uuid,
  p_reason text,
  p_exclude_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  manila_now timestamp := pg_catalog.now() at time zone 'Asia/Manila';
  staff_role public.app_role;
  resident_request boolean :=
    public.current_profile_role() = 'resident'::public.app_role
    and p_staff_id is null
    and p_exclude_id is null;
begin
  if not exists (
    select 1
    from public.residents as r
    where r.id = p_resident_id
      and r.status = 'active'::public.resident_status
      and r.archived_at is null
  ) then
    raise exception 'resident must be active and available for scheduling'
      using errcode = '23514';
  end if;

  if not public.appointment_service_type_valid(p_service_type) then
    raise exception 'invalid appointment service type' using errcode = '23514';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'appointment end time must be after start time'
      using errcode = '23514';
  end if;

  if p_scheduled_date < manila_now::date then
    raise exception 'appointments cannot be created in the past'
      using errcode = '22007';
  end if;

  if p_appointment_type = 'walk_in'::public.appointment_type
    and p_scheduled_date <> manila_now::date then
    raise exception 'walk-in appointments must use the current Manila date'
      using errcode = '22007';
  end if;

  if p_appointment_type <> 'walk_in'::public.appointment_type
    and p_scheduled_date = manila_now::date
    and p_start_time <= manila_now::time then
    raise exception 'scheduled appointment start time must be in the future'
      using errcode = '22007';
  end if;

  if p_appointment_type in (
      'scheduled'::public.appointment_type,
      'follow_up'::public.appointment_type,
      'home_visit'::public.appointment_type
    )
    and not resident_request
    and nullif(btrim(p_reason), '') is null then
    raise exception 'an appointment reason is required'
      using errcode = '23514';
  end if;

  if p_staff_id is not null then
    select p.role into staff_role
    from public.profiles as p
    where p.id = p_staff_id
      and p.account_status = 'active'::public.account_status
      and p.role in (
        'barangay_health_worker'::public.app_role,
        'nurse'::public.app_role,
        'midwife'::public.app_role
      );

    if staff_role is null then
      raise exception 'assigned staff must be an active eligible staff member'
        using errcode = '23514';
    end if;

    if staff_role = 'midwife'::public.app_role
      and p_service_type not in ('Maternal Care', 'Child Health') then
      raise exception 'midwives may be assigned only to maternal or child services'
        using errcode = '23514';
    end if;
  end if;

  perform public.appointment_assert_slot_available(
    p_staff_id,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    p_exclude_id
  );
end;
$$;

revoke all on function public.appointment_validate_schedule(
  uuid, public.appointment_type, text, date, time, time, uuid, text, uuid
) from public, anon, authenticated;

create or replace function public.resident_appointment_request(
  p_service_type text,
  p_scheduled_date date,
  p_start_time time,
  p_reason text,
  p_request_key uuid
)
returns table (
  id uuid,
  appointment_number text,
  status public.appointment_status,
  version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  resident_record public.residents%rowtype;
  existing_record public.appointments%rowtype;
  normalized_reason text := nullif(btrim(p_reason), '');
  provisional_duration interval :=
    public.resident_appointment_provisional_duration();
  provisional_end_at timestamp;
  provisional_end_time time;
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'appointment requests require an active resident account'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an appointment request key is required'
      using errcode = '23502';
  end if;
  if p_scheduled_date is null or p_start_time is null then
    raise exception 'a preferred appointment date and start time are required'
      using errcode = '23502';
  end if;
  if char_length(normalized_reason) > 1000 then
    raise exception 'reason for visit must be 1,000 characters or fewer'
      using errcode = '23514';
  end if;
  if provisional_duration <= interval '0 seconds'
    or provisional_duration >= interval '1 day' then
    raise exception 'resident appointment provisional duration is invalid'
      using errcode = '22023';
  end if;

  provisional_end_at :=
    p_scheduled_date + p_start_time + provisional_duration;
  if provisional_end_at::date is distinct from p_scheduled_date then
    raise exception
      'preferred start time must allow the provisional appointment to end on the same date'
      using errcode = '22007';
  end if;
  provisional_end_time := provisional_end_at::time;
  if provisional_end_time <= p_start_time then
    raise exception 'provisional appointment end time must be after start time'
      using errcode = '22007';
  end if;

  select * into resident_record
  from public.residents as r
  where r.linked_profile_id = actor_id
  limit 1;

  if not found then
    raise exception 'resident account is not linked to a resident record'
      using errcode = '42501';
  end if;
  if resident_record.status <> 'active'::public.resident_status
    or resident_record.archived_at is not null then
    raise exception 'linked resident record must be active'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'alaga:resident-request-key:' || actor_id::text || ':' ||
        p_request_key::text,
      0
    )
  );

  select * into existing_record
  from public.appointments as a
  where a.request_key = p_request_key
  limit 1;

  if found then
    if existing_record.created_by is distinct from actor_id
      or existing_record.resident_id is distinct from resident_record.id
      or existing_record.request_source is distinct from
        'resident'::public.appointment_request_source
      or existing_record.service_type is distinct from p_service_type
      or existing_record.scheduled_date is distinct from p_scheduled_date
      or existing_record.start_time is distinct from p_start_time
      or existing_record.end_time is distinct from provisional_end_time
      or existing_record.reason is distinct from normalized_reason then
      raise exception 'appointment request key was reused with different data'
        using errcode = '23514';
    end if;

    return query
    select existing_record.id, existing_record.appointment_number,
      existing_record.status, existing_record.version;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'alaga:resident-request-slot:' || resident_record.id::text || ':' ||
        p_scheduled_date::text || ':' || p_start_time::text || ':' ||
        coalesce(p_service_type, ''),
      0
    )
  );

  if exists (
    select 1
    from public.appointments as a
    where a.resident_id = resident_record.id
      and a.request_source = 'resident'
      and a.status = 'pending'
      and a.archived_at is null
      and a.service_type = p_service_type
      and a.scheduled_date = p_scheduled_date
      and a.start_time = p_start_time
      and a.end_time = provisional_end_time
  ) then
    raise exception 'a matching pending resident request already exists'
      using errcode = '23505';
  end if;

  perform public.appointment_validate_schedule(
    resident_record.id,
    'scheduled'::public.appointment_type,
    p_service_type,
    p_scheduled_date,
    p_start_time,
    provisional_end_time,
    null,
    normalized_reason,
    null
  );

  return query
  insert into public.appointments (
    resident_id,
    assigned_staff_id,
    appointment_type,
    service_type,
    scheduled_date,
    start_time,
    end_time,
    priority,
    status,
    reason,
    operational_notes,
    request_key,
    request_source,
    requested_date,
    requested_start_time,
    requested_end_time,
    resident_requested_at,
    created_by,
    updated_by
  ) values (
    resident_record.id,
    null,
    'scheduled'::public.appointment_type,
    p_service_type,
    p_scheduled_date,
    p_start_time,
    provisional_end_time,
    'normal'::public.appointment_priority,
    'pending'::public.appointment_status,
    normalized_reason,
    null,
    p_request_key,
    'resident'::public.appointment_request_source,
    p_scheduled_date,
    p_start_time,
    provisional_end_time,
    pg_catalog.now(),
    actor_id,
    actor_id
  )
  returning appointments.id, appointments.appointment_number,
    appointments.status, appointments.version;
end;
$$;

revoke all on function public.resident_appointment_request(
  text, date, time, text, uuid
) from public, anon;

grant execute on function public.resident_appointment_request(
  text, date, time, text, uuid
) to authenticated, service_role;

commit;
