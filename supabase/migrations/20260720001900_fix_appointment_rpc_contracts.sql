-- Phase 4 forward fix: make appointment read RPC return contracts explicit and
-- keep the internal service-type validator unavailable to browser roles.

begin;

-- appointments.service_type is varchar(100), while the public RPC contract is
-- text. PL/pgSQL RETURN QUERY requires an exact type match and does not apply an
-- implicit varchar-to-text conversion.
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
    p.role, a.appointment_type, a.service_type::text, a.scheduled_date,
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
    q.resident_number, q.resident_name, q.appointment_type,
    q.service_type::text, q.scheduled_date, q.start_time, q.priority, q.status,
    q.assigned_staff_id, q.staff_name, q.checked_in_at, q.version, q.queue_total
  from ordered_queue as q
  order by q.position
  limit p_limit offset p_offset;
end;
$$;

-- Calendar and resident history expose the same stable text API contract and
-- select the same varchar source column, so fix those latent failures too.
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
    a.service_type::text, a.status, a.priority, a.assigned_staff_id,
    nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), '')
  from public.appointments as a
  left join public.profiles as p on p.id = a.assigned_staff_id
  where a.scheduled_date between p_date_from and p_date_to
    and a.archived_at is null
  order by a.scheduled_date, a.start_time, a.id;
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
    a.service_type::text, a.status, a.assigned_staff_id,
    nullif(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix), ''),
    count(*) over ()
  from public.appointments as a
  left join public.profiles as p on p.id = a.assigned_staff_id
  where a.resident_id = p_resident_id
  order by a.scheduled_date desc, a.start_time desc, a.id
  limit p_limit offset p_offset;
end;
$$;

-- This read RPC is SECURITY INVOKER. Calling the revoked internal validation
-- helper therefore executes as the browser role and fails before RLS can filter
-- profiles. Keep the helper private and perform the same harmless allowlist
-- check inside the read RPC.
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
  if p_service_type is not null and p_service_type not in (
    'General Consultation',
    'Maternal Care',
    'Child Health',
    'Immunization',
    'Blood Pressure Monitoring',
    'Medicine Refill',
    'Health Certificate',
    'Other'
  ) then
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

-- CREATE OR REPLACE preserves ownership. Restate the intended read-RPC
-- privileges explicitly and keep the internal helper private.
revoke all on function public.appointment_list(text, date, date, public.appointment_status, public.appointment_type, text, public.appointment_priority, uuid, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.appointment_daily_queue(date, public.appointment_status, public.appointment_priority, integer, integer) from public, anon;
revoke all on function public.appointment_calendar(date, date) from public, anon;
revoke all on function public.appointment_resident_history(uuid, integer, integer) from public, anon;
revoke all on function public.appointment_search_staff(text, text, integer, integer) from public, anon;
revoke all on function public.appointment_service_type_valid(text)
  from public, anon, authenticated;

grant execute on function public.appointment_list(text, date, date, public.appointment_status, public.appointment_type, text, public.appointment_priority, uuid, boolean, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_daily_queue(date, public.appointment_status, public.appointment_priority, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_calendar(date, date) to authenticated, service_role;
grant execute on function public.appointment_resident_history(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.appointment_search_staff(text, text, integer, integer) to authenticated, service_role;

commit;
