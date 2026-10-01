-- Make standard Resident appointment booking database-authoritative and
-- automatic. The booking window below is an appointment scheduling rule; it
-- is not a statement of official health-center opening hours.

begin;

create table public.appointment_service_schedules (
  service_type text primary key,
  booking_mode text not null,
  is_active boolean not null default true,
  iso_weekday smallint,
  occurrence_in_month smallint,
  slot_duration_minutes smallint,
  slot_interval_minutes smallint,
  first_start_time time,
  last_start_time time,
  display_order smallint not null,
  constraint appointment_service_schedules_service_valid check (
    public.appointment_service_type_valid(service_type)
  ),
  constraint appointment_service_schedules_booking_mode_valid check (
    booking_mode in ('AUTO_SLOT', 'COORDINATION_REQUIRED')
  ),
  constraint appointment_service_schedules_weekday_valid check (
    iso_weekday is null or iso_weekday between 1 and 7
  ),
  constraint appointment_service_schedules_occurrence_valid check (
    occurrence_in_month is null or occurrence_in_month between 1 and 5
  ),
  constraint appointment_service_schedules_rule_shape_valid check (
    occurrence_in_month is null or iso_weekday is not null
  ),
  constraint appointment_service_schedules_slot_shape_valid check (
    (
      booking_mode = 'AUTO_SLOT'
      and slot_duration_minutes between 5 and 240
      and slot_interval_minutes between 5 and 240
      and first_start_time is not null
      and last_start_time is not null
      and last_start_time >= first_start_time
    ) or (
      booking_mode = 'COORDINATION_REQUIRED'
      and slot_duration_minutes is null
      and slot_interval_minutes is null
      and first_start_time is null
      and last_start_time is null
      and iso_weekday is null
      and occurrence_in_month is null
    )
  ),
  constraint appointment_service_schedules_display_order_unique
    unique (display_order)
);

alter table public.appointment_service_schedules enable row level security;
revoke all on table public.appointment_service_schedules
  from public, anon, authenticated;
grant select on table public.appointment_service_schedules to service_role;

insert into public.appointment_service_schedules (
  service_type,
  booking_mode,
  iso_weekday,
  occurrence_in_month,
  slot_duration_minutes,
  slot_interval_minutes,
  first_start_time,
  last_start_time,
  display_order
) values
  ('General Consultation', 'AUTO_SLOT', null, null, 30, 30, '08:00', '16:00', 1),
  ('Buntis / Prenatal Care', 'AUTO_SLOT', 2, null, 30, 30, '08:00', '16:00', 2),
  ('Maternal Care', 'AUTO_SLOT', 2, 1, 30, 30, '08:00', '16:00', 3),
  ('Immunization', 'AUTO_SLOT', 3, 1, 30, 30, '08:00', '16:00', 4),
  ('Family Planning', 'AUTO_SLOT', 4, null, 30, 30, '08:00', '16:00', 5),
  ('Postpartum Home Visit', 'COORDINATION_REQUIRED', null, null, null, null, null, null, 6);

-- One role/service predicate is shared by staff search, validation,
-- availability, and automatic assignment. It intentionally preserves the
-- existing rule: active BHW/Nurse profiles are generally eligible, while a
-- Midwife is eligible only for Maternal Care and the retained legacy Child
-- Health value.
create or replace function public.appointment_staff_role_eligible(
  p_role public.app_role,
  p_service_type text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_role in (
      'barangay_health_worker'::public.app_role,
      'nurse'::public.app_role
    )
    or (
      p_role = 'midwife'::public.app_role
      and p_service_type in ('Maternal Care', 'Child Health')
    )
$$;

revoke all on function public.appointment_staff_role_eligible(
  public.app_role, text
) from public, anon, authenticated;

create or replace function public.appointment_service_date_allowed(
  p_service_type text,
  p_scheduled_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select schedule.booking_mode = 'AUTO_SLOT'
      and schedule.is_active
      and (
        schedule.iso_weekday is null
        or extract(isodow from p_scheduled_date)::smallint =
          schedule.iso_weekday
      )
      and (
        schedule.occurrence_in_month is null
        or (((extract(day from p_scheduled_date)::integer - 1) / 7) + 1) =
          schedule.occurrence_in_month
      )
    from public.appointment_service_schedules as schedule
    where schedule.service_type = p_service_type
  ), false)
