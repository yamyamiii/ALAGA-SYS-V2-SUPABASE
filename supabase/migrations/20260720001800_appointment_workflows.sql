-- Phase 4: trusted appointment scheduling, queue, calendar, and lifecycle.
-- Business dates/times are stored as date/time values for Asia/Manila. Event
-- timestamps remain timestamptz. All browser mutations use the RPCs below.

begin;

alter table public.appointments
  add column version bigint not null default 1,
  add column request_key uuid;

create unique index appointments_request_key_unique
  on public.appointments (request_key)
  where request_key is not null;

create unique index appointments_single_replacement_unique
  on public.appointments (rescheduled_from_id)
  where rescheduled_from_id is not null;

create index appointments_calendar_idx
  on public.appointments (scheduled_date, start_time, status)
  where archived_at is null;

create index appointments_staff_conflict_idx
  on public.appointments (
    assigned_staff_id,
    scheduled_date,
    start_time,
    end_time
  )
  where assigned_staff_id is not null
    and archived_at is null
    and status in ('pending', 'confirmed', 'checked_in', 'in_progress');

create or replace function public.bump_appointment_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function public.bump_appointment_version() from public, anon, authenticated;

create trigger appointments_bump_version
  before update on public.appointments
  for each row execute function public.bump_appointment_version();

create or replace function public.appointment_service_type_valid(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value in (
    'General Consultation',
    'Maternal Care',
    'Child Health',
    'Immunization',
    'Blood Pressure Monitoring',
    'Medicine Refill',
    'Health Certificate',
    'Other'
  )
$$;

revoke all on function public.appointment_service_type_valid(text)
  from public, anon, authenticated;

create or replace function public.appointment_assert_slot_available(
  p_staff_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflict_record record;
begin
  if p_staff_id is null then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'alaga:appointment-slot:' || p_staff_id::text || ':' || p_scheduled_date::text,
      0
    )
  );

  select a.appointment_number, a.start_time, a.end_time
  into conflict_record
  from public.appointments as a
  where a.assigned_staff_id = p_staff_id
    and a.scheduled_date = p_scheduled_date
    and a.archived_at is null
    and a.status in (
      'pending'::public.appointment_status,
      'confirmed'::public.appointment_status,
      'checked_in'::public.appointment_status,
      'in_progress'::public.appointment_status
    )
    and (p_exclude_id is null or a.id <> p_exclude_id)
    and a.start_time < p_end_time
    and a.end_time > p_start_time
  order by a.start_time, a.id
  limit 1;

  if found then
    raise exception 'Staff schedule conflicts with appointment % from % to %',
      conflict_record.appointment_number,
      to_char(conflict_record.start_time, 'HH24:MI'),
      to_char(conflict_record.end_time, 'HH24:MI')
      using errcode = '23P01';
  end if;
end;
$$;

revoke all on function public.appointment_assert_slot_available(uuid, date, time, time, uuid)
  from public, anon, authenticated;

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
    ) and nullif(btrim(p_reason), '') is null then
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

revoke all on function public.appointment_validate_schedule(uuid, public.appointment_type, text, date, time, time, uuid, text, uuid)
  from public, anon, authenticated;

-- Direct appointment writes are retired. RLS remains authoritative for reads;
-- every write is independently authorized and validated by a trusted RPC.
drop policy if exists appointments_insert_admin_bhw on public.appointments;
drop policy if exists appointments_update_admin on public.appointments;
drop policy if exists appointments_update_bhw_active on public.appointments;
revoke insert, update on table public.appointments from authenticated;

drop policy if exists appointments_select_assigned_clinician on public.appointments;
create policy appointments_select_assigned_clinician
  on public.appointments for select to authenticated
  using (
    assigned_staff_id = auth.uid()
    and archived_at is null
    and (
      public.current_profile_role() = 'nurse'::public.app_role
      or (
        public.current_profile_role() = 'midwife'::public.app_role
        and service_type in ('Maternal Care', 'Child Health')
      )
    )
  );

