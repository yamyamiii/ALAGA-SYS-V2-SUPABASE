-- Phase 5.5: resident-owned online appointment requests.
-- Requested schedules are preferences until authorized staff assign and
-- confirm them. Notification events are an internal delivery-neutral outbox.

begin;

create type public.appointment_request_source as enum (
  'staff',
  'resident'
);

create type public.appointment_request_event_type as enum (
  'request_received',
  'request_confirmed',
  'request_cancelled',
  'request_rejected',
  'schedule_changed'
);

alter table public.appointments
  add column request_source public.appointment_request_source
    not null default 'staff',
  add column requested_date date,
  add column requested_start_time time,
  add column requested_end_time time,
  add column resident_requested_at timestamptz,
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
      and appointment_type = 'scheduled'
      and priority = 'normal'
      and requested_date is not null
      and requested_start_time is not null
      and requested_end_time is not null
      and requested_end_time > requested_start_time
      and resident_requested_at is not null
    )
  );

create index appointments_resident_requests_review_idx
  on public.appointments (status, resident_requested_at, id)
  where request_source = 'resident'
    and archived_at is null;

create or replace function public.require_resident_request_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_source = 'resident'::public.appointment_request_source
    and old.status = 'pending'::public.appointment_status
    and new.status = 'confirmed'::public.appointment_status
    and new.assigned_staff_id is null then
    raise exception 'resident requests require assigned staff before confirmation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.require_resident_request_assignment()
  from public, anon, authenticated;

create trigger appointments_require_resident_request_assignment
  before update on public.appointments
  for each row execute function public.require_resident_request_assignment();

create table public.appointment_request_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null
    references public.appointments (id) on delete restrict,
  resident_id uuid not null
    references public.residents (id) on delete restrict,
  actor_profile_id uuid
    references public.profiles (id) on delete set null,
  event_type public.appointment_request_event_type not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint appointment_request_events_payload_object check (
    jsonb_typeof(payload) = 'object'
  )
);

create index appointment_request_events_appointment_idx
  on public.appointment_request_events (appointment_id, occurred_at, id);

alter table public.appointment_request_events enable row level security;

revoke all on table public.appointment_request_events
  from public, anon, authenticated;
grant select on table public.appointment_request_events to service_role;

create or replace function public.resident_appointment_request(
  p_service_type text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
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
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'appointment requests require an active resident account'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an appointment request key is required'
      using errcode = '23502';
  end if;
  if nullif(btrim(p_reason), '') is null
    or char_length(btrim(p_reason)) > 1000 then
    raise exception 'a valid reason for visit is required'
      using errcode = '23514';
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
      or existing_record.end_time is distinct from p_end_time
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
      and a.end_time = p_end_time
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
    p_end_time,
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
    p_end_time,
    'normal'::public.appointment_priority,
    'pending'::public.appointment_status,
    nullif(btrim(p_reason), ''),
    null,
    p_request_key,
    'resident'::public.appointment_request_source,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    pg_catalog.now(),
    actor_id,
    actor_id
  )
  returning appointments.id, appointments.appointment_number,
    appointments.status, appointments.version;
end;
$$;

create or replace function public.resident_appointment_cancel(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_cancellation_reason text
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
  appointment_record public.appointments%rowtype;
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'resident cancellation requires an active resident account'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_cancellation_reason), '') is null
    or char_length(btrim(p_cancellation_reason)) > 1000 then
    raise exception 'a valid cancellation reason is required'
      using errcode = '23514';
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

  select * into appointment_record
  from public.appointments as a
  where a.id = p_appointment_id
  for update;

  if not found
    or appointment_record.resident_id is distinct from resident_record.id then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  if appointment_record.request_source is distinct from
      'resident'::public.appointment_request_source
    or appointment_record.status is distinct from
      'pending'::public.appointment_status
    or appointment_record.archived_at is not null then
    raise exception 'only an own pending resident request can be cancelled'
      using errcode = '23514';
  end if;
  if appointment_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user'
      using errcode = '40001';
  end if;

  return query
  update public.appointments as a
  set status = 'cancelled'::public.appointment_status,
      cancellation_reason = btrim(p_cancellation_reason),
      cancelled_at = pg_catalog.now(),
      updated_by = actor_id
  where a.id = appointment_record.id
  returning a.id, a.appointment_number, a.status, a.version;
end;
$$;

