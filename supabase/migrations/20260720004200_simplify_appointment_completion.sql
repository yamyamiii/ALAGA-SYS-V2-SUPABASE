-- Simplify the visible operational lifecycle without removing the internal
-- in_progress state. Staff who could already complete an appointment may now
-- complete it directly after check-in. No clinical record is required.

begin;

create or replace function public.appointment_transition(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_target_status public.appointment_status,
  p_cancellation_reason text default null,
  p_operational_notes text default null
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
  current_record public.appointments%rowtype;
  transition_allowed boolean := false;
  actor_allowed boolean := false;
  transitioned_at timestamptz := pg_catalog.now();
  normalized_cancellation_reason text :=
    nullif(btrim(p_cancellation_reason), '');
begin
  if actor_role is null or actor_role = 'resident'::public.app_role then
    raise exception 'appointment status changes require authorized staff'
      using errcode = '42501';
  end if;

  select * into current_record
  from public.appointments as appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  if current_record.archived_at is not null then
    raise exception 'archived appointments cannot change status'
      using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'appointment was changed by another user'
      using errcode = '40001';
  end if;
  if p_target_status = 'rescheduled'::public.appointment_status then
    raise exception 'use the atomic reschedule workflow'
      using errcode = '23514';
  end if;

  transition_allowed := (current_record.status, p_target_status) in (
    ('pending'::public.appointment_status, 'confirmed'::public.appointment_status),
    ('pending'::public.appointment_status, 'cancelled'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'checked_in'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'cancelled'::public.appointment_status),
    ('confirmed'::public.appointment_status, 'no_show'::public.appointment_status),
    ('checked_in'::public.appointment_status, 'in_progress'::public.appointment_status),
    ('checked_in'::public.appointment_status, 'completed'::public.appointment_status),
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
  elsif actor_role in (
    'nurse'::public.app_role,
    'midwife'::public.app_role
  ) then
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

  -- A pending Resident request cancelled by staff is a rejection, not an
  -- ordinary cancellation, and retains its required accountability text.
  if p_target_status = 'cancelled'::public.appointment_status
    and current_record.status = 'pending'::public.appointment_status
    and current_record.request_source =
      'resident'::public.appointment_request_source
    and normalized_cancellation_reason is null then
    raise exception 'a Resident-request rejection reason is required'
      using errcode = '23514';
  end if;
  if pg_catalog.char_length(normalized_cancellation_reason) > 1000
    or pg_catalog.char_length(coalesce(p_operational_notes, '')) > 2000 then
    raise exception 'appointment text exceeds the allowed length'
      using errcode = '22001';
  end if;

  return query
  update public.appointments as appointment
  set status = p_target_status,
      checked_in_at = case
        when p_target_status = 'checked_in'::public.appointment_status
          then coalesce(appointment.checked_in_at, transitioned_at)
        else appointment.checked_in_at
      end,
      started_at = case
        when p_target_status in (
          'in_progress'::public.appointment_status,
          'completed'::public.appointment_status
        ) then coalesce(appointment.started_at, transitioned_at)
        else appointment.started_at
      end,
      completed_at = case
        when p_target_status = 'completed'::public.appointment_status
          then coalesce(appointment.completed_at, transitioned_at)
        else appointment.completed_at
      end,
      cancelled_at = case
        when p_target_status = 'cancelled'::public.appointment_status
          then coalesce(appointment.cancelled_at, transitioned_at)
        else null
      end,
      cancellation_reason = case
        when p_target_status = 'cancelled'::public.appointment_status
          then normalized_cancellation_reason
        else null
      end,
      operational_notes = case
        when p_operational_notes is not null
          then nullif(btrim(p_operational_notes), '')
        else appointment.operational_notes
      end,
      updated_by = actor_id
  where appointment.id = current_record.id
  returning appointment.id, appointment.appointment_number,
    appointment.status, appointment.version;
end;
$$;

revoke all on function public.appointment_transition(
  uuid, bigint, public.appointment_status, text, text
) from public, anon;

grant execute on function public.appointment_transition(
  uuid, bigint, public.appointment_status, text, text
) to authenticated, service_role;

commit;