create or replace function public.appointment_create(
  p_resident_id uuid,
  p_appointment_type public.appointment_type,
  p_service_type text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_priority public.appointment_priority,
  p_assigned_staff_id uuid,
  p_reason text,
  p_operational_notes text,
  p_request_key uuid
)
returns table (id uuid, appointment_number text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
begin
  if actor_role is null or actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role
  ) then
    raise exception 'appointment creation requires an administrator or BHW'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an appointment request key is required' using errcode = '23502';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000
    or char_length(coalesce(p_operational_notes, '')) > 2000 then
    raise exception 'appointment text exceeds the allowed length' using errcode = '22001';
  end if;

  return query
  select a.id, a.appointment_number, a.version
  from public.appointments as a
  where a.request_key = p_request_key
    and a.created_by = actor_id;
  if found then return; end if;

  perform public.appointment_validate_schedule(
    p_resident_id, p_appointment_type, p_service_type, p_scheduled_date,
    p_start_time, p_end_time, p_assigned_staff_id, p_reason, null
  );

  return query
  insert into public.appointments (
    resident_id, assigned_staff_id, appointment_type, service_type,
    scheduled_date, start_time, end_time, priority, status, reason,
    operational_notes, request_key, created_by, updated_by
  ) values (
    p_resident_id, p_assigned_staff_id, p_appointment_type, p_service_type,
    p_scheduled_date, p_start_time, p_end_time,
    coalesce(p_priority, 'normal'::public.appointment_priority),
    'pending'::public.appointment_status, nullif(btrim(p_reason), ''),
    nullif(btrim(p_operational_notes), ''), p_request_key, actor_id, actor_id
  )
  returning appointments.id, appointments.appointment_number, appointments.version;
end;
$$;

create or replace function public.appointment_update_schedule(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_appointment_type public.appointment_type,
  p_service_type text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_priority public.appointment_priority,
  p_assigned_staff_id uuid,
  p_reason text,
  p_operational_notes text
)
returns table (id uuid, appointment_number text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.appointments%rowtype;
begin
  if actor_role is null or actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role
  ) then
    raise exception 'appointment editing requires an administrator or BHW'
      using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000
    or char_length(coalesce(p_operational_notes, '')) > 2000 then
    raise exception 'appointment text exceeds the allowed length' using errcode = '22001';
  end if;

  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  if current_record.archived_at is not null then
    raise exception 'archived appointments cannot be edited' using errcode = '23514';
  end if;
  if current_record.status not in (
    'pending'::public.appointment_status,
    'confirmed'::public.appointment_status
  ) then
    raise exception 'only pending or confirmed appointments can be edited'
      using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user' using errcode = '40001';
  end if;

  perform public.appointment_validate_schedule(
    current_record.resident_id, p_appointment_type, p_service_type,
    p_scheduled_date, p_start_time, p_end_time, p_assigned_staff_id,
    p_reason, current_record.id
  );

  return query
  update public.appointments as a
  set appointment_type = p_appointment_type,
      service_type = p_service_type,
      scheduled_date = p_scheduled_date,
      start_time = p_start_time,
      end_time = p_end_time,
      priority = coalesce(p_priority, 'normal'::public.appointment_priority),
      assigned_staff_id = p_assigned_staff_id,
      reason = nullif(btrim(p_reason), ''),
      operational_notes = nullif(btrim(p_operational_notes), ''),
      updated_by = actor_id
  where a.id = current_record.id
  returning a.id, a.appointment_number, a.version;
end;
$$;