create or replace function public.resident_appointment_detail(
  p_appointment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  resident_record public.residents%rowtype;
  result jsonb;
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'resident appointment details require a resident account'
      using errcode = '42501';
  end if;

  select * into resident_record
  from public.residents as r
  where r.linked_profile_id = actor_id
  limit 1;

  if not found
    or resident_record.status <> 'active'::public.resident_status
    or resident_record.archived_at is not null then
    raise exception 'linked resident record must be active'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'appointment_number', a.appointment_number,
    'appointment_type', a.appointment_type,
    'service_type', a.service_type,
    'scheduled_date', a.scheduled_date,
    'start_time', a.start_time,
    'end_time', a.end_time,
    'status', a.status,
    'reason', a.reason,
    'cancellation_reason', a.cancellation_reason,
    'request_source', a.request_source,
    'requested_date', a.requested_date,
    'requested_start_time', a.requested_start_time,
    'requested_end_time', a.requested_end_time,
    'resident_requested_at', a.resident_requested_at,
    'assigned_staff_id', a.assigned_staff_id,
    'staff', case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'middle_name', p.middle_name,
      'last_name', p.last_name,
      'suffix', p.suffix,
      'role', p.role
    ) end,
    'rescheduled_from_id', a.rescheduled_from_id,
    'rescheduled_from', case when original.id is null then null
      else jsonb_build_object(
        'id', original.id,
        'appointment_number', original.appointment_number
      )
    end,
    'cancelled_at', a.cancelled_at,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'archived_at', a.archived_at,
    'version', a.version
  )
  into result
  from public.appointments as a
  left join public.profiles as p on p.id = a.assigned_staff_id
  left join public.appointments as original
    on original.id = a.rescheduled_from_id
    and original.resident_id = a.resident_id
  where a.id = p_appointment_id
    and a.resident_id = resident_record.id
    and a.archived_at is null;

  if result is null then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.appointment_resident_request_list(
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  id uuid,
  appointment_number text,
  resident_id uuid,
  resident_number text,
  resident_name text,
  service_type text,
  scheduled_date date,
  start_time time,
  end_time time,
  status public.appointment_status,
  assigned_staff_id uuid,
  version bigint,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if public.current_profile_role() not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role
  ) then
    raise exception 'resident appointment review requires an administrator or BHW'
      using errcode = '42501';
  end if;
  if p_limit not between 1 and 25 or p_offset < 0 then
    raise exception 'invalid resident request pagination';
  end if;

  return query
  select a.id, a.appointment_number, a.resident_id, r.resident_number,
    concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    a.service_type::text, a.scheduled_date, a.start_time, a.end_time,
    a.status, a.assigned_staff_id, a.version, count(*) over ()
  from public.appointments as a
  join public.residents as r on r.id = a.resident_id
  where a.request_source = 'resident'
    and a.status = 'pending'
    and a.archived_at is null
  order by a.resident_requested_at, a.id
  limit p_limit offset p_offset;
end;
$$;

-- Preserve the resident's original requested schedule when staff use the
-- existing atomic reschedule workflow.
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

-- Residents have an appointments page, not an operational daily queue.
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
  if public.current_profile_role() = 'resident'::public.app_role then
    raise exception 'residents cannot access the daily appointment queue'
      using errcode = '42501';
  end if;
  if p_date is null or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid queue request';
  end if;

  return query
  with visible_queue as (
    select a.*, r.resident_number,
      concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)
        as resident_name,
      nullif(
        concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix),
        ''
      ) as staff_name,
      case when a.status = 'checked_in'::public.appointment_status
        then 0 else 1 end as status_group,
      case a.priority when 'urgent' then 0
        when 'priority' then 1 else 2 end as priority_group
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
    q.resident_number, q.resident_name, q.appointment_type,
    q.service_type::text, q.scheduled_date, q.start_time, q.priority, q.status,
    q.assigned_staff_id, q.staff_name, q.checked_in_at, q.version, q.queue_total
  from ordered_queue as q
  order by q.position
  limit p_limit offset p_offset;
end;
$$;

-- Request-specific semantic audit events also populate a delivery-neutral
-- internal event boundary. Neither destination stores visit reasons.
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
begin
  select p.id into actor_uuid
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  if tg_op = 'INSERT'
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

revoke all on function public.resident_appointment_request(
  text, date, time, time, text, uuid
) from public, anon;
revoke all on function public.resident_appointment_cancel(
  uuid, bigint, text
) from public, anon;
revoke all on function public.resident_appointment_detail(uuid)
  from public, anon;
revoke all on function public.appointment_resident_request_list(
  integer, integer
) from public, anon;
revoke all on function public.audit_appointment_change()
  from public, anon, authenticated;

grant execute on function public.resident_appointment_request(
  text, date, time, time, text, uuid
) to authenticated;
grant execute on function public.resident_appointment_cancel(
  uuid, bigint, text
) to authenticated;
grant execute on function public.resident_appointment_detail(uuid)
  to authenticated;
grant execute on function public.appointment_resident_request_list(
  integer, integer
) to authenticated;

revoke all on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) from public, anon;
revoke all on function public.appointment_daily_queue(
  date, public.appointment_status, public.appointment_priority, integer, integer
) from public, anon;
grant execute on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) to authenticated, service_role;
grant execute on function public.appointment_daily_queue(
  date, public.appointment_status, public.appointment_priority, integer, integer
) to authenticated, service_role;

commit;
