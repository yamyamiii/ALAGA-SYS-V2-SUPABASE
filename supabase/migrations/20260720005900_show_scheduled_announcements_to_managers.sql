-- Complete the announcement scheduling model without conflating publication,
-- activity, and expiration timestamps. Managers receive a complete operational
-- read model while public roles remain publication-bound.

begin;

alter table public.announcements
  add column event_start_at timestamptz,
  add column event_end_at timestamptz,
  add constraint announcements_event_window_valid check (
    event_end_at is null
    or (
      event_start_at is not null
      and event_end_at > event_start_at
    )
  );

drop function public.announcement_list(
  text,
  public.announcement_category,
  boolean,
  integer,
  integer
);

create or replace function public.announcement_list(
  p_search text default null,
  p_category public.announcement_category default null,
  p_include_archived boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  title text,
  category public.announcement_category,
  content text,
  publish_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  expires_at timestamptz,
  is_pinned boolean,
  created_by uuid,
  creator_name text,
  version bigint,
  archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.assistance_require_role(
    array[
      'admin',
      'barangay_health_worker',
      'nurse',
      'midwife',
      'resident'
    ]::public.app_role[]
  );
  normalized text := nullif(btrim(p_search), '');
begin
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid announcement pagination';
  end if;

  if p_include_archived
    and actor_role not in ('admin', 'barangay_health_worker') then
    raise exception 'archived announcements require announcement management access'
      using errcode = '42501';
  end if;

  return query
  select
    announcement.id,
    announcement.title,
    announcement.category,
    announcement.content,
    announcement.publish_at,
    announcement.event_start_at,
    announcement.event_end_at,
    announcement.expires_at,
    announcement.is_pinned,
    announcement.created_by,
    concat_ws(' ', creator.first_name, creator.last_name)::text,
    announcement.version,
    announcement.archived_at,
    count(*) over()
  from public.announcements as announcement
  join public.profiles as creator
    on creator.id = announcement.created_by
  where (p_category is null or announcement.category = p_category)
    and (
      normalized is null
      or announcement.title ilike '%' || normalized || '%'
      or announcement.content ilike '%' || normalized || '%'
    )
    and (
      (
        actor_role in ('admin', 'barangay_health_worker')
        and (
          announcement.archived_at is null
          or p_include_archived
        )
      )
      or (
        actor_role not in ('admin', 'barangay_health_worker')
        and announcement.archived_at is null
        and announcement.publish_at <= pg_catalog.statement_timestamp()
        and (
          announcement.expires_at is null
          or announcement.expires_at > pg_catalog.statement_timestamp()
        )
      )
    )
  order by
    announcement.is_pinned desc,
    announcement.publish_at desc,
    announcement.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.announcement_list(
  text,
  public.announcement_category,
  boolean,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.announcement_list(
  text,
  public.announcement_category,
  boolean,
  integer,
  integer
) to authenticated, service_role;

drop function public.announcement_save(
  uuid,
  text,
  public.announcement_category,
  text,
  timestamptz,
  timestamptz,
  boolean,
  bigint,
  uuid
);

create or replace function public.announcement_save(
  p_id uuid,
  p_title text,
  p_category public.announcement_category,
  p_content text,
  p_publish_at timestamptz,
  p_event_start_at timestamptz,
  p_event_end_at timestamptz,
  p_expires_at timestamptz,
  p_is_pinned boolean,
  p_publish_now boolean,
  p_expected_version bigint,
  p_request_key uuid
)
returns table(id uuid, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  operation_time timestamptz := pg_catalog.statement_timestamp();
  effective_publish_at timestamptz;
  current_record public.announcements%rowtype;
  saved_record public.announcements%rowtype;
begin
  perform public.assistance_require_role(
    array['admin', 'barangay_health_worker']::public.app_role[]
  );

  if nullif(btrim(p_title), '') is null
    or nullif(btrim(p_content), '') is null
    or char_length(btrim(p_title)) > 200
    or char_length(btrim(p_content)) > 10000
    or p_publish_now is null
    or (
      p_event_end_at is not null
      and (
        p_event_start_at is null
        or p_event_end_at <= p_event_start_at
      )
    ) then
    raise exception 'invalid announcement values';
  end if;

  if p_id is null then
    if p_request_key is null then
      raise exception 'announcement request key is required';
    end if;

    select *
    into current_record
    from public.announcements as announcement
    where announcement.created_by = actor_id
      and announcement.request_key = p_request_key
    limit 1;

    if found then
      return query select current_record.id, current_record.version;
      return;
    end if;

    effective_publish_at := case
      when p_publish_now then operation_time
      else p_publish_at
    end;

    if effective_publish_at is null
      or (
        p_expires_at is not null
        and p_expires_at <= effective_publish_at
      ) then
      raise exception 'invalid announcement values';
    end if;

    insert into public.announcements(
      title,
      category,
      content,
      publish_at,
      event_start_at,
      event_end_at,
      expires_at,
      is_pinned,
      request_key,
      created_by,
      updated_by
    ) values (
      btrim(p_title),
      p_category,
      btrim(p_content),
      effective_publish_at,
      p_event_start_at,
      p_event_end_at,
      p_expires_at,
      p_is_pinned,
      p_request_key,
      actor_id,
      actor_id
    )
    returning * into saved_record;

    perform public.assistance_audit(
      'announcement.created',
      'announcements',
      saved_record.id,
      'Created announcement',
      null
    );

    insert into public.assistance_notifications(
      recipient_profile_id,
      notification_type,
      title,
      summary,
      source_type,
      source_id,
      action_path,
      dedup_key,
      available_at
    )
    select
      profile.id,
      'new_announcement',
      'New announcement',
      saved_record.title,
      'announcements',
      saved_record.id,
      '/announcements',
      'announcement:' || saved_record.id::text,
      saved_record.publish_at
    from public.profiles as profile
    where profile.account_status = 'active'
    on conflict(recipient_profile_id, dedup_key) do nothing;
  else
    select *
    into current_record
    from public.announcements as announcement
    where announcement.id = p_id
    for update;

    if not found then
      raise exception 'announcement not found' using errcode = 'P0002';
    end if;
    if current_record.archived_at is not null then
      raise exception 'archived announcement cannot be edited';
    end if;
    if current_record.version <> p_expected_version then
      raise exception 'announcement changed by another user';
    end if;

    effective_publish_at := case
      when p_publish_now and current_record.publish_at <= operation_time
        then current_record.publish_at
      when p_publish_now then operation_time
      else p_publish_at
    end;

    if effective_publish_at is null
      or (
        p_expires_at is not null
        and p_expires_at <= effective_publish_at
      ) then
      raise exception 'invalid announcement values';
    end if;

    update public.announcements as target
    set
      title = btrim(p_title),
      category = p_category,
      content = btrim(p_content),
      publish_at = effective_publish_at,
      event_start_at = p_event_start_at,
      event_end_at = p_event_end_at,
      expires_at = p_expires_at,
      is_pinned = p_is_pinned,
      updated_by = actor_id,
      updated_at = operation_time,
      version = target.version + 1
    where target.id = p_id
    returning * into saved_record;

    perform public.assistance_audit(
      case
        when current_record.is_pinned is distinct from p_is_pinned
          then 'announcement.pinned'
        else 'announcement.updated'
      end,
      'announcements',
      saved_record.id,
      case
        when current_record.is_pinned is distinct from p_is_pinned
          then 'Changed announcement pin state'
        else 'Updated announcement'
      end,
      array[
        'title',
        'category',
        'content',
        'publish_at',
        'event_start_at',
        'event_end_at',
        'expires_at',
        'is_pinned'
      ]
    );
  end if;

  return query select saved_record.id, saved_record.version;
end;
$$;

revoke all on function public.announcement_save(
  uuid,
  text,
  public.announcement_category,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  boolean,
  bigint,
  uuid
) from public, anon, authenticated;
grant execute on function public.announcement_save(
  uuid,
  text,
  public.announcement_category,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  boolean,
  bigint,
  uuid
) to authenticated, service_role;

create or replace function public.sync_announcement_notification_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assistance_notifications as notification
  set
    summary = new.title,
    available_at = new.publish_at
  where notification.source_type = 'announcements'
    and notification.source_id = new.id;

  return new;
end;
$$;

revoke all on function public.sync_announcement_notification_schedule()
  from public, anon, authenticated;

drop trigger if exists announcements_notification_schedule_sync
  on public.announcements;
create trigger announcements_notification_schedule_sync
  after update of title, publish_at
  on public.announcements
  for each row
  when (
    old.title is distinct from new.title
    or old.publish_at is distinct from new.publish_at
  )
  execute function public.sync_announcement_notification_schedule();

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
  event_start_at timestamptz,
  event_end_at timestamptz,
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
      null::timestamptz as event_start_at,
      null::timestamptz as event_end_at,
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
      announcement.event_start_at,
      announcement.event_end_at,
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
    grounding.category,
    grounding.event_start_at,
    grounding.event_end_at,
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

commit;
