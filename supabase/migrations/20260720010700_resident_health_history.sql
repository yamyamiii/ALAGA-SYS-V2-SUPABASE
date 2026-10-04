-- Resident-only finalized history projection. Existing staff RPCs and clinical
-- policies remain unchanged; no clinical rows are added to realtime publication.
begin;

-- The old own-signed policy permits SELECT * (including internal notes).
-- Residents now use minimized trusted projections instead of raw clinical rows.
drop policy health_encounters_select_resident_signed on public.health_encounters;

create or replace function public.resident_health_history_identity()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_resident_id uuid;
begin
  select resident.id into v_resident_id
  from public.profiles as profile
  join public.residents as resident on resident.linked_profile_id = profile.id
  where profile.id = auth.uid()
    and profile.role = 'resident'::public.app_role
    and profile.account_status = 'active'::public.account_status
    and profile.retired_at is null
    and resident.status = 'active'::public.resident_status
    and resident.archived_at is null;
  if v_resident_id is null then
    raise exception 'health history access unavailable' using errcode = '42501';
  end if;
  return v_resident_id;
end;
$$;

-- One authoritative finalization rule for list, detail and invalidation.
create or replace function public.resident_health_history_finalized(
  p_status public.health_encounter_status, p_signed_at timestamptz,
  p_signed_by uuid, p_archived_at timestamptz
)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_status in ('signed', 'amended')
    and p_signed_at is not null and p_signed_by is not null
    and p_archived_at is null, false)
$$;

create or replace function public.resident_health_history_list(
  p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_resident_id uuid := public.resident_health_history_identity();
  v_result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset < 0 then
    raise exception 'invalid health history pagination' using errcode = '22023';
  end if;
  with history as (
    select encounter.id, 'encounter'::text as kind, encounter.encounter_date as visit_date,
      appointment.service_type::text as service_type, encounter.encounter_type::text as encounter_type,
      concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix) as staff_name,
      'finalized'::text as status,
      (encounter.status = 'amended' or encounter.amends_encounter_id is not null) as is_amended
    from public.health_encounters as encounter
    join public.profiles as staff on staff.id = encounter.attending_staff_id
    left join public.appointments as appointment on appointment.id = encounter.appointment_id
    where encounter.resident_id = v_resident_id
      and public.resident_health_history_finalized(encounter.status, encounter.signed_at,
        encounter.signed_by, encounter.archived_at)
    union all
    select appointment.id, 'appointment'::text, appointment.scheduled_date,
      appointment.service_type::text, null::text,
      concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
      'completed'::text, false
    from public.appointments as appointment
    left join public.profiles as staff on staff.id = appointment.assigned_staff_id
    where appointment.resident_id = v_resident_id and appointment.status = 'completed'
      and appointment.archived_at is null
      and not exists (
        select 1 from public.health_encounters as encounter
        where encounter.appointment_id = appointment.id and encounter.resident_id = v_resident_id
          and public.resident_health_history_finalized(encounter.status, encounter.signed_at,
            encounter.signed_by, encounter.archived_at)
      )
    union all
    select booking.id, 'event'::text, event.event_date, event.service_type::text, null::text,
      concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
      'completed'::text, false
    from public.health_event_bookings as booking
    join public.health_service_events as event on event.id = booking.event_id
    left join public.profiles as staff on staff.id = booking.assigned_staff_id
    where booking.resident_id = v_resident_id and booking.booking_state = 'completed'
      and booking.completed_at is not null and event.archived_at is null
  ), page as (
    select history.* from history order by history.visit_date desc, history.kind, history.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.visit_date desc, page.kind, page.id)
      from page), '[]'::jsonb),
    'total', (select count(*) from history)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.resident_health_history_get(p_encounter_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_resident_id uuid := public.resident_health_history_identity();
  v_result jsonb;
begin
  -- ID is a selector, never identity authority. Missing, draft and foreign IDs
  -- have the same response, without confirming another Resident's record exists.
  select jsonb_build_object(
    'encounter_date', encounter.encounter_date,
    'service_type', appointment.service_type,
    'encounter_type', encounter.encounter_type::text,
    'status', 'finalized',
    'is_amended', (encounter.status = 'amended' or encounter.amends_encounter_id is not null),
    'staff_name', concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix),
    -- Match the existing approved Resident consultation-summary boundary.
    'summary', jsonb_strip_nulls(jsonb_build_object(
      'chief_complaint', nullif(btrim(encounter.chief_complaint), ''),
      'assessment', nullif(btrim(encounter.assessment), ''),
      'plan', nullif(btrim(encounter.plan), ''),
      'follow_up_date', encounter.follow_up_date
    )),
    'vital_signs', case when vitals.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'temperature_c', vitals.temperature_c,
      'systolic_bp', vitals.systolic_bp,
      'diastolic_bp', vitals.diastolic_bp,
      'pulse_bpm', vitals.pulse_bpm,
      'respiratory_rate', vitals.respiratory_rate,
      'oxygen_saturation', vitals.oxygen_saturation,
      'height_cm', vitals.height_cm,
      'weight_kg', vitals.weight_kg,
      'pain_score', vitals.pain_score
    )) end
  ) into v_result
  from public.health_encounters as encounter
  join public.profiles as staff on staff.id = encounter.attending_staff_id
  left join public.appointments as appointment on appointment.id = encounter.appointment_id
  left join public.vital_signs as vitals on vitals.encounter_id = encounter.id
  where encounter.id = p_encounter_id and encounter.resident_id = v_resident_id
    and public.resident_health_history_finalized(encounter.status, encounter.signed_at,
      encounter.signed_by, encounter.archived_at);
  return v_result;
end;
$$;

revoke all on function public.resident_health_history_identity(),
  public.resident_health_history_finalized(public.health_encounter_status, timestamptz, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.resident_health_history_list(integer, integer),
  public.resident_health_history_get(uuid) from public, anon, authenticated;
grant execute on function public.resident_health_history_list(integer, integer),
  public.resident_health_history_get(uuid) to authenticated;

alter table public.realtime_sync_events drop constraint realtime_sync_events_topic_valid;
alter table public.realtime_sync_events add constraint realtime_sync_events_topic_valid check (
  topic in ('profile', 'registration', 'registry', 'appointment', 'notification', 'announcement', 'health_history')
);

create or replace function public.emit_resident_health_history_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_visible boolean := false;
begin
  v_visible := public.resident_health_history_finalized(new.status, new.signed_at, new.signed_by, new.archived_at);
  if tg_op = 'UPDATE' then
    v_visible := v_visible or public.resident_health_history_finalized(old.status, old.signed_at, old.signed_by, old.archived_at);
  end if;
  if v_visible then
    select resident.linked_profile_id into v_recipient
    from public.residents as resident
    join public.profiles as profile on profile.id = resident.linked_profile_id
    where resident.id = new.resident_id and profile.role = 'resident'
      and profile.account_status = 'active' and profile.retired_at is null;
    if v_recipient is not null then
      -- Private cache signal only: no encounter ID or health content broadcast.
      perform public.emit_realtime_sync_event('health_history', null, v_recipient, null);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.emit_resident_health_history_sync() from public, anon, authenticated;
create trigger health_encounters_resident_history_sync
  after insert or update of status, signed_at, archived_at on public.health_encounters
  for each row execute function public.emit_resident_health_history_sync();

commit;
