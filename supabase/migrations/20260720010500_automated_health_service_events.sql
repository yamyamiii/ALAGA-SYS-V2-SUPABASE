-- Queue/capacity campaigns are distinct from one-to-one appointments.
-- No clinical content is stored here. All writes are trusted RPCs; ordinary
-- appointment overlaps are preserved and participating event windows reserved.
begin;

create sequence public.health_event_reference_seq as bigint;
create sequence public.health_event_booking_reference_seq as bigint;

create table public.health_service_events (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('HEV-' ||
    to_char(statement_timestamp() at time zone 'Asia/Manila', 'YYYY') || '-' ||
    lpad(nextval('public.health_event_reference_seq')::text, 6, '0')),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  service_type text not null check (public.appointment_service_type_valid(service_type)),
  event_date date not null,
  start_time time not null check (public.appointment_start_time_valid(start_time)),
  end_time time not null check (end_time > start_time),
  booking_status text not null default 'draft'
    check (booking_status in ('draft', 'published', 'closed', 'cancelled')),
  target_capacity integer not null check (target_capacity between 1 and 1000),
  allocation_mode text not null default 'EQUAL' check (allocation_mode = 'EQUAL'),
  booking_opens_at timestamptz not null default statement_timestamp(),
  booking_closes_at timestamptz not null,
  next_order bigint not null default 0,
  operational_exception text check (operational_exception in ('staff_unavailable')),
  request_key uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  cancelled_at timestamptz,
  archived_at timestamptz,
  version bigint not null default 1,
  unique (created_by, request_key),
  check (booking_closes_at > booking_opens_at)
);

create table public.health_event_staff (
  event_id uuid not null references public.health_service_events(id) on delete restrict,
  staff_profile_id uuid not null references public.profiles(id) on delete restrict,
  is_active boolean not null default true,
  allocation_quota integer not null default 0 check (allocation_quota >= 0),
  primary key (event_id, staff_profile_id)
);

create table public.health_event_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EVB-' ||
    to_char(statement_timestamp() at time zone 'Asia/Manila', 'YYYY') || '-' ||
    lpad(nextval('public.health_event_booking_reference_seq')::text, 6, '0')),
  event_id uuid not null references public.health_service_events(id) on delete restrict,
  resident_id uuid not null references public.residents(id) on delete restrict,
  booked_by uuid not null references public.profiles(id) on delete restrict,
  assigned_staff_id uuid references public.profiles(id) on delete restrict,
  booking_state text not null check (
    booking_state in ('confirmed', 'waitlisted', 'checked_in', 'completed', 'cancelled')
  ),
  join_order bigint not null,
  request_key uuid not null,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  checked_in_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (char_length(cancellation_reason) <= 1000),
  unique (booked_by, request_key),
  unique (event_id, join_order),
  check (booking_state <> 'waitlisted' or assigned_staff_id is null),
  check ((booking_state = 'cancelled') = (cancelled_at is not null)),
  check (booking_state not in ('checked_in', 'completed') or checked_in_at is not null),
  check ((booking_state = 'completed') = (completed_at is not null))
);
create unique index health_event_one_active_booking
  on public.health_event_bookings(event_id, resident_id)
  where booking_state <> 'cancelled';
create index health_event_booking_queue
  on public.health_event_bookings(event_id, booking_state, join_order);
create index health_event_booking_staff on public.health_event_bookings(assigned_staff_id, event_id);

create table public.health_event_history (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.health_service_events(id) on delete restrict,
  booking_id uuid references public.health_event_bookings(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action ~ '^health_event\.[a-z_]+$'),
  occurred_at timestamptz not null default statement_timestamp()
);
alter table public.announcements add column health_event_id uuid
  references public.health_service_events(id) on delete restrict;
create unique index announcement_one_health_event on public.announcements(health_event_id)
  where health_event_id is not null;

alter table public.health_service_events enable row level security;
alter table public.health_event_staff enable row level security;
alter table public.health_event_bookings enable row level security;
alter table public.health_event_history enable row level security;
revoke all on public.health_service_events, public.health_event_staff,
  public.health_event_bookings, public.health_event_history from public, anon, authenticated;
revoke all on sequence public.health_event_reference_seq,
  public.health_event_booking_reference_seq from public, anon, authenticated;
-- Even browser SELECTs use minimized read models, never participant subscriptions.

create or replace function public.health_event_require_role(p_manager boolean default false)
returns public.app_role language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.current_profile_role();
begin
  if v_role is null or (p_manager and v_role not in ('admin', 'barangay_health_worker')) then
    raise exception 'health event access denied' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- All reservation-changing writers take the day lock BEFORE an event row lock
-- or ordinary staff-slot lock. Capacity is then serialized by the parent row.
create or replace function public.health_event_lock_day(p_date date)
returns void language sql volatile security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alaga:health-event-day:' || p_date::text, 0))
$$;

create or replace function public.health_event_lock(p_event_id uuid)
returns public.health_service_events language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
  v_event public.health_service_events%rowtype;
begin
  select event.event_date into v_date from public.health_service_events as event where event.id = p_event_id;
  if not found then raise exception 'health event not found' using errcode = 'P0002'; end if;
  perform public.health_event_lock_day(v_date);
  select event.* into v_event from public.health_service_events as event where event.id = p_event_id for update;
  if v_event.event_date is distinct from v_date then
    raise exception 'health event changed by another user' using errcode = '40001';
  end if;
  return v_event;
end;
$$;

