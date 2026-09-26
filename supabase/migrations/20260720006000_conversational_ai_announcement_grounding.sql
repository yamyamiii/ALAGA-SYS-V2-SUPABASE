begin;

-- The return contract gains publication and expiration timestamps. PostgreSQL
-- requires dropping the existing function before changing RETURNS TABLE.
drop function public.ai_grounding_context(uuid, text[], integer);

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
  category text,
  publish_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  expires_at timestamptz,
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
      null::text as category,
      null::timestamptz as publish_at,
      null::timestamptz as event_start_at,
      null::timestamptz as event_end_at,
      null::timestamptz as expires_at,
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
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
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
      announcement.category::text,
      announcement.publish_at,
      announcement.event_start_at,
      announcement.event_end_at,
      announcement.expires_at,
      announcement.updated_at,
      row_number() over (
        order by announcement.publish_at desc, announcement.id
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
    grounding.category,
    grounding.publish_at,
    grounding.event_start_at,
    grounding.event_end_at,
    grounding.expires_at,
    grounding.updated_at
  from approved_grounding as grounding
  where grounding.source_rank <= p_per_source_limit
  order by grounding.source_order, grounding.source_rank;
end;
$$;

revoke all on function public.ai_grounding_context(uuid, text[], integer)
  from public, anon, authenticated;
grant execute on function public.ai_grounding_context(uuid, text[], integer)
  to service_role;

commit;