create or replace function public.appointment_transition(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_target_status public.appointment_status,
  p_cancellation_reason text default null,
  p_operational_notes text default null
)
returns table (id uuid, appointment_number text, status public.appointment_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.appointments%rowtype;
  transition_allowed boolean := false;
  actor_allowed boolean := false;
begin
  if actor_role is null or actor_role = 'resident'::public.app_role then
    raise exception 'appointment status changes require authorized staff'
      using errcode = '42501';
  end if;

  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  if current_record.archived_at is not null then
    raise exception 'archived appointments cannot change status' using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user' using errcode = '40001';
  end if;
  if p_target_status = 'rescheduled'::public.appointment_status then
    raise exception 'use the atomic reschedule workflow' using errcode = '23514';
  end if;

  transition_allowed := (current_record.status, p_target_status) in (
    ('pending'::public.appointment_status, 'confirmed'::public.appointment_status),
    ('pending'::public.appointment_status, 'cancelled'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'checked_in'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'cancelled'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'no_show'::public.appointment_status),
    ('checked_in'::public.appointment_status, 'in_progress'::public.appointment_status),
    ('checked_in'::public.appointment_status, 'cancelled'::public.appointment_status),
    ('in_progress'::public.appointment_status, 'completed'::public.appointment_status),
    ('in_progress'::public.appointment_status, 'cancelled'::public.appointment_status)
  );
  if not transition_allowed then
    raise exception 'invalid appointment status transition from % to %',
      current_record.status, p_target_status using errcode = '23514';
  end if;

  if actor_role = 'admin'::public.app_role then
    actor_allowed := true;
  elsif actor_role = 'barangay_health_worker'::public.app_role then
    actor_allowed := p_target_status in (
      'confirmed'::public.appointment_status,
      'checked_in'::public.appointment_status,
      'cancelled'::public.appointment_status
    ) and current_record.status <> 'in_progress'::public.appointment_status;
  elsif actor_role in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    actor_allowed := current_record.assigned_staff_id = actor_id
      and p_target_status in (
        'checked_in'::public.appointment_status,
        'in_progress'::public.appointment_status,
        'completed'::public.appointment_status,
        'no_show'::public.appointment_status
      )
      and (
        actor_role <> 'midwife'::public.app_role
        or current_record.service_type in ('Maternal Care', 'Child Health')
      );
  end if;
  if not actor_allowed then
    raise exception 'you are not authorized for this appointment transition'
      using errcode = '42501';
  end if;

  if p_target_status = 'cancelled'::public.appointment_status
    and nullif(btrim(p_cancellation_reason), '') is null then
    raise exception 'a cancellation reason is required' using errcode = '23514';
  end if;
  if char_length(coalesce(p_cancellation_reason, '')) > 1000
    or char_length(coalesce(p_operational_notes, '')) > 2000 then
    raise exception 'appointment text exceeds the allowed length' using errcode = '22001';
  end if;

  return query
  update public.appointments as a
  set status = p_target_status,
      checked_in_at = case
        when p_target_status = 'checked_in'::public.appointment_status
          then coalesce(a.checked_in_at, pg_catalog.now())
        else a.checked_in_at
      end,
      started_at = case
        when p_target_status = 'in_progress'::public.appointment_status
          then coalesce(a.started_at, pg_catalog.now())
        else a.started_at
      end,
      completed_at = case
        when p_target_status = 'completed'::public.appointment_status
          then coalesce(a.completed_at, pg_catalog.now())
        else a.completed_at
      end,
      cancelled_at = case
        when p_target_status = 'cancelled'::public.appointment_status
          then coalesce(a.cancelled_at, pg_catalog.now())
        else null
      end,
      cancellation_reason = case
        when p_target_status = 'cancelled'::public.appointment_status
          then nullif(btrim(p_cancellation_reason), '')
        else null
      end,
      operational_notes = case
        when p_operational_notes is not null
          then nullif(btrim(p_operational_notes), '')
        else a.operational_notes
      end,
      updated_by = actor_id
  where a.id = current_record.id
  returning a.id, a.appointment_number, a.status, a.version;
end;
$$;

create or replace function public.appointment_update_operational_notes(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_operational_notes text
)
returns table (id uuid, appointment_number text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.appointments%rowtype;
begin
  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user' using errcode = '40001';
  end if;
  if current_record.archived_at is not null
    or current_record.status in ('cancelled', 'rescheduled') then
    raise exception 'operational notes cannot be changed for this appointment'
      using errcode = '23514';
  end if;
  if actor_role is null or not (
    actor_role = 'admin'::public.app_role
    or actor_role = 'barangay_health_worker'::public.app_role
    or (
      actor_role in ('nurse'::public.app_role, 'midwife'::public.app_role)
      and current_record.assigned_staff_id = actor_id
      and (
        actor_role <> 'midwife'::public.app_role
        or current_record.service_type in ('Maternal Care', 'Child Health')
      )
    )
  ) then
    raise exception 'you are not authorized to update operational notes'
      using errcode = '42501';
  end if;
  if char_length(coalesce(p_operational_notes, '')) > 2000 then
    raise exception 'operational notes exceed the allowed length' using errcode = '22001';
  end if;

  return query
  update public.appointments as a
  set operational_notes = nullif(btrim(p_operational_notes), ''),
      updated_by = actor_id
  where a.id = current_record.id
  returning a.id, a.appointment_number, a.version;
end;
$$;

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
    raise exception 'a reschedule request key is required' using errcode = '23502';
  end if;

  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;

  select * into replacement_record
  from public.appointments as a
  where a.rescheduled_from_id = current_record.id
     or (a.request_key = p_request_key and a.created_by = actor_id)
  order by (a.rescheduled_from_id = current_record.id) desc
  limit 1;
  if found and current_record.status = 'rescheduled'::public.appointment_status then
    return query select current_record.id, current_record.version,
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
    raise exception 'appointment was changed by another user' using errcode = '40001';
  end if;

  replacement_type := case
    when current_record.appointment_type = 'walk_in'::public.appointment_type
      then 'scheduled'::public.appointment_type
    else current_record.appointment_type
  end;

  perform public.appointment_validate_schedule(
    current_record.resident_id, replacement_type, current_record.service_type,
    p_scheduled_date, p_start_time, p_end_time, p_assigned_staff_id,
    current_record.reason, null
  );

  insert into public.appointments (
    resident_id, assigned_staff_id, appointment_type, service_type,
    scheduled_date, start_time, end_time, priority, status, reason,
    operational_notes, rescheduled_from_id, request_key, created_by, updated_by
  ) values (
    current_record.resident_id, p_assigned_staff_id, replacement_type,
    current_record.service_type, p_scheduled_date, p_start_time, p_end_time,
    current_record.priority, 'pending'::public.appointment_status,
    current_record.reason, current_record.operational_notes, current_record.id,
    p_request_key, actor_id, actor_id
  ) returning * into replacement_record;

  update public.appointments as a
  set status = 'rescheduled'::public.appointment_status,
      updated_by = actor_id
  where a.id = current_record.id
  returning * into current_record;

  return query select current_record.id, current_record.version,
    replacement_record.id, replacement_record.appointment_number,
    replacement_record.version;
end;
$$;

create or replace function public.appointment_set_archive_state(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_archived boolean
)
returns table (id uuid, appointment_number text, version bigint, archived_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_record public.appointments%rowtype;
begin
  if public.current_profile_role() <> 'admin'::public.app_role then
    raise exception 'appointment archive changes require an administrator'
      using errcode = '42501';
  end if;
  select * into current_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user' using errcode = '40001';
  end if;
  if p_archived and current_record.status not in (
    'completed', 'cancelled', 'no_show', 'rescheduled'
  ) then
    raise exception 'only terminal appointments can be archived' using errcode = '23514';
  end if;

  return query
  update public.appointments as a
  set archived_at = case when p_archived then pg_catalog.now() else null end,
      updated_by = actor_id
  where a.id = current_record.id
  returning a.id, a.appointment_number, a.version, a.archived_at;
end;
$$;

-- Server-paginated, RLS-preserving read APIs. They intentionally exclude
-- reasons and notes from list, calendar, queue, and search responses.
create or replace function public.appointment_list(
  p_search text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_status public.appointment_status default null,
  p_appointment_type public.appointment_type default null,
  p_service_type text default null,
  p_priority public.appointment_priority default null,
  p_assigned_staff_id uuid default null,
  p_include_archived boolean default false,
  p_sort text default 'scheduled_at',
  p_direction text default 'asc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, appointment_number text, resident_id uuid, resident_number text,
  resident_name text, assigned_staff_id uuid, staff_name text, staff_role public.app_role,
  appointment_type public.appointment_type, service_type text, scheduled_date date,
  start_time time, end_time time, priority public.appointment_priority,
  status public.appointment_status, version bigint, archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid appointment pagination';
  end if;
  if p_sort not in ('scheduled_at', 'appointment_number', 'priority', 'created_at')
    or p_direction not in ('asc', 'desc') then
    raise exception 'invalid appointment sorting';
  end if;
  if p_date_from is not null and p_date_to is not null
    and (p_date_to < p_date_from or p_date_to - p_date_from > 366) then
    raise exception 'invalid appointment date range';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'appointment search is too long';
  end if;
  search_pattern := '%' || normalized_search || '%';

  return query
  select a.id, a.appointment_number, a.resident_id, r.resident_number,
    concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    a.assigned_staff_id,
    nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), ''),
    p.role, a.appointment_type, a.service_type, a.scheduled_date,
    a.start_time, a.end_time, a.priority, a.status, a.version, a.archived_at,
    count(*) over ()
  from public.appointments as a
  join public.residents as r on r.id = a.resident_id
  left join public.profiles as p on p.id = a.assigned_staff_id
  where (p_include_archived or a.archived_at is null)
    and (p_date_from is null or a.scheduled_date >= p_date_from)
    and (p_date_to is null or a.scheduled_date <= p_date_to)
    and (p_status is null or a.status = p_status)
    and (p_appointment_type is null or a.appointment_type = p_appointment_type)
    and (p_service_type is null or a.service_type = p_service_type)
    and (p_priority is null or a.priority = p_priority)
    and (p_assigned_staff_id is null or a.assigned_staff_id = p_assigned_staff_id)
    and (
      normalized_search is null
      or a.appointment_number ilike search_pattern
      or r.resident_number ilike search_pattern
      or concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)
        ilike search_pattern
    )
  order by
    case when p_sort = 'scheduled_at' and p_direction = 'asc' then a.scheduled_date end asc,
    case when p_sort = 'scheduled_at' and p_direction = 'asc' then a.start_time end asc,
    case when p_sort = 'scheduled_at' and p_direction = 'desc' then a.scheduled_date end desc,
    case when p_sort = 'scheduled_at' and p_direction = 'desc' then a.start_time end desc,
    case when p_sort = 'appointment_number' and p_direction = 'asc' then a.appointment_number end asc,
    case when p_sort = 'appointment_number' and p_direction = 'desc' then a.appointment_number end desc,
    case when p_sort = 'priority' and p_direction = 'asc' then
      case a.priority when 'urgent' then 1 when 'priority' then 2 else 3 end end asc,
    case when p_sort = 'priority' and p_direction = 'desc' then
      case a.priority when 'urgent' then 1 when 'priority' then 2 else 3 end end desc,
    case when p_sort = 'created_at' and p_direction = 'asc' then a.created_at end asc,
    case when p_sort = 'created_at' and p_direction = 'desc' then a.created_at end desc,
    a.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.appointment_daily_queue(
  p_date date,
  p_status public.appointment_status default null,
  p_priority public.appointment_priority default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  queue_position bigint, id uuid, appointment_number text, resident_id uuid,
  resident_number text, resident_name text, appointment_type public.appointment_type,
  service_type text, scheduled_date date, start_time time, priority public.appointment_priority,
  status public.appointment_status, assigned_staff_id uuid, staff_name text,
  checked_in_at timestamptz, version bigint, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_date is null or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid queue request';
  end if;

  return query
  with visible_queue as (
    select a.*, r.resident_number,
      concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix) as resident_name,
      nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), '') as staff_name,
      case when a.status = 'checked_in'::public.appointment_status then 0 else 1 end as status_group,
      case a.priority when 'urgent' then 0 when 'priority' then 1 else 2 end as priority_group
    from public.appointments as a
    join public.residents as r on r.id = a.resident_id
    left join public.profiles as p on p.id = a.assigned_staff_id
    where a.scheduled_date = p_date
      and a.archived_at is null
      and a.status <> 'rescheduled'::public.appointment_status
      and (p_status is null or a.status = p_status)
      and (p_priority is null or a.priority = p_priority)
  ), ordered_queue as (
    select q.*,
      row_number() over (
        order by q.status_group, q.priority_group,
          q.checked_in_at nulls last, q.start_time, q.created_at, q.id
      ) as position,
      count(*) over () as queue_total
    from visible_queue as q
  )
  select q.position, q.id, q.appointment_number, q.resident_id,
    q.resident_number, q.resident_name, q.appointment_type, q.service_type,
    q.scheduled_date, q.start_time, q.priority, q.status,
    q.assigned_staff_id, q.staff_name, q.checked_in_at, q.version, q.queue_total
  from ordered_queue as q
  order by q.position
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.appointment_calendar(
  p_date_from date,
  p_date_to date
)
returns table (
  id uuid, appointment_number text, scheduled_date date, start_time time,
  end_time time, service_type text, status public.appointment_status,
  priority public.appointment_priority, assigned_staff_id uuid, staff_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from
    or p_date_to - p_date_from > 42 then
    raise exception 'calendar range must be between one and forty-three days';
  end if;
  return query
  select a.id, a.appointment_number, a.scheduled_date, a.start_time, a.end_time,
    a.service_type, a.status, a.priority, a.assigned_staff_id,
    nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), '')
  from public.appointments as a
  left join public.profiles as p on p.id = a.assigned_staff_id
  where a.scheduled_date between p_date_from and p_date_to
    and a.archived_at is null
  order by a.scheduled_date, a.start_time, a.id;