create or replace function public.health_event_staff_free(
  p_staff uuid, p_date date, p_start time, p_end time, p_exclude uuid default null
)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.appointments as appointment
    where appointment.assigned_staff_id = p_staff and appointment.scheduled_date = p_date
      and appointment.archived_at is null
      and appointment.status in ('pending', 'confirmed', 'checked_in', 'in_progress')
      and appointment.start_time < p_end and appointment.end_time > p_start
  ) and not exists (
    select 1 from public.health_service_events as event
    join public.health_event_staff as member on member.event_id = event.id
    where member.staff_profile_id = p_staff and member.is_active and member.allocation_quota > 0
      and event.id is distinct from p_exclude and event.archived_at is null
      and event.booking_status in ('published', 'closed') and event.event_date = p_date
      and event.start_time < p_end and event.end_time > p_start
  )
$$;

create or replace function public.health_event_audit(p_event uuid, p_booking uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.health_event_history(event_id, booking_id, actor_profile_id, action)
    values (p_event, p_booking, auth.uid(), p_action);
  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, summary)
    values (auth.uid(), p_action, 'health_service_events', p_event, 'Health service event workflow update');
end;
$$;

create or replace function public.health_event_notify(p_booking uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.health_event_bookings%rowtype;
  v_recipient uuid;
  v_type public.assistance_notification_type;
  v_summary text;
begin
  select booking.* into v_booking from public.health_event_bookings as booking where booking.id = p_booking;
  select resident.linked_profile_id into v_recipient from public.residents as resident where resident.id = v_booking.resident_id;
  v_type := case when p_action = 'cancelled' then 'appointment_cancelled'::public.assistance_notification_type
    else 'appointment_approved'::public.assistance_notification_type end;
  v_summary := case p_action
    when 'confirmed' then 'Your health service event booking is confirmed.'
    when 'waitlisted' then 'You joined the health service event waitlist.'
    when 'promoted' then 'A place became available and your event booking is now confirmed.'
    when 'cancelled' then 'Your health service event booking was cancelled.'
    when 'completed' then 'Your health service event visit is completed.'
    else 'Your health service event schedule or service team was updated.' end;
  perform public.assistance_add_notification(v_recipient, v_type, 'Health service event update',
    v_summary, 'health_events', v_booking.event_id, '/appointments/events',
    'health-event:' || v_booking.id::text || ':' || p_action || ':' || v_booking.version::text || ':' ||
      (select event.version::text from public.health_service_events as event where event.id = v_booking.event_id),
    statement_timestamp());
end;
$$;

create or replace function public.health_event_emit(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
begin
  perform public.emit_realtime_sync_event('appointment', p_event, null, 'admin');
  perform public.emit_realtime_sync_event('appointment', p_event, null, 'barangay_health_worker');
  -- Public event metadata/capacity is safe for all Residents, never row payloads.
  perform public.emit_realtime_sync_event('appointment', p_event, null, 'resident');
  for v_profile in select member.staff_profile_id from public.health_event_staff as member where member.event_id = p_event loop
    perform public.emit_realtime_sync_event('appointment', p_event, v_profile, null);
  end loop;
  for v_profile in select resident.linked_profile_id from public.health_event_bookings as booking
    join public.residents as resident on resident.id = booking.resident_id
    where booking.event_id = p_event and resident.linked_profile_id is not null loop
    perform public.emit_realtime_sync_event('appointment', p_event, v_profile, null);
  end loop;
end;
$$;

create or replace function public.health_event_pick_staff(p_event uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select member.staff_profile_id
  from public.health_event_staff as member
  join public.profiles as staff on staff.id = member.staff_profile_id
  join public.health_service_events as event on event.id = member.event_id
  cross join lateral (
    select count(*)::integer as assigned from public.health_event_bookings as booking
    where booking.event_id = p_event and booking.assigned_staff_id = member.staff_profile_id
      and booking.booking_state in ('confirmed', 'checked_in', 'completed')
  ) as workload
  where member.event_id = p_event and member.is_active and staff.account_status = 'active'
    and staff.retired_at is null and public.appointment_staff_role_eligible(staff.role, event.service_type)
    and workload.assigned < member.allocation_quota
  order by workload.assigned, member.staff_profile_id limit 1
$$;

create or replace function public.health_event_reconcile(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event public.health_service_events%rowtype;
  v_count integer;
  v_booking public.health_event_bookings%rowtype;
  v_staff uuid;
begin
  v_event := public.health_event_lock(p_event);
  if v_event.archived_at is not null or v_event.booking_status = 'cancelled'
    or (v_event.event_date + v_event.end_time) at time zone 'Asia/Manila' <= statement_timestamp() then return; end if;
  -- Stable UUID order determines who receives any remainder.
  select count(*)::integer into v_count from public.health_event_staff as member
    join public.profiles as staff on staff.id = member.staff_profile_id
    where member.event_id = p_event and member.is_active and staff.account_status = 'active'
      and staff.retired_at is null and public.appointment_staff_role_eligible(staff.role, v_event.service_type)
      and public.health_event_staff_free(staff.id, v_event.event_date, v_event.start_time, v_event.end_time, p_event);
  update public.health_event_staff as member set allocation_quota = 0 where member.event_id = p_event;
  if v_count > 0 then
    with eligible as (
      select member.staff_profile_id, row_number() over (order by member.staff_profile_id) as rank
      from public.health_event_staff as member join public.profiles as staff on staff.id = member.staff_profile_id
      where member.event_id = p_event and member.is_active and staff.account_status = 'active'
        and staff.retired_at is null and public.appointment_staff_role_eligible(staff.role, v_event.service_type)
        and public.health_event_staff_free(staff.id, v_event.event_date, v_event.start_time, v_event.end_time, p_event)
    ) update public.health_event_staff as member set allocation_quota =
      v_event.target_capacity / v_count + case when eligible.rank <= v_event.target_capacity % v_count then 1 else 0 end
      from eligible where member.event_id = p_event and member.staff_profile_id = eligible.staff_profile_id;
  end if;
  -- Retain completed historical attribution. Unavailable active assignments
  -- become visibly unassigned, never silently cancelled or assigned ineligibly.
  for v_booking in select booking.* from public.health_event_bookings as booking
    where booking.event_id = p_event and booking.booking_state in ('confirmed', 'checked_in')
      and booking.assigned_staff_id is not null
      and (not exists (select 1 from public.health_event_staff as member
        where member.event_id = p_event and member.staff_profile_id = booking.assigned_staff_id and member.allocation_quota > 0)
        or (select count(*) from public.health_event_bookings as retained
          where retained.event_id = p_event and retained.assigned_staff_id = booking.assigned_staff_id
            and retained.booking_state in ('confirmed', 'checked_in', 'completed')
            and (retained.booking_state = 'completed' or retained.join_order <= booking.join_order)) >
          (select member.allocation_quota from public.health_event_staff as member
            where member.event_id = p_event and member.staff_profile_id = booking.assigned_staff_id))
    order by booking.join_order desc loop
    update public.health_event_bookings as booking set assigned_staff_id = null, version = booking.version + 1,
      updated_at = statement_timestamp() where booking.id = v_booking.id;
    perform public.health_event_audit(p_event, v_booking.id, 'health_event.staff_unavailable');
  end loop;
  for v_booking in select booking.* from public.health_event_bookings as booking
    where booking.event_id = p_event and booking.booking_state in ('confirmed', 'checked_in')
      and booking.assigned_staff_id is null order by booking.join_order loop
    v_staff := public.health_event_pick_staff(p_event);
    if v_staff is null then exit; end if;
    update public.health_event_bookings as booking set assigned_staff_id = v_staff,
      version = booking.version + 1, updated_at = statement_timestamp() where booking.id = v_booking.id;
    perform public.health_event_audit(p_event, v_booking.id, 'health_event.staff_rebalanced');
    perform public.health_event_notify(v_booking.id, 'updated');
  end loop;
  update public.health_service_events as event set operational_exception = case when v_count = 0
    or exists (select 1 from public.health_event_bookings as booking where booking.event_id = p_event
      and booking.booking_state in ('confirmed', 'checked_in') and booking.assigned_staff_id is null)
    then 'staff_unavailable' else null end where event.id = p_event;
end;
$$;

create or replace function public.health_event_promote(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event public.health_service_events%rowtype;
  v_booking public.health_event_bookings%rowtype;
  v_staff uuid;
  v_used integer;
begin
  v_event := public.health_event_lock(p_event);
  if v_event.booking_status <> 'published' or v_event.archived_at is not null
    or statement_timestamp() >= v_event.booking_closes_at then return; end if;
  perform public.health_event_reconcile(p_event);
  for v_booking in select booking.* from public.health_event_bookings as booking
    where booking.event_id = p_event and booking.booking_state = 'waitlisted'
    order by booking.join_order loop
    select count(*)::integer into v_used from public.health_event_bookings as booking
      where booking.event_id = p_event and booking.booking_state in ('confirmed', 'checked_in', 'completed');
    if v_used >= v_event.target_capacity then exit; end if;
    if not exists (select 1 from public.residents as resident join public.profiles as profile on profile.id = resident.linked_profile_id
      where resident.id = v_booking.resident_id and resident.status = 'active' and resident.archived_at is null
        and resident.linked_profile_id = v_booking.booked_by and profile.role = 'resident'
        and profile.account_status = 'active' and profile.retired_at is null) then continue; end if;
    v_staff := public.health_event_pick_staff(p_event);
    if v_staff is null then exit; end if;
    update public.health_event_bookings as booking set booking_state = 'confirmed', assigned_staff_id = v_staff,
      updated_at = statement_timestamp(), version = booking.version + 1 where booking.id = v_booking.id;
    perform public.health_event_audit(p_event, v_booking.id, 'health_event.waitlist_promoted');
    perform public.health_event_notify(v_booking.id, 'promoted');
  end loop;
end;
$$;

create or replace function public.health_event_own_booking(p_event uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', booking.id, 'reference', booking.reference, 'state', booking.booking_state,
    'version', booking.version, 'queue_order', booking.join_order,
    'assigned_staff', case when staff.account_status = 'active' and staff.retired_at is null
      then concat_ws(' ', staff.first_name, staff.last_name) else null end)
  from public.health_event_bookings as booking
  join public.residents as resident on resident.id = booking.resident_id
  left join public.profiles as staff on staff.id = booking.assigned_staff_id
  where booking.event_id = p_event and resident.linked_profile_id = auth.uid()
  order by booking.created_at desc, booking.id desc limit 1
$$;

create or replace function public.health_event_booking_result(p_booking uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', booking.id, 'reference', booking.reference, 'state', booking.booking_state,
    'version', booking.version, 'queue_order', booking.join_order,
    'assigned_staff', case when staff.account_status = 'active' and staff.retired_at is null
      then concat_ws(' ', staff.first_name, staff.last_name) else null end)
  from public.health_event_bookings as booking join public.residents as resident on resident.id = booking.resident_id
  left join public.profiles as staff on staff.id = booking.assigned_staff_id
  where booking.id = p_booking and resident.linked_profile_id = auth.uid()
$$;

create or replace function public.health_event_list(
  p_include_archived boolean default false, p_limit integer default 20, p_offset integer default 0,
  p_event_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset < 0
    or p_include_archived is null then raise exception 'invalid health event pagination' using errcode = '22023'; end if;
  if p_include_archived and v_role not in ('admin', 'barangay_health_worker') then
    raise exception 'health event archive access denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(page.value order by page.event_date, page.id), '[]'::jsonb) into v_result from (
    select event.id, event.event_date, jsonb_build_object(
      'id', event.id, 'reference', event.reference, 'title', event.title, 'service_type', event.service_type,
      'event_date', event.event_date, 'start_time', event.start_time, 'end_time', event.end_time,
      'status', event.booking_status, 'capacity', event.target_capacity, 'version', event.version,
      'archived_at', event.archived_at, 'allocation_mode', event.allocation_mode,
      'booking_opens_at', event.booking_opens_at, 'booking_closes_at', event.booking_closes_at,
      'booking_open', event.booking_status = 'published' and event.archived_at is null
        and statement_timestamp() >= event.booking_opens_at and statement_timestamp() < event.booking_closes_at,
      'booked', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id
        and booking.booking_state in ('confirmed', 'checked_in', 'completed')),
      'remaining', greatest(0, event.target_capacity - (select count(*) from public.health_event_bookings as booking
        where booking.event_id = event.id and booking.booking_state in ('confirmed', 'checked_in', 'completed'))),
      'staff_available', event.operational_exception is null,
      'own_booking', public.health_event_own_booking(event.id),
      'waitlisted', case when v_role <> 'resident' then (select count(*) from public.health_event_bookings as booking
        where booking.event_id = event.id and booking.booking_state = 'waitlisted') else null end,
      'exception', case when v_role in ('admin', 'barangay_health_worker') then event.operational_exception else null end,
      'staff', case when v_role in ('admin', 'barangay_health_worker') then (
        select coalesce(jsonb_agg(jsonb_build_object('id', member.staff_profile_id,
          'name', concat_ws(' ', staff.first_name, staff.last_name), 'quota', member.allocation_quota,
          'assigned', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id
            and booking.assigned_staff_id = member.staff_profile_id and booking.booking_state in ('confirmed', 'checked_in', 'completed')))
          order by member.staff_profile_id), '[]'::jsonb)
        from public.health_event_staff as member join public.profiles as staff on staff.id = member.staff_profile_id
        where member.event_id = event.id and member.is_active) else null end,
      'total_count', count(*) over ()
    ) as value from public.health_service_events as event
    where (p_include_archived or event.archived_at is null)
      and (p_event_id is null or event.id = p_event_id)
      and (v_role in ('admin', 'barangay_health_worker') or event.booking_status <> 'draft')
    order by event.event_date, event.id limit p_limit offset p_offset
  ) as page;
  return jsonb_build_object('items', v_result, 'total', coalesce((v_result->0->>'total_count')::bigint, 0));
end;
$$;

create or replace function public.health_event_save(
  p_id uuid, p_expected_version bigint, p_title text, p_service_type text,
  p_event_date date, p_start_time time, p_end_time time, p_capacity integer,
  p_staff_ids uuid[], p_publish boolean, p_notify boolean, p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role(true);
  v_event public.health_service_events%rowtype;
  v_staff uuid;
  v_old_date date;
  v_used integer;
  v_announcement uuid;
  v_recipient uuid;
  v_before_status text;
begin
  if p_request_key is null or nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) not between 3 and 200
    or not exists (select 1 from public.appointment_service_schedules as schedule
      where schedule.service_type = p_service_type and schedule.is_active and schedule.booking_mode = 'AUTO_SLOT')
    or p_event_date is null or p_event_date < (statement_timestamp() at time zone 'Asia/Manila')::date
    or public.appointment_start_time_valid(p_start_time) is not true or p_end_time is null or p_end_time <= p_start_time or p_end_time > time '16:30'
    or (p_event_date + p_start_time) at time zone 'Asia/Manila' <= statement_timestamp()
    or p_capacity is null or p_capacity not between 1 and 1000 or p_publish is null or p_notify is null
    or coalesce(cardinality(p_staff_ids), 0) not between 1 and 25
    or (select count(distinct staff_id) from unnest(p_staff_ids) as ids(staff_id)) <> cardinality(p_staff_ids)
    then raise exception 'invalid health event values' using errcode = '23514'; end if;
  if p_id is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alaga:event-request:' || auth.uid()::text || ':' || p_request_key::text, 0));
    perform public.health_event_lock_day(p_event_date);
    select event.* into v_event from public.health_service_events as event
      where event.created_by = auth.uid() and event.request_key = p_request_key;
    if found then
      if v_event.title is distinct from btrim(p_title) or v_event.service_type is distinct from p_service_type
        or v_event.event_date is distinct from p_event_date or v_event.start_time is distinct from p_start_time
        or v_event.end_time is distinct from p_end_time or v_event.target_capacity is distinct from p_capacity then
        raise exception 'health event request key was reused with different data' using errcode = '23514'; end if;
      return jsonb_build_object('id', v_event.id, 'version', v_event.version);
    end if;
    insert into public.health_service_events(title, service_type, event_date, start_time, end_time,
      target_capacity, booking_status, booking_closes_at, request_key, created_by, updated_by)
    values (btrim(p_title), p_service_type, p_event_date, p_start_time, p_end_time, p_capacity,
      case when p_publish then 'published' else 'draft' end,
      (p_event_date + p_end_time) at time zone 'Asia/Manila', p_request_key, auth.uid(), auth.uid())
    returning * into v_event;
    v_before_status := 'draft';
    perform public.health_event_audit(v_event.id, null, 'health_event.created');
  else
    select event.event_date into v_old_date from public.health_service_events as event where event.id = p_id;
    perform public.health_event_lock_day(least(v_old_date, p_event_date));
    perform public.health_event_lock_day(greatest(v_old_date, p_event_date));
    select event.* into v_event from public.health_service_events as event where event.id = p_id for update;
    if not found then raise exception 'health event not found' using errcode = 'P0002'; end if;
    if v_event.event_date is distinct from v_old_date then raise exception 'health event changed by another user' using errcode = '40001'; end if;
    if v_event.version is distinct from p_expected_version then raise exception 'health event changed by another user' using errcode = '40001'; end if;
    if v_event.booking_status in ('cancelled', 'closed') or v_event.archived_at is not null then
      raise exception 'health event is not editable' using errcode = '23514'; end if;
    select count(*)::integer into v_used from public.health_event_bookings as booking where booking.event_id = p_id
      and booking.booking_state in ('confirmed', 'checked_in', 'completed');
    if p_capacity < v_used or (p_service_type <> v_event.service_type and exists (
      select 1 from public.health_event_bookings as booking where booking.event_id = p_id)) then
      raise exception 'health event capacity or service conflicts with retained bookings' using errcode = '23514'; end if;
    if (p_event_date is distinct from v_event.event_date or p_start_time is distinct from v_event.start_time
      or p_end_time is distinct from v_event.end_time) and exists (select 1 from public.health_event_bookings as booking
        where booking.event_id = p_id and booking.booking_state in ('checked_in', 'completed')) then
      raise exception 'attended event schedule must remain historical' using errcode = '23514'; end if;
    v_before_status := v_event.booking_status;
    update public.health_service_events as event set title = btrim(p_title), service_type = p_service_type,
      event_date = p_event_date, start_time = p_start_time, end_time = p_end_time, target_capacity = p_capacity,
      booking_status = case when p_publish then 'published' else event.booking_status end,
      booking_closes_at = (p_event_date + p_end_time) at time zone 'Asia/Manila',
      version = event.version + 1, updated_at = statement_timestamp(), updated_by = auth.uid()
      where event.id = p_id returning event.* into v_event;
  end if;
  foreach v_staff in array p_staff_ids loop
    if not exists (select 1 from public.profiles as staff where staff.id = v_staff and staff.account_status = 'active'
      and staff.retired_at is null and public.appointment_staff_role_eligible(staff.role, p_service_type)) then
      raise exception 'health event staff must be active and eligible' using errcode = '23514'; end if;
    if v_event.booking_status = 'published' and not public.health_event_staff_free(v_staff, p_event_date, p_start_time, p_end_time, v_event.id) then
      raise exception 'health event staff schedule conflicts' using errcode = '23P01'; end if;
  end loop;
  update public.health_event_staff as member set is_active = false, allocation_quota = 0 where member.event_id = v_event.id;
  insert into public.health_event_staff(event_id, staff_profile_id)
    select v_event.id, ids.staff_id from unnest(p_staff_ids) as ids(staff_id)
    on conflict (event_id, staff_profile_id) do update set is_active = true;
  perform public.health_event_reconcile(v_event.id);
  if p_publish and v_before_status = 'draft' then perform public.health_event_audit(v_event.id, null, 'health_event.published'); end if;
  if p_notify and v_event.booking_status = 'published' then
    select announcement.id into v_announcement from public.announcements as announcement where announcement.health_event_id = v_event.id;
    if v_announcement is null then
      insert into public.announcements(title, category, content, publish_at, event_start_at, event_end_at,
        expires_at, is_pinned, created_by, updated_by, request_key, health_event_id)
      values (v_event.title, 'clinic_schedule', 'Register for this health service event through Health service events in Appointments. Places are confirmed automatically while capacity is available.',
        statement_timestamp(), (v_event.event_date + v_event.start_time) at time zone 'Asia/Manila',
        (v_event.event_date + v_event.end_time) at time zone 'Asia/Manila',
        (v_event.event_date + v_event.end_time) at time zone 'Asia/Manila', false, auth.uid(), auth.uid(), v_event.id, v_event.id)
      returning id into v_announcement;
      for v_recipient in select profile.id from public.profiles as profile where profile.account_status = 'active' and profile.retired_at is null loop
        perform public.assistance_add_notification(v_recipient, 'new_announcement', 'New announcement', v_event.title,
          'announcements', v_announcement, '/announcements', 'announcement:' || v_announcement::text, statement_timestamp());
      end loop;
    end if;
  end if;
  if p_id is not null then
    update public.announcements as announcement set title = v_event.title,
      event_start_at = (v_event.event_date + v_event.start_time) at time zone 'Asia/Manila',
      event_end_at = (v_event.event_date + v_event.end_time) at time zone 'Asia/Manila',
      expires_at = (v_event.event_date + v_event.end_time) at time zone 'Asia/Manila'
      where announcement.health_event_id = v_event.id and announcement.archived_at is null;
    for v_recipient in select booking.id from public.health_event_bookings as booking
      where booking.event_id = v_event.id and booking.booking_state <> 'cancelled' loop
      perform public.health_event_notify(v_recipient, 'updated');
    end loop;
    perform public.health_event_audit(v_event.id, null, 'health_event.updated');
  end if;
  perform public.health_event_promote(v_event.id);
  perform public.health_event_emit(v_event.id);
  return jsonb_build_object('id', v_event.id, 'version', v_event.version);
end;
$$;

create or replace function public.health_event_book(p_event_id uuid, p_request_key uuid, p_join_waitlist boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_resident uuid;
  v_event public.health_service_events%rowtype;
  v_existing public.health_event_bookings%rowtype;
  v_booking public.health_event_bookings%rowtype;
  v_staff uuid;
  v_used integer;
  v_state text;
begin
  if v_role <> 'resident' then raise exception 'health event booking requires a Resident' using errcode = '42501'; end if;
  if p_request_key is null or p_join_waitlist is null then raise exception 'health event request key is required' using errcode = '23502'; end if;
  select resident.id into v_resident from public.residents as resident where resident.linked_profile_id = auth.uid()
    and resident.status = 'active' and resident.archived_at is null;
  if v_resident is null then raise exception 'health event booking requires an active linked Resident' using errcode = '42501'; end if;
  v_event := public.health_event_lock(p_event_id);
  select booking.* into v_existing from public.health_event_bookings as booking
    where booking.booked_by = auth.uid() and booking.request_key = p_request_key;
  if found then
    if v_existing.event_id <> p_event_id then raise exception 'health event request key was reused' using errcode = '23514'; end if;
    return public.health_event_booking_result(v_existing.id);
  end if;
  select booking.* into v_existing from public.health_event_bookings as booking
    where booking.event_id = p_event_id and booking.resident_id = v_resident and booking.booking_state <> 'cancelled';
  if found then return public.health_event_own_booking(p_event_id); end if;
  if v_event.booking_status <> 'published' or v_event.archived_at is not null
    or statement_timestamp() < v_event.booking_opens_at or statement_timestamp() >= v_event.booking_closes_at then
    raise exception 'health event booking is closed' using errcode = '23514'; end if;
  perform public.health_event_reconcile(p_event_id);
  -- Existing eligible FIFO waitlist has precedence over new arrivals.
  perform public.health_event_promote(p_event_id);
  select count(*)::integer into v_used from public.health_event_bookings as booking
    where booking.event_id = p_event_id and booking.booking_state in ('confirmed', 'checked_in', 'completed');
  v_staff := public.health_event_pick_staff(p_event_id);
  if v_used >= v_event.target_capacity or v_staff is null then
    if not p_join_waitlist then raise exception 'health event is fully booked or staff capacity is unavailable' using errcode = 'P0001'; end if;
    v_state := 'waitlisted'; v_staff := null;
  else v_state := 'confirmed'; end if;
  update public.health_service_events as event set next_order = event.next_order + 1
    where event.id = p_event_id returning event.next_order into v_event.next_order;
  insert into public.health_event_bookings(event_id, resident_id, booked_by, assigned_staff_id, booking_state, join_order, request_key)
    values (p_event_id, v_resident, auth.uid(), v_staff, v_state, v_event.next_order, p_request_key) returning * into v_booking;
  perform public.health_event_audit(p_event_id, v_booking.id, case when v_state = 'confirmed'
    then 'health_event.booking_confirmed' else 'health_event.waitlisted' end);
  if v_staff is not null then perform public.health_event_audit(p_event_id, v_booking.id, 'health_event.auto_assigned'); end if;
  perform public.health_event_notify(v_booking.id, v_state);
  perform public.health_event_emit(p_event_id);
  return public.health_event_own_booking(p_event_id);
end;
$$;

create or replace function public.health_event_cancel_booking(p_booking_id uuid, p_expected_version bigint, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_booking public.health_event_bookings%rowtype;
  v_event public.health_service_events%rowtype;
begin
  select booking.* into v_booking from public.health_event_bookings as booking where booking.id = p_booking_id;
  if not found then raise exception 'health event booking not found' using errcode = 'P0002'; end if;
  if v_role not in ('admin', 'barangay_health_worker') and not (v_role = 'resident' and exists (
    select 1 from public.residents as resident where resident.id = v_booking.resident_id and resident.linked_profile_id = auth.uid())) then
    raise exception 'health event cancellation access denied' using errcode = '42501'; end if;
  v_event := public.health_event_lock(v_booking.event_id);
  select booking.* into v_booking from public.health_event_bookings as booking where booking.id = p_booking_id for update;
  if v_booking.version is distinct from p_expected_version then raise exception 'health event booking changed by another user' using errcode = '40001'; end if;
  if v_booking.booking_state not in ('confirmed', 'waitlisted') or statement_timestamp() >= v_event.booking_closes_at
    or char_length(btrim(p_reason)) > 1000 then raise exception 'health event cancellation is not eligible' using errcode = '23514'; end if;
  update public.health_event_bookings as booking set booking_state = 'cancelled', cancelled_at = statement_timestamp(),
    cancellation_reason = nullif(btrim(p_reason), ''), updated_at = statement_timestamp(), version = booking.version + 1 where booking.id = p_booking_id;
  perform public.health_event_audit(v_booking.event_id, p_booking_id, 'health_event.booking_cancelled');
  perform public.health_event_notify(p_booking_id, 'cancelled');
  perform public.health_event_promote(v_booking.event_id);
  perform public.health_event_emit(v_booking.event_id);
end;
$$;

create or replace function public.health_event_set_status(p_event_id uuid, p_expected_version bigint, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role(true);
  v_event public.health_service_events%rowtype;
  v_booking uuid;
begin
  v_event := public.health_event_lock(p_event_id);
  if v_event.version is distinct from p_expected_version then raise exception 'health event changed by another user' using errcode = '40001'; end if;
  if p_action is null or p_action not in ('close', 'cancel', 'archive') or v_event.archived_at is not null then
    raise exception 'invalid health event action' using errcode = '23514'; end if;
  if p_action = 'archive' and v_event.booking_status not in ('cancelled', 'closed') then
    raise exception 'close or cancel the health event before archiving' using errcode = '23514'; end if;
  if p_action = 'archive' and exists (select 1 from public.health_event_bookings as booking
    where booking.event_id = p_event_id and booking.booking_state in ('confirmed', 'checked_in', 'waitlisted')) then
    raise exception 'finish or cancel active event bookings before archiving' using errcode = '23514'; end if;
  update public.health_service_events as event set booking_status = case p_action
    when 'cancel' then 'cancelled' when 'close' then 'closed' else event.booking_status end,
    archived_at = case when p_action = 'archive' then statement_timestamp() else event.archived_at end,
    cancelled_at = case when p_action = 'cancel' then statement_timestamp() else event.cancelled_at end,
    updated_at = statement_timestamp(), updated_by = auth.uid(), version = event.version + 1 where event.id = p_event_id;
  if p_action = 'cancel' then
    for v_booking in update public.health_event_bookings as booking set booking_state = 'cancelled',
      cancelled_at = statement_timestamp(), updated_at = statement_timestamp(), version = booking.version + 1
      where booking.event_id = p_event_id and booking.booking_state in ('confirmed', 'waitlisted', 'checked_in') returning booking.id loop
      perform public.health_event_audit(p_event_id, v_booking, 'health_event.booking_cancelled');
      perform public.health_event_notify(v_booking, 'cancelled');
    end loop;
    -- Linked communication remains retained; existing archive cleanup hides its notifications.
    update public.announcements as announcement set archived_at = statement_timestamp(), updated_by = auth.uid(),
      updated_at = statement_timestamp(), version = announcement.version + 1
      where announcement.health_event_id = p_event_id and announcement.archived_at is null;
    delete from public.assistance_notifications as notification using public.announcements as announcement
      where announcement.health_event_id = p_event_id and announcement.archived_at is not null
        and notification.source_type = 'announcements' and notification.source_id = announcement.id
        and notification.notification_type = 'new_announcement';
  end if;
  perform public.health_event_audit(p_event_id, null, case p_action when 'cancel' then 'health_event.cancelled'
    when 'close' then 'health_event.closed' else 'health_event.archived' end);
  perform public.health_event_emit(p_event_id);
end;
$$;

create or replace function public.health_event_queue(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_rows jsonb;
begin
  if v_role = 'resident' then raise exception 'health event queue access denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', booking.id, 'reference', booking.reference,
    'state', booking.booking_state, 'version', booking.version, 'queue_order', booking.join_order,
    'resident_number', resident.resident_number, 'resident_name', concat_ws(' ', resident.first_name, resident.last_name),
    'assigned_staff', concat_ws(' ', staff.first_name, staff.last_name)) order by booking.join_order), '[]'::jsonb)
    into v_rows from public.health_event_bookings as booking
    join public.residents as resident on resident.id = booking.resident_id
    left join public.profiles as staff on staff.id = booking.assigned_staff_id
    where booking.event_id = p_event_id and booking.booking_state in ('confirmed', 'checked_in', 'completed')
      and (v_role in ('admin', 'barangay_health_worker') or booking.assigned_staff_id = auth.uid());
  return v_rows;
end;
$$;

create or replace function public.health_event_transition_booking(p_booking_id uuid, p_expected_version bigint, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_booking public.health_event_bookings%rowtype;
  v_event public.health_service_events%rowtype;
begin
  select booking.* into v_booking from public.health_event_bookings as booking where booking.id = p_booking_id;
  if not found then raise exception 'health event booking not found' using errcode = 'P0002'; end if;
  if v_role = 'resident' or (v_role not in ('admin', 'barangay_health_worker') and v_booking.assigned_staff_id is distinct from auth.uid()) then
    raise exception 'health event operation access denied' using errcode = '42501'; end if;
  v_event := public.health_event_lock(v_booking.event_id);
  select booking.* into v_booking from public.health_event_bookings as booking where booking.id = p_booking_id for update;
  if v_booking.version is distinct from p_expected_version then raise exception 'health event booking changed by another user' using errcode = '40001'; end if;
  if v_event.booking_status = 'cancelled' or v_event.archived_at is not null
    or v_event.event_date <> (statement_timestamp() at time zone 'Asia/Manila')::date
    or v_booking.assigned_staff_id is null or p_action is null
    or not exists (select 1 from public.profiles as staff where staff.id = v_booking.assigned_staff_id
      and staff.account_status = 'active' and staff.retired_at is null
      and public.appointment_staff_role_eligible(staff.role, v_event.service_type))
    or not ((p_action = 'check_in' and v_booking.booking_state = 'confirmed')
      or (p_action = 'complete' and v_booking.booking_state = 'checked_in')) then
    raise exception 'invalid health event booking transition' using errcode = '23514'; end if;
  update public.health_event_bookings as booking set booking_state = case when p_action = 'check_in' then 'checked_in' else 'completed' end,
    checked_in_at = coalesce(booking.checked_in_at, statement_timestamp()),
    completed_at = case when p_action = 'complete' then statement_timestamp() else null end,
    updated_at = statement_timestamp(), version = booking.version + 1 where booking.id = p_booking_id;
  perform public.health_event_audit(v_booking.event_id, p_booking_id, case when p_action = 'check_in' then 'health_event.checked_in' else 'health_event.completed' end);
  perform public.health_event_notify(p_booking_id, p_action);
  perform public.health_event_emit(v_booking.event_id);
end;
$$;

create or replace function public.health_event_announcement_links(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_links jsonb;
begin
  if coalesce(cardinality(p_ids), 0) > 50 then raise exception 'too many announcement references' using errcode = '22023'; end if;
  select coalesce(jsonb_object_agg(announcement.id::text, event.id), '{}'::jsonb) into v_links
  from public.announcements as announcement join public.health_service_events as event on event.id = announcement.health_event_id
  where announcement.id = any(p_ids) and announcement.archived_at is null and event.archived_at is null
    and event.booking_status = 'published' and announcement.publish_at <= statement_timestamp()
    and (announcement.expires_at is null or announcement.expires_at > statement_timestamp());
  return v_links;
end;
$$;

create or replace function public.health_event_report(p_date_from date, p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_rows jsonb;
begin
  if v_role = 'resident' then raise exception 'health event report access denied' using errcode = '42501'; end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 366 then
    raise exception 'invalid health event report range' using errcode = '22007'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', event.id, 'reference', event.reference, 'title', event.title,
    'date', event.event_date, 'capacity', event.target_capacity, 'status', event.booking_status,
    'booked', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id
      and booking.booking_state in ('confirmed', 'checked_in', 'completed') and (v_role in ('admin', 'barangay_health_worker') or booking.assigned_staff_id = auth.uid())),
    'waitlisted', case when v_role in ('admin', 'barangay_health_worker') then (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id and booking.booking_state = 'waitlisted') else null end,
    'cancelled', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id and booking.booking_state = 'cancelled'
      and (v_role in ('admin', 'barangay_health_worker') or booking.assigned_staff_id = auth.uid())),
    'attended', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id and booking.booking_state in ('checked_in', 'completed')
      and (v_role in ('admin', 'barangay_health_worker') or booking.assigned_staff_id = auth.uid())),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', concat_ws(' ', staff.first_name, staff.last_name),
      'quota', member.allocation_quota, 'assigned', (select count(*) from public.health_event_bookings as booking
        where booking.event_id = event.id and booking.assigned_staff_id = member.staff_profile_id
          and booking.booking_state in ('confirmed', 'checked_in', 'completed'))) order by member.staff_profile_id), '[]'::jsonb)
      from public.health_event_staff as member join public.profiles as staff on staff.id = member.staff_profile_id
      where member.event_id = event.id and (v_role in ('admin', 'barangay_health_worker') or member.staff_profile_id = auth.uid())),
    'completed', (select count(*) from public.health_event_bookings as booking where booking.event_id = event.id and booking.booking_state = 'completed'
      and (v_role in ('admin', 'barangay_health_worker') or booking.assigned_staff_id = auth.uid()))
  ) order by event.event_date, event.id), '[]'::jsonb) into v_rows from public.health_service_events as event
  where event.event_date between p_date_from and p_date_to
    and (v_role in ('admin', 'barangay_health_worker') or exists (
      select 1 from public.health_event_staff as member where member.event_id = event.id and member.staff_profile_id = auth.uid()));
  return v_rows;