$$;

revoke all on function public.appointment_service_date_allowed(text, date)
  from public, anon, authenticated;

create or replace function public.appointment_resident_service_catalog()
returns table (
  service_type text,
  booking_mode text,
  slot_duration_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if public.current_profile_role() is distinct from
      'resident'::public.app_role
    or not exists (
      select 1
      from public.residents as resident
      where resident.linked_profile_id = actor_id
        and resident.status = 'active'::public.resident_status
        and resident.archived_at is null
    ) then
    raise exception 'appointment booking requires an active linked resident'
      using errcode = '42501';
  end if;

  return query
  select schedule.service_type,
    schedule.booking_mode,
    schedule.slot_duration_minutes::integer
  from public.appointment_service_schedules as schedule
  where schedule.is_active
  order by schedule.display_order;
end;
$$;

revoke all on function public.appointment_resident_service_catalog()
  from public, anon;
grant execute on function public.appointment_resident_service_catalog()
  to authenticated, service_role;

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
  resident_id uuid;
  schedule public.appointment_service_schedules%rowtype;
  manila_now timestamp := statement_timestamp() at time zone 'Asia/Manila';
begin
  if public.current_profile_role() is distinct from
      'resident'::public.app_role then
    raise exception 'appointment availability requires a resident account'
      using errcode = '42501';
  end if;

  select resident.id into resident_id
  from public.residents as resident
  where resident.linked_profile_id = actor_id
    and resident.status = 'active'::public.resident_status
    and resident.archived_at is null
  limit 1;
  if resident_id is null then
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
      where own_appointment.resident_id = resident_id
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

-- Reuse the centralized role/service predicate in every trusted staff
-- validation path. Staff-assisted workflows retain their existing exception
-- authority over service dates; the automatic Resident RPC enforces the
-- authoritative recurring schedule below.
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

create or replace function public.appointment_search_staff(
  p_search text default null,
  p_service_type text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  role public.app_role,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if actor_role is null or actor_role = 'resident'::public.app_role then
    raise exception 'staff search requires an authorized staff account'
      using errcode = '42501';
  end if;
  if p_limit not between 1 and 25 or p_offset < 0 then
    raise exception 'invalid staff search pagination';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'staff search is too long';
  end if;
  if p_service_type is not null and p_service_type not in (
    'General Consultation',
    'Buntis / Prenatal Care',
    'Maternal Care',
    'Immunization',
    'Family Planning',
    'Postpartum Home Visit',
    'Child Health',
    'Blood Pressure Monitoring',
    'Medicine Refill',
    'Health Certificate',
    'Other'
  ) then
    raise exception 'invalid appointment service type';
  end if;
  search_pattern := '%' || normalized_search || '%';

  return query
  select profile.id,
    profile.first_name,
    profile.middle_name,
    profile.last_name,
    profile.suffix,
    profile.role,
    count(*) over ()
  from public.profiles as profile
  where profile.account_status = 'active'::public.account_status
    and profile.retired_at is null
    and (
      p_service_type is null
      or public.appointment_staff_role_eligible(
        profile.role,
        p_service_type
      )
    )
    and profile.role in (
      'barangay_health_worker'::public.app_role,
      'nurse'::public.app_role,
      'midwife'::public.app_role
    )
    and (
      normalized_search is null
      or concat_ws(
        ' ',
        profile.first_name,
        profile.middle_name,
        profile.last_name,
        profile.suffix
      ) ilike search_pattern
    )
  order by lower(coalesce(profile.last_name, '')),
    lower(coalesce(profile.first_name, '')),
    profile.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.appointment_search_staff(
  text, text, integer, integer
) from public, anon;
grant execute on function public.appointment_search_staff(
  text, text, integer, integer
) to authenticated, service_role;

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
  created_record public.appointments%rowtype;
  schedule public.appointment_service_schedules%rowtype;
  normalized_reason text := nullif(btrim(p_reason), '');
  appointment_end_time time;
  selected_staff_id uuid;
  candidate_staff_id uuid;
  seconds_from_first numeric;
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'appointment booking requires an active resident account'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an appointment booking request key is required'
      using errcode = '23502';
  end if;
  if p_scheduled_date is null or p_start_time is null then
    raise exception 'an available appointment date and time are required'
      using errcode = '23502';
  end if;
  if char_length(normalized_reason) > 1000 then
    raise exception 'reason for visit must be 1,000 characters or fewer'
      using errcode = '23514';
  end if;

  select resident.* into resident_record
  from public.residents as resident
  where resident.linked_profile_id = actor_id
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

  select appointment.* into existing_record
  from public.appointments as appointment
  where appointment.created_by = actor_id
    and appointment.request_key = p_request_key
  limit 1;
  if found then
    if existing_record.created_by is distinct from actor_id
      or existing_record.resident_id is distinct from resident_record.id
      or existing_record.request_source is distinct from
        'resident'::public.appointment_request_source
      or existing_record.service_type is distinct from p_service_type
      or existing_record.scheduled_date is distinct from p_scheduled_date
      or existing_record.start_time is distinct from p_start_time
      or existing_record.reason is distinct from normalized_reason then
      raise exception 'appointment booking request key was reused with different data'
        using errcode = '23514';
    end if;

    return query
    select existing_record.id,
      existing_record.appointment_number,
      existing_record.status,
      existing_record.version;
    return;
  end if;

  select service_schedule.* into schedule
  from public.appointment_service_schedules as service_schedule
  where service_schedule.service_type = p_service_type
    and service_schedule.is_active
  for share;
  if not found then
    raise exception 'appointment service is unavailable'
      using errcode = '23514';
  end if;
  if schedule.booking_mode <> 'AUTO_SLOT' then
    raise exception 'selected service requires health-center coordination and cannot be instantly booked'
      using errcode = '23514';
  end if;
  if public.appointment_service_date_allowed(
      p_service_type,
      p_scheduled_date
    ) is not true then
    raise exception 'selected date is not available for this service'
      using errcode = '22007';
  end if;
  if public.appointment_start_time_valid(p_start_time) is not true
    or p_start_time < schedule.first_start_time
    or p_start_time > schedule.last_start_time then
    raise exception 'selected time is outside the appointment booking window'
      using errcode = '22007';
  end if;

  seconds_from_first := extract(
    epoch from (p_start_time - schedule.first_start_time)
  );
  if mod(
      seconds_from_first::integer,
      schedule.slot_interval_minutes::integer * 60
    ) <> 0 then
    raise exception 'selected time is not a valid appointment slot'
      using errcode = '22007';
  end if;

  appointment_end_time := (
    p_scheduled_date + p_start_time
    + pg_catalog.make_interval(mins => schedule.slot_duration_minutes)
  )::time;

  -- Serialize one Resident's schedule for the date, then reject any overlap
  -- regardless of service. This prevents duplicate or conflicting bookings.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'alaga:resident-appointment-date:' || resident_record.id::text || ':' ||
        p_scheduled_date::text,
      0
    )
  );
  if exists (
    select 1
    from public.appointments as own_appointment
    where own_appointment.resident_id = resident_record.id
      and own_appointment.scheduled_date = p_scheduled_date
      and own_appointment.archived_at is null
      and own_appointment.status in (
        'pending'::public.appointment_status,
        'confirmed'::public.appointment_status,
        'checked_in'::public.appointment_status,
        'in_progress'::public.appointment_status
      )
      and own_appointment.start_time < appointment_end_time
      and own_appointment.end_time > p_start_time
  ) then
    raise exception 'you already have an appointment that overlaps this slot'
      using errcode = '23P01';
  end if;

  -- Lowest active workload on the selected date wins; profile UUID is the
  -- stable tie-break. Each candidate's date lock is shared with staff-created
  -- and rescheduled appointment validation, so a concurrent writer cannot
  -- double-book that staff member.
  for candidate_staff_id in
    select staff.id
    from public.profiles as staff
    where staff.account_status = 'active'::public.account_status
      and staff.retired_at is null
      and public.appointment_staff_role_eligible(
        staff.role,
        p_service_type
      )
    order by (
      select count(*)
      from public.appointments as workload
      where workload.assigned_staff_id = staff.id
        and workload.scheduled_date = p_scheduled_date
        and workload.archived_at is null
        and workload.status in (
          'pending'::public.appointment_status,
          'confirmed'::public.appointment_status,
          'checked_in'::public.appointment_status,
          'in_progress'::public.appointment_status
        )
    ), staff.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'alaga:appointment-slot:' || candidate_staff_id::text || ':' ||
          p_scheduled_date::text,
        0
      )
    );

    if not exists (
      select 1
      from public.appointments as assigned_appointment
      where assigned_appointment.assigned_staff_id = candidate_staff_id
        and assigned_appointment.scheduled_date = p_scheduled_date
        and assigned_appointment.archived_at is null
        and assigned_appointment.status in (
          'pending'::public.appointment_status,
          'confirmed'::public.appointment_status,
          'checked_in'::public.appointment_status,
          'in_progress'::public.appointment_status
        )
        and assigned_appointment.start_time < appointment_end_time
        and assigned_appointment.end_time > p_start_time
    ) then
      selected_staff_id := candidate_staff_id;
      exit;
    end if;
  end loop;

  if selected_staff_id is null then
    raise exception 'That appointment slot is no longer available. Please choose another time.'
      using errcode = '23P01';
  end if;

  perform public.appointment_validate_schedule(
    resident_record.id,
    'scheduled'::public.appointment_type,
    p_service_type,
    p_scheduled_date,
    p_start_time,
    appointment_end_time,
    selected_staff_id,
    normalized_reason,
    null
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
    selected_staff_id,
    'scheduled'::public.appointment_type,
    p_service_type,
    p_scheduled_date,
    p_start_time,
    appointment_end_time,
    'normal'::public.appointment_priority,
    'confirmed'::public.appointment_status,
    normalized_reason,
    null,
    p_request_key,
    'resident'::public.appointment_request_source,
    p_scheduled_date,
    p_start_time,
    appointment_end_time,
    statement_timestamp(),
    actor_id,
    actor_id
  ) returning appointments.* into created_record;

  return query
  select created_record.id,
    created_record.appointment_number,
    created_record.status,
    created_record.version;