end;
$$;

create or replace function public.appointment_search_residents(
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, resident_number text, first_name text, middle_name text,
  last_name text, suffix text, age_years integer, purok_name text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_limit not between 1 and 25 or p_offset < 0 then
    raise exception 'invalid resident search pagination';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'resident search is too long';
  end if;
  search_pattern := '%' || normalized_search || '%';
  return query
  select r.id, r.resident_number, r.first_name, r.middle_name, r.last_name,
    r.suffix,
    extract(year from age((pg_catalog.now() at time zone 'Asia/Manila')::date, r.date_of_birth))::integer,
    p.name, count(*) over ()
  from public.residents as r
  join public.puroks as p on p.id = r.purok_id
  where r.status = 'active'::public.resident_status
    and r.archived_at is null
    and (
      normalized_search is null
      or r.resident_number ilike search_pattern
      or concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)
        ilike search_pattern
    )
  order by lower(r.last_name), lower(r.first_name), r.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.appointment_search_staff(
  p_search text default null,
  p_service_type text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, first_name text, middle_name text, last_name text, suffix text,
  role public.app_role, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_limit not between 1 and 25 or p_offset < 0 then
    raise exception 'invalid staff search pagination';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'staff search is too long';
  end if;
  if p_service_type is not null and not public.appointment_service_type_valid(p_service_type) then
    raise exception 'invalid appointment service type';
  end if;
  search_pattern := '%' || normalized_search || '%';
  return query
  select p.id, p.first_name, p.middle_name, p.last_name, p.suffix, p.role,
    count(*) over ()
  from public.profiles as p
  where p.account_status = 'active'::public.account_status
    and p.role in ('barangay_health_worker', 'nurse', 'midwife')
    and (
      p.role <> 'midwife'::public.app_role
      or p_service_type in ('Maternal Care', 'Child Health')
    )
    and (
      normalized_search is null
      or concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)
        ilike search_pattern
    )
  order by lower(coalesce(p.last_name, '')), lower(coalesce(p.first_name, '')), p.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.appointment_resident_history(
  p_resident_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, appointment_number text, scheduled_date date, start_time time,
  service_type text, status public.appointment_status, assigned_staff_id uuid,
  staff_name text, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_resident_id is null or p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid appointment history request';
  end if;
  return query
  select a.id, a.appointment_number, a.scheduled_date, a.start_time,
    a.service_type, a.status, a.assigned_staff_id,
    nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), ''),
    count(*) over ()
  from public.appointments as a
  left join public.profiles as p on p.id = a.assigned_staff_id
  where a.resident_id = p_resident_id
  order by a.scheduled_date desc, a.start_time desc, a.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.appointment_dashboard_summary()
