-- Appointment numbers use a global sequence and cannot be supplied or changed
-- by clients. This table contains operational scheduling data, not clinical notes.

create sequence public.appointment_number_seq as bigint start with 1 increment by 1;

create or replace function public.set_appointment_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.appointment_number := format(
      'APT-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(nextval('public.appointment_number_seq')::text, 6, '0')
    );
  elsif new.appointment_number is distinct from old.appointment_number then
    raise exception 'appointment_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.set_appointment_number() from public;
revoke all on function public.set_appointment_number() from anon, authenticated;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  appointment_number text not null,
  resident_id uuid not null references public.residents (id) on delete restrict,
  assigned_staff_id uuid references public.profiles (id) on delete set null,
  appointment_type public.appointment_type not null,
  service_type varchar(100) not null,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  priority public.appointment_priority not null default 'normal',
  status public.appointment_status not null default 'pending',
  reason text,
  operational_notes text,
  cancellation_reason text,
  rescheduled_from_id uuid references public.appointments (id) on delete restrict,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint appointments_appointment_number_unique unique (appointment_number),
  constraint appointments_appointment_number_format check (
    appointment_number ~ '^APT-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint appointments_service_type_format check (
    char_length(btrim(service_type)) between 2 and 100
    and service_type ~ '^[[:alnum:]][[:alnum:] _&/()''.-]*$'
  ),
  constraint appointments_time_order check (end_time > start_time),
  constraint appointments_reason_length check (
    reason is null or char_length(reason) <= 1000
  ),
  constraint appointments_operational_notes_length check (
    operational_notes is null or char_length(operational_notes) <= 2000
  ),
  constraint appointments_cancellation_reason_length check (
    cancellation_reason is null or char_length(cancellation_reason) <= 1000
  ),
  constraint appointments_not_self_rescheduled check (
    rescheduled_from_id is null or rescheduled_from_id <> id
  ),
  constraint appointments_cancelled_fields_consistent check (
    (status = 'cancelled' and cancelled_at is not null and cancellation_reason is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint appointments_completed_at_consistent check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint appointments_started_at_consistent check (
    status not in ('in_progress', 'completed') or started_at is not null
  ),
  constraint appointments_checked_in_at_consistent check (
    status not in ('checked_in', 'in_progress', 'completed') or checked_in_at is not null
  ),
  constraint appointments_event_time_order check (
    (started_at is null or checked_in_at is null or started_at >= checked_in_at)
    and (completed_at is null or started_at is null or completed_at >= started_at)
  )
);

create trigger appointments_set_number
  before insert or update on public.appointments
  for each row execute function public.set_appointment_number();
