-- Resident self-cancellation may omit narrative justification. Staff
-- cancellation and rejection accountability remains enforced by the trusted
-- staff transition RPC.

begin;

alter table public.appointments
  drop constraint appointments_cancelled_fields_consistent,
  add constraint appointments_cancelled_fields_consistent check (
    (
      status = 'cancelled'
      and cancelled_at is not null
      and (
        cancellation_reason is not null
        or request_source = 'resident'::public.appointment_request_source
      )
    )
    or (status <> 'cancelled' and cancelled_at is null)
  );

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
  normalized_cancellation_reason text :=
    nullif(btrim(p_cancellation_reason), '');
begin
  if actor_role is distinct from 'resident'::public.app_role then
    raise exception 'resident cancellation requires an active resident account'
      using errcode = '42501';
  end if;
  if char_length(normalized_cancellation_reason) > 1000 then
    raise exception 'cancellation reason must be 1,000 characters or fewer'
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
      cancellation_reason = normalized_cancellation_reason,
      cancelled_at = pg_catalog.now(),
      updated_by = actor_id
  where a.id = appointment_record.id
  returning a.id, a.appointment_number, a.status, a.version;
end;
$$;

revoke all on function public.resident_appointment_cancel(
  uuid, bigint, text
) from public, anon;

grant execute on function public.resident_appointment_cancel(
  uuid, bigint, text
) to authenticated;

commit;