end;
$$;

revoke all on function public.resident_appointment_request(
  text, date, time, text, uuid
) from public, anon;
grant execute on function public.resident_appointment_request(
  text, date, time, text, uuid
) to authenticated, service_role;

-- Confirmed INSERTs were previously ignored because the old Resident flow
-- always inserted Pending. This narrow trigger creates idempotent safe
-- in-app/outbound events for the new automatic path.
create or replace function public.notify_automated_resident_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resident_profile_id uuid;
  safe_summary text;
  safe_values jsonb;
begin
  if new.request_source is distinct from
      'resident'::public.appointment_request_source
    or new.status is distinct from
      'confirmed'::public.appointment_status
    or new.assigned_staff_id is null then
    return new;
  end if;

  select resident.linked_profile_id into resident_profile_id
  from public.residents as resident
  where resident.id = new.resident_id;

  safe_summary := 'Appointment ' || new.appointment_number ||
    ' is confirmed for ' ||
    pg_catalog.to_char(new.scheduled_date, 'FMMonth FMDD, YYYY') ||
    ' at ' || pg_catalog.to_char(new.start_time, 'FMHH12:MI AM') || '.';
  safe_values := jsonb_build_object(
    'date', pg_catalog.to_char(new.scheduled_date, 'FMMonth FMDD, YYYY'),
    'time', pg_catalog.to_char(new.start_time, 'FMHH12:MI AM')
  );

  begin
    perform public.assistance_add_notification(
      resident_profile_id,
      'appointment_approved'::public.assistance_notification_type,
      'Appointment confirmed',
      safe_summary,
      'appointments',
      new.id,
      '/appointments',
      'appointment:' || new.id::text || ':confirmed',
      statement_timestamp()
    );
    if new.assigned_staff_id is distinct from resident_profile_id then
      perform public.assistance_add_notification(
        new.assigned_staff_id,
        'appointment_approved'::public.assistance_notification_type,
        'Appointment assigned',
        'A confirmed appointment was assigned to you.',
        'appointments',
        new.id,
        '/appointments',
        'staff-appointment:' || new.id::text || ':confirmed',
        statement_timestamp()
      );
    end if;
  exception when others then
    raise warning 'automatic appointment in-app notification failed for %',
      new.id;
  end;

  begin
    perform public.notification_enqueue_for_profile(
      resident_profile_id,
      'appointment:' || new.id::text || ':confirmed',
      'appointment_confirmed'::public.outbound_notification_event,
      'appointments',
      new.id,
      'appointment_confirmed'::public.outbound_notification_template,
      safe_values,
      statement_timestamp()
    );
    perform public.notification_schedule_appointment_reminder(new);
  exception when others then
    raise warning 'automatic appointment outbound notification failed for %',
      new.id;
  end;

  return new;
