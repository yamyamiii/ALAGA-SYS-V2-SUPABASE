-- Appointment start times use the barangay's Asia/Manila business schedule.
-- Existing historical rows are preserved; new inserts and schedule changes
-- must use a 30-minute slot from 08:00 through 16:00 inclusive.

begin;

create or replace function public.appointment_start_time_valid(
  p_start_time time
)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select p_start_time between time '08:00' and time '16:00'
    and extract(minute from p_start_time) in (0, 30)
    and extract(second from p_start_time) = 0;
$$;

revoke all on function public.appointment_start_time_valid(time)
  from public, anon, authenticated;

create or replace function public.enforce_appointment_start_time_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_time is null
    or public.appointment_start_time_valid(new.start_time) is not true then
    raise exception
      'appointment start time must be a 30-minute slot between 08:00 and 16:00 Asia/Manila'
      using errcode = '22007',
        constraint = 'appointments_start_time_slot_valid';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_appointment_start_time_slot()
  from public, anon, authenticated;

drop trigger if exists appointments_start_time_slot_guard
  on public.appointments;

create trigger appointments_start_time_slot_guard
before insert or update of start_time on public.appointments
for each row execute function public.enforce_appointment_start_time_slot();

commit;
