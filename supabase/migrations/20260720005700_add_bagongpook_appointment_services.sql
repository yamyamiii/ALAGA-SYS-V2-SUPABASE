-- Add the verified Bagongpook appointment service vocabulary without
-- rewriting historical appointment rows. New create/request operations use
-- only the current services; an unchanged legacy service may be preserved
-- when staff edits another field on its existing appointment.

begin;

create or replace function public.appointment_service_type_valid(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value in (
    'General Consultation',
    'Buntis / Prenatal Care',
    'Maternal Care',
    'Immunization',
    'Family Planning',
    'Postpartum Home Visit'
  )
$$;

revoke all on function public.appointment_service_type_valid(text)
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
  resident_reason_optional boolean :=
    public.current_profile_role() = 'resident'::public.app_role
    and p_staff_id is null
    and p_exclude_id is null;
  legacy_service_preserved boolean := false;
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

  if public.appointment_service_type_valid(p_service_type) is not true
    and p_exclude_id is not null then
    select exists (
      select 1
      from public.appointments as a
      where a.id = p_exclude_id
        and a.resident_id = p_resident_id
        and a.service_type = p_service_type
        and a.service_type in (
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

-- SECURITY INVOKER staff search keeps the private validation helper private.
-- It accepts legacy values only so an existing legacy appointment can retain
-- its current staff while being edited; new forms never offer those values.
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
  order by lower(coalesce(p.last_name, '')),
    lower(coalesce(p.first_name, '')), p.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.appointment_search_staff(
  text, text, integer, integer
) from public, anon;
grant execute on function public.appointment_search_staff(
  text, text, integer, integer
) to authenticated, service_role;

-- Report filters accept current services and exact historical values. This is
-- a read-only compatibility path and does not make legacy values writable.
create or replace function public.report_validate_scope(
  p_group text,
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_service_type text default null,
  p_staff_id uuid default null
)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  select p.role
  into actor_role
  from public.profiles as p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if actor_role is null or actor_role = 'resident' then
    raise exception 'reports are unavailable to this account'
      using errcode = '42501';
  end if;

  if p_group = 'registry'
    and actor_role not in ('admin', 'barangay_health_worker') then
    raise exception 'registry reports require administrator or BHW access'
      using errcode = '42501';
  elsif p_group = 'health'
    and actor_role not in ('admin', 'nurse') then
    raise exception 'health reports require administrator or nurse access'
      using errcode = '42501';
  elsif p_group in ('maternal', 'child')
    and actor_role not in ('admin', 'barangay_health_worker', 'midwife') then
    raise exception 'maternal and child reports are unavailable to this role'
      using errcode = '42501';
  elsif p_group = 'workload'
    and actor_role not in ('admin', 'nurse', 'midwife') then
    raise exception 'staff workload reports are unavailable to this role'
      using errcode = '42501';
  elsif p_group not in (
    'overview', 'registry', 'appointments', 'health',
    'maternal', 'child', 'workload'
  ) then
    raise exception 'invalid report group';
  end if;

  if p_group = 'workload' and actor_role <> 'admin'
    and p_staff_id is not null and p_staff_id <> auth.uid() then
    raise exception 'clinical staff may view only their own workload'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'invalid report date range';
  end if;
  if p_end_date - p_start_date > 1826 then
    raise exception 'report date range cannot exceed five years';
  end if;

  if p_purok_id is not null and not exists (
    select 1
    from public.puroks as pk
    where pk.id = p_purok_id
      and pk.barangay_id = public.deployment_barangay_id()
      and pk.is_active
      and pk.code in ('P01','P02','P03','P04','P05','P06','P07')
  ) then
    raise exception 'invalid deployment purok filter';
  end if;

  if p_service_type is not null and p_service_type not in (
    'General Consultation', 'Buntis / Prenatal Care', 'Maternal Care',
    'Immunization', 'Family Planning', 'Postpartum Home Visit',
    'Child Health', 'Blood Pressure Monitoring', 'Medicine Refill',
    'Health Certificate', 'Other'
  ) then
    raise exception 'invalid report service filter';
  end if;

  if p_staff_id is not null and not exists (
    select 1
    from public.profiles as staff
    where staff.id = p_staff_id
      and staff.account_status = 'active'
      and staff.role in ('admin', 'barangay_health_worker', 'nurse', 'midwife')
  ) then
    raise exception 'invalid report staff filter';
  end if;

  return actor_role;
end;
$$;

revoke all on function public.report_validate_scope(
  text, date, date, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.report_validate_scope(
  text, date, date, uuid, text, uuid
) to authenticated;

commit;