end;
$$;

revoke all on function public.notify_automated_resident_appointment()
  from public, anon, authenticated;

create trigger appointments_automated_resident_notifications
  after insert on public.appointments
  for each row execute function public.notify_automated_resident_appointment();

-- Preserve the existing minimized audit/event design while identifying the
-- automatic path explicitly. Reason text is never copied into request
-- metadata or event payloads.
create or replace function public.audit_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_row jsonb := to_jsonb(new);
  audit_action text := 'appointment.created';
  audit_summary text := 'Created appointment';
  actor_uuid uuid;
  actor_role public.app_role := public.current_profile_role();
  request_event public.appointment_request_event_type;
  request_metadata jsonb;
  automatically_scheduled boolean := false;
begin
  select profile.id into actor_uuid
  from public.profiles as profile
  where profile.id = auth.uid()
  limit 1;

  automatically_scheduled := tg_op = 'INSERT'
    and new.request_source = 'resident'::public.appointment_request_source
    and new.status = 'confirmed'::public.appointment_status
    and new.assigned_staff_id is not null;

  if automatically_scheduled then
    audit_action := 'appointment.auto_scheduled';
    audit_summary := 'Automatically scheduled resident appointment';
    request_event := 'request_confirmed';
  elsif tg_op = 'INSERT'
    and new.request_source = 'resident'::public.appointment_request_source then
    if new.rescheduled_from_id is null then
      audit_action := 'appointment.resident_requested';
      audit_summary := 'Resident requested appointment';
      request_event := 'request_received';
    else
      audit_action := 'appointment.request_schedule_adjusted';
      audit_summary := 'Adjusted resident-requested schedule';
      request_event := 'schedule_changed';
    end if;
  elsif tg_op = 'UPDATE' then
    audit_action := case
      when old.request_source = 'resident'
        and (
          old.scheduled_date is distinct from new.scheduled_date
          or old.start_time is distinct from new.start_time
          or old.end_time is distinct from new.end_time
        ) then 'appointment.request_schedule_adjusted'
      when old.request_source = 'resident'
        and old.status = 'pending'
        and new.status = 'confirmed'
        then 'appointment.request_confirmed'
      when old.request_source = 'resident'
        and old.status = 'pending'
        and new.status = 'cancelled'
        and actor_role = 'resident'
        then 'appointment.resident_cancelled'
      when old.request_source = 'resident'
        and old.status = 'pending'
        and new.status = 'cancelled'
        then 'appointment.request_rejected'
      when old.archived_at is null and new.archived_at is not null
        then 'appointment.archived'
      when old.archived_at is not null and new.archived_at is null
        then 'appointment.restored'
      when old.status <> new.status and new.status = 'confirmed'
        then 'appointment.confirmed'
      when old.status <> new.status and new.status = 'checked_in'
        then 'appointment.checked_in'
      when old.status <> new.status and new.status = 'in_progress'
        then 'appointment.started'
      when old.status <> new.status and new.status = 'completed'
        then 'appointment.completed'
      when old.status <> new.status and new.status = 'cancelled'
        then 'appointment.cancelled'
      when old.status <> new.status and new.status = 'no_show'
        then 'appointment.no_show'
      when old.status <> new.status and new.status = 'rescheduled'
        then 'appointment.rescheduled'
      when old.assigned_staff_id is distinct from new.assigned_staff_id
        then 'appointment.staff_assigned'
      when old.priority is distinct from new.priority
        then 'appointment.priority_changed'
      else 'appointment.updated'
    end;
    audit_summary :=
      initcap(replace(audit_action, 'appointment.', '')) || ' appointment';
    request_event := case audit_action
      when 'appointment.request_confirmed' then 'request_confirmed'
      when 'appointment.resident_cancelled' then 'request_cancelled'
      when 'appointment.request_rejected' then 'request_rejected'
      when 'appointment.request_schedule_adjusted' then 'schedule_changed'
      else null
    end;
  end if;

  request_metadata := case
    when automatically_scheduled then jsonb_build_object(
      'request_source', 'resident_self_booking',
      'scheduling', 'automatic',
      'staff_assignment', 'automatic',
      'confirmation', 'automatic',
      'requested_schedule', jsonb_build_object(
        'date', new.requested_date,
        'start_time', new.requested_start_time,
        'end_time', new.requested_end_time
      )
    )
    when new.request_source = 'resident' then jsonb_build_object(
      'changed_fields', case when tg_op = 'UPDATE'
        then public.appointment_changed_fields(old_row, new_row)
        else null
      end,
      'requested_schedule', jsonb_build_object(
        'date', new.requested_date,
        'start_time', new.requested_start_time,
        'end_time', new.requested_end_time
      )
    )
    when tg_op = 'UPDATE' then jsonb_build_object(
      'changed_fields', public.appointment_changed_fields(old_row, new_row)
    )
    else null
  end;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    summary,
    old_values,
    new_values,
    request_metadata
  ) values (
    actor_uuid,
    audit_action,
    'appointments',
    new.id,
    audit_summary,
    public.audit_safe_snapshot('appointments', old_row),
    public.audit_safe_snapshot('appointments', new_row),
    request_metadata
  );

  if request_event is not null then
    insert into public.appointment_request_events (
      appointment_id,
      resident_id,
      actor_profile_id,
      event_type,
      payload
    ) values (
      new.id,
      new.resident_id,
      actor_uuid,
      request_event,
      jsonb_build_object(
        'appointment_number', new.appointment_number,
        'status', new.status,
        'scheduled_date', new.scheduled_date,
        'start_time', new.start_time,
        'end_time', new.end_time,
        'requested_date', new.requested_date,
        'requested_start_time', new.requested_start_time,
        'requested_end_time', new.requested_end_time,
        'occurred_at', pg_catalog.now()
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_appointment_change()
  from public, anon, authenticated;

commit;