end;
$$;

create or replace function public.health_event_staff_account_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  if new.account_status is not distinct from old.account_status and new.role is not distinct from old.role
    and new.retired_at is not distinct from old.retired_at then return new; end if;
  for v_event in select event.id from public.health_service_events as event
    join public.health_event_staff as member on member.event_id = event.id
    where member.staff_profile_id = new.id and member.is_active and event.archived_at is null
      and event.booking_status in ('published', 'closed')
      and (event.event_date + event.end_time) at time zone 'Asia/Manila' > statement_timestamp()
    order by event.event_date, event.id loop
    perform public.health_event_reconcile(v_event);
    perform public.health_event_promote(v_event);
    perform public.health_event_emit(v_event);
  end loop;
  return new;
end;
$$;
create trigger profiles_health_event_staff_recovery after update of account_status, role, retired_at on public.profiles
  for each row execute function public.health_event_staff_account_changed();

-- Ordinary availability, staff-created schedules and auto booking honor event reservations.
create or replace function public.health_event_staff_reserved(p_staff uuid, p_date date, p_start time, p_end time)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.health_service_events as event
 join public.health_event_staff as member on member.event_id = event.id
 where member.staff_profile_id = p_staff and member.is_active and member.allocation_quota > 0
 and event.archived_at is null and event.booking_status in ('published', 'closed')
 and event.event_date = p_date and event.start_time < p_end and event.end_time > p_start)
