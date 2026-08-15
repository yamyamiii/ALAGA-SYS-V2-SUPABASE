-- Staff may schedule and assign a Resident-originated request without
-- inventing a visit reason. Staff-originated scheduled appointments retain
-- their existing reason requirement.

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
  resident_reason_optional boolean :=
    public.current_profile_role() = 'resident'::public.app_role
    and p_staff_id is null
    and p_exclude_id is null;
begin
  if not resident_reason_optional and p_exclude_id is not null then
    select exists (
      select 1
      from public.appointments as a
      where a.id = p_exclude_id
        and a.resident_id = p_resident_id
        and a.request_source = 'resident'::public.appointment_request_source
    ) into resident_reason_optional;
  end if;

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
    and not resident_reason_optional
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

-- The reschedule workflow creates a replacement row but validates against the
-- locked original row's trusted request source. Other appointment conflicts
-- remain serialized and visible to appointment_assert_slot_available.
create or replace function public.appointment_reschedule(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_assigned_staff_id uuid,
  p_request_key uuid
)
returns table (
  original_id uuid,
  original_version bigint,
  replacement_id uuid,
  replacement_number text,
  replacement_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.appointments%rowtype;
  replacement_record public.appointments%rowtype;
  replacement_type public.appointment_type;
begin
  if actor_role is null or actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role
  ) then
    raise exception 'rescheduling requires an administrator or BHW'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'a reschedule request key is required'
      using errcode = '23502';
  end if;

  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  select * into replacement_record
  from public.appointments as a
  where a.rescheduled_from_id = current_record.id
     or (a.request_key = p_request_key and a.created_by = actor_id)
  order by (a.rescheduled_from_id = current_record.id) desc
  limit 1;
  if found
    and current_record.status = 'rescheduled'::public.appointment_status then
    return query
    select current_record.id, current_record.version,
      replacement_record.id, replacement_record.appointment_number,
      replacement_record.version;
    return;
  end if;

  if current_record.archived_at is not null
    or current_record.status not in ('pending', 'confirmed') then
    raise exception 'only current pending or confirmed appointments can be rescheduled'
      using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user'
      using errcode = '40001';
  end if;

  replacement_type := case
    when current_record.appointment_type = 'walk_in'::public.appointment_type
      then 'scheduled'::public.appointment_type
    else current_record.appointment_type
  end;

  perform public.appointment_validate_schedule(
    current_record.resident_id,
    replacement_type,
    current_record.service_type,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    p_assigned_staff_id,
    current_record.reason,
    current_record.id
  );

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
    rescheduled_from_id,
    request_key,
    request_source,
    requested_date,
    requested_start_time,
    requested_end_time,
    resident_requested_at,
    created_by,
    updated_by
  ) values (
    current_record.resident_id,
    p_assigned_staff_id,
    replacement_type,
    current_record.service_type,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    current_record.priority,
    'pending'::public.appointment_status,
    current_record.reason,
    current_record.operational_notes,
    current_record.id,
    p_request_key,
    current_record.request_source,
    current_record.requested_date,
    current_record.requested_start_time,
    current_record.requested_end_time,
    current_record.resident_requested_at,
    actor_id,
    actor_id
  )
  returning * into replacement_record;

  update public.appointments as a
  set status = 'rescheduled'::public.appointment_status,
      updated_by = actor_id
  where a.id = current_record.id
  returning * into current_record;

  return query
  select current_record.id, current_record.version,
    replacement_record.id, replacement_record.appointment_number,
    replacement_record.version;
end;
$$;

revoke all on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) from public, anon;

grant execute on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) to authenticated, service_role;

commit;
