-- Keep one authoritative appointment row when staff reschedule it, and make
-- schedule-change notifications/reminders follow that same row.

begin;

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
  effective_type public.appointment_type;
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
  from public.appointments as a
  where a.id = p_appointment_id
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

  effective_type := case
    when current_record.appointment_type = 'walk_in'::public.appointment_type
      then 'scheduled'::public.appointment_type
    else current_record.appointment_type
  end;

  perform public.appointment_validate_schedule(
    current_record.resident_id,
    effective_type,
    current_record.service_type,
    p_scheduled_date,
    p_start_time,
    p_end_time,
    p_assigned_staff_id,
    current_record.reason,
    current_record.id
  );

  if current_record.appointment_type = effective_type
    and current_record.scheduled_date = p_scheduled_date
    and current_record.start_time = p_start_time
    and current_record.end_time = p_end_time
    and current_record.assigned_staff_id is not distinct from p_assigned_staff_id then
    return query
    select current_record.id, current_record.version,
      current_record.id, current_record.appointment_number,
      current_record.version;
    return;
  end if;

  return query
  with updated as (
    update public.appointments as a
    set appointment_type = effective_type,
        scheduled_date = p_scheduled_date,
        start_time = p_start_time,
        end_time = p_end_time,
        assigned_staff_id = p_assigned_staff_id,
        updated_by = actor_id
    where a.id = current_record.id
    returning a.id, a.appointment_number, a.version
  )
  select u.id, u.version, u.id, u.appointment_number, u.version
  from updated as u;
end;
$$;

revoke all on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) from public, anon;

grant execute on function public.appointment_reschedule(
  uuid, bigint, date, time, time, uuid, uuid
) to authenticated, service_role;

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

  select r.linked_profile_id into resident_profile
  from public.residents as r
  where r.id = new.resident_id;

  if schedule_changed then
    event_type := 'appointment_rescheduled';
    event_title := 'Appointment rescheduled';
    event_summary :=
      'Appointment ' || new.appointment_number || ' schedule was updated.';
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

create or replace function public.notification_notify_appointment_outbound()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  replacement public.appointments%rowtype;
  source_record public.appointments%rowtype;
  template public.outbound_notification_template;
  event_type public.outbound_notification_event;
  event_suffix text;
  safe_values jsonb := '{}'::jsonb;
  schedule_changed boolean := false;
  reminder_schedule_changed boolean := false;
begin
  source_record := new;
  select r.linked_profile_id into recipient
  from public.residents as r
  where r.id = new.resident_id;

  if tg_op = 'INSERT' then
    if new.request_source = 'resident'::public.appointment_request_source
      and new.status = 'pending'::public.appointment_status then
      perform public.notification_enqueue_for_profile(
        recipient, 'appointment:' || new.id::text || ':request_received',
        'appointment_request_received', 'appointments', new.id,
        'appointment_request_received', '{}'::jsonb,
        pg_catalog.statement_timestamp()
      );
    end if;
    return new;
  end if;

  schedule_changed :=
    (old.scheduled_date, old.start_time, old.end_time) is distinct from
    (new.scheduled_date, new.start_time, new.end_time);
  reminder_schedule_changed :=
    (old.scheduled_date, old.start_time) is distinct from
    (new.scheduled_date, new.start_time);

  if schedule_changed then
    if reminder_schedule_changed then
      perform public.notification_cancel_appointment_reminders(new.id);
    end if;
    template := 'appointment_rescheduled';
    event_type := 'appointment_rescheduled';
    event_suffix := 'schedule:' || new.version::text;
  elsif new.status = 'rescheduled'::public.appointment_status
    and old.status is distinct from new.status then
    perform public.notification_cancel_appointment_reminders(new.id);
    select * into replacement
    from public.appointments as a
    where a.rescheduled_from_id = new.id
    order by a.created_at desc
    limit 1;
    if found then source_record := replacement; end if;
    template := 'appointment_rescheduled';
    event_type := 'appointment_rescheduled';
    event_suffix := 'rescheduled:' || new.version::text;
  elsif new.status = 'confirmed'::public.appointment_status
    and old.status is distinct from new.status then
    template := 'appointment_confirmed';
    event_type := 'appointment_confirmed';
    event_suffix := 'confirmed:' || new.version::text;
  elsif new.status = 'cancelled'::public.appointment_status
    and old.status is distinct from new.status then
    perform public.notification_cancel_appointment_reminders(new.id);
    if old.status = 'pending'::public.appointment_status
      and old.request_source = 'resident'::public.appointment_request_source
      and new.updated_by is distinct from recipient then
      template := 'appointment_rejected';
      event_type := 'appointment_rejected';
      event_suffix := 'rejected:' || new.version::text;
    else
      template := 'appointment_cancelled';
      event_type := 'appointment_cancelled';
      event_suffix := 'cancelled:' || new.version::text;
    end if;
  elsif new.status in (
    'completed'::public.appointment_status,
    'no_show'::public.appointment_status
  ) and old.status is distinct from new.status then
    perform public.notification_cancel_appointment_reminders(new.id);
    return new;
  else
    return new;
  end if;

  if template in ('appointment_confirmed', 'appointment_rescheduled') then
    safe_values := jsonb_build_object(
      'date', to_char(source_record.scheduled_date, 'FMMonth FMDD, YYYY'),
      'time', to_char(source_record.start_time, 'FMHH12:MI AM')
    );
  end if;
  perform public.notification_enqueue_for_profile(
    recipient, 'appointment:' || new.id::text || ':' || event_suffix,
    event_type, 'appointments', new.id, template, safe_values,
    pg_catalog.statement_timestamp()
  );
  if new.status = 'confirmed'::public.appointment_status
    and (
      old.status is distinct from new.status
      or reminder_schedule_changed
    ) then
    perform public.notification_schedule_appointment_reminder(new);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notification_notify_appointment_outbound()
  from public, anon, authenticated;

drop trigger if exists appointments_outbound_notification_update
  on public.appointments;
create trigger appointments_outbound_notification_update
  after update of status, scheduled_date, start_time, end_time
  on public.appointments
  for each row execute function public.notification_notify_appointment_outbound();

commit;