returns table (
  appointments_today bigint,
  pending_appointments bigint,
  checked_in_today bigint,
  completed_today bigint,
  upcoming_appointments bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with context as (
    select (pg_catalog.now() at time zone 'Asia/Manila')::date as today
  )
  select
    count(*) filter (where a.scheduled_date = c.today and a.archived_at is null),
    count(*) filter (where a.status = 'pending' and a.archived_at is null),
    count(*) filter (where a.scheduled_date = c.today and a.status = 'checked_in' and a.archived_at is null),
    count(*) filter (where a.scheduled_date = c.today and a.status = 'completed' and a.archived_at is null),
    count(*) filter (
      where a.scheduled_date > c.today
        and a.status in ('pending', 'confirmed')
        and a.archived_at is null
    )
  from public.appointments as a
  cross join context as c
$$;

-- Replace the generic appointment audit with semantic, data-minimized events.
drop trigger if exists appointments_audit_changes on public.appointments;

create or replace function public.appointment_changed_fields(old_row jsonb, new_row jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
  from unnest(array[
    'assigned_staff_id', 'appointment_type', 'service_type', 'scheduled_date',
    'start_time', 'end_time', 'priority', 'status', 'reason',
    'operational_notes', 'cancellation_reason', 'rescheduled_from_id',
    'checked_in_at', 'started_at', 'completed_at', 'cancelled_at', 'archived_at'
  ]) as field
  where old_row -> field is distinct from new_row -> field
$$;

revoke all on function public.appointment_changed_fields(jsonb, jsonb)
  from public, anon, authenticated;

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
begin
  select p.id into actor_uuid
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  if tg_op = 'UPDATE' then
    audit_action := case
      when old.archived_at is null and new.archived_at is not null then 'appointment.archived'
      when old.archived_at is not null and new.archived_at is null then 'appointment.restored'
      when old.status <> new.status and new.status = 'confirmed' then 'appointment.confirmed'
      when old.status <> new.status and new.status = 'checked_in' then 'appointment.checked_in'
      when old.status <> new.status and new.status = 'in_progress' then 'appointment.started'
      when old.status <> new.status and new.status = 'completed' then 'appointment.completed'
      when old.status <> new.status and new.status = 'cancelled' then 'appointment.cancelled'
      when old.status <> new.status and new.status = 'no_show' then 'appointment.no_show'
      when old.status <> new.status and new.status = 'rescheduled' then 'appointment.rescheduled'
      when old.assigned_staff_id is distinct from new.assigned_staff_id then 'appointment.staff_assigned'
      when old.priority is distinct from new.priority then 'appointment.priority_changed'
      else 'appointment.updated'
    end;
    audit_summary := initcap(replace(audit_action, 'appointment.', '')) || ' appointment';
  end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, summary,
    old_values, new_values, request_metadata
  ) values (
    actor_uuid, audit_action, 'appointments', new.id, audit_summary,
    public.audit_safe_snapshot('appointments', old_row),
    public.audit_safe_snapshot('appointments', new_row),
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'changed_fields', public.appointment_changed_fields(old_row, new_row)
    ) else null end
  );
  return new;
