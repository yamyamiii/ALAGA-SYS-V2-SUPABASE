-- Enforce one appointment row and number for the complete operational
-- lifecycle. Legacy replacement chains remain as archived history.

begin;

-- Old reschedule RPC implementations identified replacement rows with this
-- foreign key. Reject any future attempt to recreate that retired model while
-- preserving existing relationships and restore compatibility.
create or replace function public.prevent_appointment_replacement_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rescheduled_from_id is not null then
    raise exception 'replacement-row appointment rescheduling is retired'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_appointment_replacement_insert()
  from public, anon, authenticated;

drop trigger if exists appointments_prevent_replacement_insert
  on public.appointments;
create trigger appointments_prevent_replacement_insert
  before insert on public.appointments
  for each row execute function public.prevent_appointment_replacement_insert();

-- A row is legacy-superseded only when the trusted self-FK proves that a
-- replacement was created from it. Archive, rather than delete or rewrite,
-- that old source row. Existing audit and resident-history reads retain it,
-- while every operational list/count/report already excludes archived rows.
update public.appointments as legacy
set archived_at = pg_catalog.statement_timestamp()
where legacy.archived_at is null
  and legacy.status = 'rescheduled'::public.appointment_status
  and exists (
    select 1
    from public.appointments as replacement
    where replacement.rescheduled_from_id = legacy.id
  );

-- Reassert the effective public RPC contract in a forward migration. The
-- legacy OUT names are retained for PostgREST compatibility, but both IDs and
-- the appointment number refer to the same authoritative row.
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'alaga:appointment-reschedule:' || p_appointment_id::text || ':' ||
        p_request_key::text,
      0
    )
  );

  select * into current_record
  from public.appointments as appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
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
  if p_assigned_staff_id is distinct from current_record.assigned_staff_id then
    raise exception 'rescheduling cannot change the assigned staff member'
      using errcode = '23514';
  end if;

  perform public.appointment_validate_schedule(
    current_record.resident_id,
    current_record.appointment_type,
    current_record.service_type,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    current_record.assigned_staff_id,
    current_record.reason,
    current_record.id
  );

  if current_record.scheduled_date = p_scheduled_date
    and current_record.start_time = p_start_time
    and current_record.end_time = p_end_time then
    return query
    select current_record.id, current_record.version,
      current_record.id, current_record.appointment_number,
      current_record.version;
    return;
  end if;

  return query
  with updated as (
    update public.appointments as appointment
    set scheduled_date = p_scheduled_date,
        start_time = p_start_time,
        end_time = p_end_time,
        updated_by = actor_id
    where appointment.id = current_record.id
    returning appointment.id, appointment.appointment_number,
      appointment.version
  )
  select updated.id, updated.version, updated.id,
    updated.appointment_number, updated.version
  from updated;
end;
$$;

revoke all on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) from public, anon;

grant execute on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) to authenticated, service_role;

-- Tie the in-app event to the schedule tuple itself. The linked Resident is
-- resolved by the database and the summary contains only safe operational
-- date/time information from the updated row.
create or replace function public.assistance_notify_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resident_profile uuid;
  event_type public.assistance_notification_type;
  event_title text;
  event_summary text;
  event_key text;
  staff_event_key text;
  schedule_changed boolean := false;
begin
  if tg_op <> 'UPDATE' then return new; end if;

  schedule_changed :=
    (old.scheduled_date, old.start_time, old.end_time) is distinct from
    (new.scheduled_date, new.start_time, new.end_time);
  if not schedule_changed and old.status = new.status then return new; end if;

  select resident.linked_profile_id into resident_profile
  from public.residents as resident
  where resident.id = new.resident_id;

  if schedule_changed then
    event_type := 'appointment_rescheduled';
    event_title := 'Appointment rescheduled';
    event_summary := 'Appointment ' || new.appointment_number ||
      ' was rescheduled to ' ||
      pg_catalog.to_char(new.scheduled_date, 'FMMonth FMDD, YYYY') ||
      ' at ' || pg_catalog.to_char(new.start_time, 'FMHH12:MI AM') || '.';
    event_key := 'appointment:' || new.id::text || ':schedule:' ||
      new.version::text;
    staff_event_key := 'staff-appointment:' || new.id::text || ':schedule:' ||
      new.version::text;
  elsif new.status = 'confirmed' then
    event_type := 'appointment_approved';
    event_title := 'Appointment approved';
  elsif new.status = 'rescheduled' then
    event_type := 'appointment_rescheduled';
    event_title := 'Appointment rescheduled';
  elsif new.status = 'cancelled' and old.status = 'pending'
    and new.request_source = 'resident'
    and public.current_profile_role() <> 'resident' then
    event_type := 'appointment_rejected';
    event_title := 'Appointment request rejected';
  elsif new.status = 'cancelled' then
    event_type := 'appointment_cancelled';
    event_title := 'Appointment cancelled';
  elsif new.status = 'checked_in' then
    event_type := 'appointment_checked_in';
    event_title := 'Appointment checked in';
  else
    return new;
  end if;

  if event_summary is null then
    event_summary :=
      'Appointment ' || new.appointment_number || ' was updated.';
  end if;
  if event_key is null then
    event_key := 'appointment:' || new.id::text || ':' || new.status::text;
  end if;
  if staff_event_key is null then
    staff_event_key :=
      'staff-appointment:' || new.id::text || ':' || new.status::text;
  end if;

  perform public.assistance_add_notification(
    resident_profile, event_type, event_title, event_summary,
    'appointments', new.id, '/appointments', event_key, pg_catalog.now()
  );
  if new.assigned_staff_id is not null
    and new.assigned_staff_id <> auth.uid() then
    perform public.assistance_add_notification(
      new.assigned_staff_id, event_type, event_title,
      case when schedule_changed
        then 'An assigned appointment schedule was updated.'
        else 'An assigned appointment was updated.' end,
      'appointments', new.id, '/appointments', staff_event_key,
      pg_catalog.now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.assistance_notify_appointment()
  from public, anon, authenticated;

drop trigger if exists appointments_assistance_notifications
  on public.appointments;
create trigger appointments_assistance_notifications
  after update of status, scheduled_date, start_time, end_time
  on public.appointments
  for each row execute function public.assistance_notify_appointment();

commit;
