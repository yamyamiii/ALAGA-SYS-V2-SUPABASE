-- Resident request UX refinement: residents choose only a preferred start
-- time. The trusted database boundary derives a provisional 30-minute range.

begin;

create or replace function public.resident_appointment_provisional_duration()
returns interval
language sql
immutable
parallel safe
set search_path = ''
as $$
  select interval '30 minutes';
$$;

revoke all on function public.resident_appointment_provisional_duration()
  from public, anon, authenticated;

-- Migration 22 exposed end time as a resident RPC argument. Retire that
-- overload so browser callers cannot choose or override the duration.
revoke all on function public.resident_appointment_request(
  text, date, time, time, text, uuid
) from public, anon, authenticated;

drop function public.resident_appointment_request(
  text, date, time, time, text, uuid
);

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
  if nullif(btrim(p_reason), '') is null
    or char_length(btrim(p_reason)) > 1000 then
    raise exception 'a valid reason for visit is required'
      using errcode = '23514';
  end if;
  if provisional_duration <= interval '0 seconds'
    or provisional_duration >= interval '1 day' then
    raise exception 'resident appointment provisional duration is invalid'
      using errcode = '22023';
  end if;

  -- Appointment date/time columns are Manila-local values. Build a local
  -- timestamp before extracting the end time so interval arithmetic cannot
  -- silently wrap into the next calendar day.
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
      or existing_record.reason is distinct from nullif(btrim(p_reason), '') then
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
    p_reason,
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
    nullif(btrim(p_reason), ''),
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
) to authenticated;

commit;
