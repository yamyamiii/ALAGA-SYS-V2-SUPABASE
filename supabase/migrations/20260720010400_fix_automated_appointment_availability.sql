-- Repair the shared AUTO_SLOT availability query without changing its API,
-- authorization, recurring schedule, or capacity rules. The old resident_id
-- local variable conflicted with appointments.resident_id (SQLSTATE 42702).

begin;

create or replace function public.appointment_resident_available_slots(
  p_service_type text,
  p_date_from date,
  p_date_to date
)
returns table (
  scheduled_date date,
  start_time time,
  end_time time
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_resident_id uuid;
  schedule public.appointment_service_schedules%rowtype;
  manila_now timestamp := statement_timestamp() at time zone 'Asia/Manila';
begin
  if public.current_profile_role() is distinct from
      'resident'::public.app_role then
    raise exception 'appointment availability requires a resident account'
      using errcode = '42501';
  end if;

  select resident.id into v_resident_id
  from public.residents as resident
  where resident.linked_profile_id = actor_id
    and resident.status = 'active'::public.resident_status
    and resident.archived_at is null
  limit 1;
  if v_resident_id is null then
    raise exception 'resident account is not linked to an active resident record'
      using errcode = '42501';
  end if;

  if p_date_from is null or p_date_to is null
    or p_date_from < manila_now::date
    or p_date_to < p_date_from
    or p_date_to - p_date_from > 62 then
    raise exception 'appointment availability range is invalid'
      using errcode = '22007';
  end if;

  select service_schedule.* into schedule
  from public.appointment_service_schedules as service_schedule
  where service_schedule.service_type = p_service_type
    and service_schedule.is_active;
  if not found then
    raise exception 'appointment service is unavailable'
      using errcode = '23514';
  end if;
  if schedule.booking_mode <> 'AUTO_SLOT' then
    return;
  end if;

  return query
  with candidate_dates as (
    select generated_date.day_value::date as scheduled_date
    from pg_catalog.generate_series(
      p_date_from::timestamp,
      p_date_to::timestamp,
      interval '1 day'
    ) as generated_date(day_value)
    where public.appointment_service_date_allowed(
      p_service_type,
      generated_date.day_value::date
    )
  ), candidate_slots as (
    select candidate_date.scheduled_date,
      generated_slot.slot_value::time as start_time,
      (
        generated_slot.slot_value
        + pg_catalog.make_interval(mins => schedule.slot_duration_minutes)
      )::time as end_time
    from candidate_dates as candidate_date
    cross join lateral pg_catalog.generate_series(
      candidate_date.scheduled_date + schedule.first_start_time,
      candidate_date.scheduled_date + schedule.last_start_time,
      pg_catalog.make_interval(mins => schedule.slot_interval_minutes)
    ) as generated_slot(slot_value)
  )
  select slot.scheduled_date, slot.start_time, slot.end_time
  from candidate_slots as slot
  where slot.scheduled_date + slot.start_time > manila_now
    and not exists (
      select 1
      from public.appointments as own_appointment
      where own_appointment.resident_id = v_resident_id
        and own_appointment.scheduled_date = slot.scheduled_date
        and own_appointment.archived_at is null
        and own_appointment.status in (
          'pending'::public.appointment_status,
          'confirmed'::public.appointment_status,
          'checked_in'::public.appointment_status,
          'in_progress'::public.appointment_status
        )
        and own_appointment.start_time < slot.end_time
        and own_appointment.end_time > slot.start_time
    )
    and exists (
      select 1
      from public.profiles as staff
      where staff.account_status = 'active'::public.account_status
        and staff.retired_at is null
        and public.appointment_staff_role_eligible(
          staff.role,
          p_service_type
        )
        and not exists (
          select 1
          from public.appointments as assigned_appointment
          where assigned_appointment.assigned_staff_id = staff.id
            and assigned_appointment.scheduled_date = slot.scheduled_date
            and assigned_appointment.archived_at is null
            and assigned_appointment.status in (
              'pending'::public.appointment_status,
              'confirmed'::public.appointment_status,
              'checked_in'::public.appointment_status,
              'in_progress'::public.appointment_status
            )
            and assigned_appointment.start_time < slot.end_time
            and assigned_appointment.end_time > slot.start_time
        )
    )
  order by slot.scheduled_date, slot.start_time;
end;
$$;

revoke all on function public.appointment_resident_available_slots(
  text, date, date
) from public, anon;
grant execute on function public.appointment_resident_available_slots(
  text, date, date
) to authenticated, service_role;

-- Automatic assignment must not make the existing optional Resident reason
-- required. This private validator allows omission only for the current linked
-- active Resident (or the already-supported edit of a Resident-origin record).
-- Staff-created appointment reasons and all assignment/conflict checks remain.
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
    and p_exclude_id is null
    and exists (
      select 1
      from public.residents as linked_resident
      where linked_resident.id = p_resident_id
        and linked_resident.linked_profile_id = auth.uid()
        and linked_resident.status = 'active'::public.resident_status
        and linked_resident.archived_at is null
    );
  legacy_service_preserved boolean := false;
begin
  if not resident_reason_optional and p_exclude_id is not null then
    select exists (
      select 1
      from public.appointments as appointment
      where appointment.id = p_exclude_id
        and appointment.resident_id = p_resident_id
        and appointment.request_source =
          'resident'::public.appointment_request_source
    ) into resident_reason_optional;
  end if;

  if not exists (
    select 1
    from public.residents as resident
    where resident.id = p_resident_id
      and resident.status = 'active'::public.resident_status
      and resident.archived_at is null
  ) then
    raise exception 'resident must be active and available for scheduling'
      using errcode = '23514';
  end if;

  if p_exclude_id is not null then
    select exists (
      select 1
      from public.appointments as appointment
      where appointment.id = p_exclude_id
        and appointment.resident_id = p_resident_id
        and appointment.service_type = p_service_type
        and appointment.service_type in (
          'Child Health',
          'Blood Pressure Monitoring',
          'Medicine Refill',
          'Health Certificate',
          'Other'
        )
    ) into legacy_service_preserved;
  end if;

  if public.appointment_service_type_valid(p_service_type) is not true
    and not legacy_service_preserved then
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
    select profile.role into staff_role
    from public.profiles as profile
    where profile.id = p_staff_id
      and profile.account_status = 'active'::public.account_status
      and profile.retired_at is null;

    if staff_role is null
      or public.appointment_staff_role_eligible(
        staff_role,
        p_service_type
      ) is not true then
      raise exception 'assigned staff must be active and eligible for the selected service'
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

commit;
