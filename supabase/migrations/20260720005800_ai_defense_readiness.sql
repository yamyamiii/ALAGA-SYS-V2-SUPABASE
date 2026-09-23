-- Defense-readiness hardening for ALAGA AI. Public operational contact fields
-- are added to the existing service-role grounding contract, while a separate
-- bounded RPC exposes only the authenticated Resident's own minimal
-- appointment-status summary to the trusted Edge Function.

begin;

create or replace function public.ai_grounding_context(
  p_profile_id uuid,
  p_source_types text[],
  p_per_source_limit integer default 5
)
returns table (
  source_type text,
  source_label text,
  title text,
  content text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  if p_profile_id is null
    or p_source_types is null
    or cardinality(p_source_types) not between 1 and 3
    or p_per_source_limit is null
    or p_per_source_limit not between 1 and 8
    or exists (
      select 1
      from unnest(p_source_types) as requested(source_type)
      where requested.source_type is null
        or requested.source_type not in (
          'faq', 'health_center', 'announcement'
        )
    ) then
    raise exception 'invalid AI grounding request'
      using errcode = '22023';
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.account_status = 'active'::public.account_status;

  if not found or actor_role not in (
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role,
    'nurse'::public.app_role,
    'midwife'::public.app_role,
    'resident'::public.app_role
  ) then
    raise exception 'active supported profile required for AI grounding'
      using errcode = '42501';
  end if;

  return query
  with approved_grounding as (
    select
      'health_center'::text as source_type,
      'Health Center Information'::text as source_label,
      btrim(info.health_center_name)::text as title,
      left(
        concat_ws(
          E'\n',
          'Health center: ' || btrim(info.health_center_name),
          case
            when nullif(btrim(info.address), '') is not null
              then 'Address: ' || btrim(info.address)
            else 'Address: Verified information is unavailable.'
          end,
          case
            when nullif(btrim(info.contact_number), '') is not null
              then 'Contact number: ' || btrim(info.contact_number)
            else 'Contact number: Verified information is unavailable.'
          end,
          case
            when nullif(btrim(info.email), '') is not null
              then 'Public email: ' || btrim(info.email)
            else 'Public email: Verified information is unavailable.'
          end,
          case
            when cardinality(info.emergency_contacts) > 0
              then 'Emergency contacts: '
                || left(array_to_string(info.emergency_contacts, ', '), 1000)
            else 'Emergency contacts: Verified information is unavailable.'
          end,
          case
            when nullif(btrim(info.operating_hours), '') is not null
              then 'Operating hours: ' || btrim(info.operating_hours)
            else 'Operating hours: Verified information is unavailable.'
          end,
          case
            when cardinality(info.services_offered) > 0
              then 'Services offered: '
                || left(array_to_string(info.services_offered, ', '), 1000)
            else 'Services offered: Verified information is unavailable.'
          end
        ),
        5200
      )::text as content,
      info.updated_at,
      1::bigint as source_rank,
      1::integer as source_order
    from public.health_center_information as info
    where info.id
      and 'health_center' = any(p_source_types)

    union all

    select
      'faq'::text,
      'FAQ'::text,
      left(btrim(faq.question), 500)::text,
      left(btrim(faq.answer), 2000)::text,
      faq.updated_at,
      row_number() over (
        order by faq.display_order, faq.updated_at desc, faq.id
      ),
      2::integer
    from public.faq_entries as faq
    where faq.archived_at is null
      and 'faq' = any(p_source_types)

    union all

    select
      'announcement'::text,
      'Announcement'::text,
      left(btrim(announcement.title), 200)::text,
      left(btrim(announcement.content), 1600)::text,
      announcement.updated_at,
      row_number() over (
        order by
          announcement.is_pinned desc,
          announcement.publish_at desc,
          announcement.id
      ),
      3::integer
    from public.announcements as announcement
    where announcement.archived_at is null
      and announcement.publish_at <= pg_catalog.statement_timestamp()
      and (
        announcement.expires_at is null
        or announcement.expires_at > pg_catalog.statement_timestamp()
      )
      and 'announcement' = any(p_source_types)
  )
  select
    grounding.source_type,
    grounding.source_label,
    grounding.title,
    grounding.content,
    grounding.updated_at
  from approved_grounding as grounding
  where grounding.source_rank <= p_per_source_limit
  order by
    grounding.source_order,
    grounding.updated_at desc,
    grounding.title;
end;
$$;

revoke all on function public.ai_grounding_context(uuid, text[], integer)
  from public, anon, authenticated;
grant execute on function public.ai_grounding_context(uuid, text[], integer)
  to service_role;

create or replace function public.ai_resident_appointment_status(
  p_profile_id uuid
)
returns table (
  status text,
  service_type text,
  scheduled_date date,
  start_time time,
  schedule_changed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  linked_resident_ids uuid[];
  linked_resident_id uuid;
begin
  if p_profile_id is null then
    raise exception 'active linked resident profile required for AI appointment status'
      using errcode = '42501';
  end if;

  select array_agg(resident.id order by resident.id)
  into linked_resident_ids
  from public.profiles as profile
  join public.residents as resident
    on resident.linked_profile_id = profile.id
  where profile.id = p_profile_id
    and profile.account_status = 'active'::public.account_status
    and profile.role = 'resident'::public.app_role
    and resident.status = 'active'::public.resident_status
    and resident.archived_at is null;

  if cardinality(coalesce(linked_resident_ids, '{}'::uuid[])) <> 1 then
    raise exception 'active linked resident profile required for AI appointment status'
      using errcode = '42501';
  end if;

  linked_resident_id := linked_resident_ids[1];

  return query
  with eligible as materialized (
    select
      appointment.id,
      appointment.status,
      appointment.service_type,
      appointment.scheduled_date,
      appointment.start_time,
      appointment.updated_at,
      appointment.status in (
        'pending'::public.appointment_status,
        'confirmed'::public.appointment_status,
        'checked_in'::public.appointment_status,
        'in_progress'::public.appointment_status
      ) as is_current,
      appointment.request_source = 'resident'::public.appointment_request_source
        and (
          appointment.requested_date is distinct from appointment.scheduled_date
          or appointment.requested_start_time is distinct from appointment.start_time
        ) as schedule_changed
    from public.appointments as appointment
    where appointment.resident_id = linked_resident_id
      and appointment.archived_at is null
  )
  select
    candidate.status::text,
    candidate.service_type::text,
    candidate.scheduled_date,
    candidate.start_time,
    candidate.schedule_changed
  from eligible as candidate
  where candidate.is_current
    or not exists (
      select 1
      from eligible as current_candidate
      where current_candidate.is_current
    )
  order by
    candidate.is_current desc,
    candidate.scheduled_date desc,
    candidate.start_time desc,
    candidate.updated_at desc,
    candidate.id
  limit 5;
end;
$$;

revoke all on function public.ai_resident_appointment_status(uuid)
  from public, anon, authenticated;
grant execute on function public.ai_resident_appointment_status(uuid)
  to service_role;

commit;