$$;

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

  perform public.health_event_lock_day(p_scheduled_date);
  if public.health_event_staff_reserved(p_staff_id, p_scheduled_date, p_start_time, p_end_time) then
    raise exception 'Staff schedule is reserved for a health service event' using errcode = '23P01';
  end if;

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
        and not public.health_event_staff_reserved(staff.id, slot.scheduled_date, slot.start_time, slot.end_time)
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

  perform public.health_event_lock_day(p_scheduled_date);
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

    if not public.health_event_staff_reserved(candidate_staff_id, p_scheduled_date, p_start_time, appointment_end_time)
      and not exists (
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

-- Minimized history: manager event history or the caller's own/assigned booking events.
create or replace function public.health_event_history_list(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.health_event_require_role();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('action', history.action, 'occurred_at', history.occurred_at)
    order by history.id), '[]'::jsonb) into v_result
  from public.health_event_history as history
  where history.event_id = p_event_id and (v_role in ('admin', 'barangay_health_worker')
    or exists (select 1 from public.health_event_bookings as booking join public.residents as resident on resident.id = booking.resident_id
      where booking.id = history.booking_id and ((v_role = 'resident' and resident.linked_profile_id = auth.uid())
        or (v_role in ('nurse', 'midwife') and booking.assigned_staff_id = auth.uid()))));
  return v_result;
end;
$$;

-- Revoke default PUBLIC EXECUTE on EVERY new helper before opening the narrow API.
do $$
declare
  v_function record;
begin
  for v_function in select procedure.oid::regprocedure as signature from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname like 'health_event_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
  end loop;
end;
$$;
revoke all on sequence public.health_event_history_id_seq from public, anon, authenticated;
grant execute on function public.health_event_list(boolean, integer, integer, uuid),
 public.health_event_save(uuid, bigint, text, text, date, time, time, integer, uuid[], boolean, boolean, uuid),
 public.health_event_book(uuid, uuid, boolean), public.health_event_cancel_booking(uuid, bigint, text),
 public.health_event_set_status(uuid, bigint, text), public.health_event_queue(uuid),
 public.health_event_transition_booking(uuid, bigint, text), public.health_event_announcement_links(uuid[]),
 public.health_event_report(date, date), public.health_event_history_list(uuid) to authenticated;
-- Existing ordinary RPC signatures/ACLs, RLS and lifecycle remain unchanged.
commit;