end;
$$;

revoke all on function public.audit_appointment_change()
  from public, anon, authenticated;

create trigger appointments_audit_changes
  after insert or update on public.appointments
  for each row execute function public.audit_appointment_change();

revoke all on function public.appointment_create(uuid, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text, uuid) from public, anon;
revoke all on function public.appointment_update_schedule(uuid, bigint, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text) from public, anon;
revoke all on function public.appointment_transition(uuid, bigint, public.appointment_status, text, text) from public, anon;
revoke all on function public.appointment_update_operational_notes(uuid, bigint, text) from public, anon;
revoke all on function public.appointment_reschedule(uuid, bigint, date, time, time, uuid, uuid) from public, anon;
revoke all on function public.appointment_set_archive_state(uuid, bigint, boolean) from public, anon;
revoke all on function public.appointment_list(text, date, date, public.appointment_status, public.appointment_type, text, public.appointment_priority, uuid, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.appointment_daily_queue(date, public.appointment_status, public.appointment_priority, integer, integer) from public, anon;
revoke all on function public.appointment_calendar(date, date) from public, anon;
revoke all on function public.appointment_search_residents(text, integer, integer) from public, anon;
revoke all on function public.appointment_search_staff(text, text, integer, integer) from public, anon;
revoke all on function public.appointment_resident_history(uuid, integer, integer) from public, anon;
revoke all on function public.appointment_dashboard_summary() from public, anon;

grant execute on function public.appointment_create(uuid, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.appointment_update_schedule(uuid, bigint, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text) to authenticated, service_role;
grant execute on function public.appointment_transition(uuid, bigint, public.appointment_status, text, text) to authenticated, service_role;
grant execute on function public.appointment_update_operational_notes(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.appointment_reschedule(uuid, bigint, date, time, time, uuid, uuid) to authenticated, service_role;
grant execute on function public.appointment_set_archive_state(uuid, bigint, boolean) to authenticated, service_role;
grant execute on function public.appointment_list(text, date, date, public.appointment_status, public.appointment_type, text, public.appointment_priority, uuid, boolean, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_daily_queue(date, public.appointment_status, public.appointment_priority, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_calendar(date, date) to authenticated, service_role;
grant execute on function public.appointment_search_residents(text, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_search_staff(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_resident_history(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_dashboard_summary() to authenticated, service_role;

commit;
