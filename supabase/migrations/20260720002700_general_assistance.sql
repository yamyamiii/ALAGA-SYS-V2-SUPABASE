-- Phase 8: general assistance, in-app notifications, and public information.
-- Browser access is RPC-only. Notifications and timeline rows contain concise
-- operational summaries, never clinical narratives or resident demographics.

begin;

create type public.announcement_category as enum (
  'general', 'vaccination', 'maternal', 'child_health',
  'clinic_schedule', 'medical_mission', 'emergency', 'advisory'
);
create type public.assistance_notification_type as enum (
  'appointment_approved', 'appointment_rejected',
  'appointment_rescheduled', 'appointment_cancelled',
  'appointment_checked_in', 'health_encounter_signed',
  'new_announcement', 'maternal_event', 'child_event'
);
create type public.faq_category as enum (
  'appointments', 'residents', 'health_records',
  'maternal_care', 'child_care', 'general'
);
create type public.inquiry_category as enum (
  'appointments', 'resident_records', 'health_records',
  'maternal_care', 'child_care', 'general', 'other'
);
create type public.inquiry_status as enum (
  'open', 'in_progress', 'resolved', 'closed'
);

create sequence public.inquiry_number_seq as bigint start with 1;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category public.announcement_category not null,
  content text not null,
  publish_at timestamptz not null,
  expires_at timestamptz,
  is_pinned boolean not null default false,
  request_key uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint announcements_title_length check (
    char_length(btrim(title)) between 3 and 200
  ),
  constraint announcements_content_length check (
    char_length(btrim(content)) between 3 and 10000
  ),
  constraint announcements_expiry_valid check (
    expires_at is null or expires_at > publish_at
  )
);
create unique index announcements_request_unique
  on public.announcements(created_by, request_key)
  where request_key is not null;
create index announcements_active_order_idx
  on public.announcements(is_pinned desc, publish_at desc, id)
  where archived_at is null;

create table public.assistance_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null
    references public.profiles(id) on delete cascade,
  notification_type public.assistance_notification_type not null,
  title text not null,
  summary text not null,
  source_type text not null,
  source_id uuid,
  action_path text,
  dedup_key text not null,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint assistance_notification_title_length check (
    char_length(btrim(title)) between 2 and 150
  ),
  constraint assistance_notification_summary_length check (
    char_length(btrim(summary)) between 2 and 500
  ),
  constraint assistance_notification_source_format check (
    source_type ~ '^[a-z][a-z0-9_]{0,62}$'
  ),
  constraint assistance_notification_path_safe check (
    action_path is null or (
      action_path ~ '^/[a-z0-9_/?=&-]{1,300}$'
      and action_path !~ '//'
    )
  ),
  constraint assistance_notification_dedup_length check (
    char_length(dedup_key) between 3 and 300
  ),
  constraint assistance_notification_read_valid check (
    read_at is null or read_at >= created_at
  ),
  unique(recipient_profile_id, dedup_key)
);
create index assistance_notifications_recipient_idx
  on public.assistance_notifications(
    recipient_profile_id, available_at desc, created_at desc, id
  );
create index assistance_notifications_unread_idx
  on public.assistance_notifications(recipient_profile_id, available_at desc)
  where read_at is null;

create table public.health_center_information (
  id boolean primary key default true check (id),
  barangay_name text not null default 'Brgy. Bagongpook',
  health_center_name text not null default 'Brgy. Bagongpook Health Center',
  address text,
  contact_number text,
  email text,
  operating_hours text,
  emergency_contacts text[] not null default '{}',
  services_offered text[] not null default '{}',
  doctors text[] not null default '{}',
  midwives text[] not null default '{}',
  nurses text[] not null default '{}',
  bhws text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint health_center_names_length check (
    char_length(btrim(barangay_name)) between 2 and 150
    and char_length(btrim(health_center_name)) between 2 and 200
  ),
  constraint health_center_text_lengths check (
    (address is null or char_length(btrim(address)) between 3 and 500)
    and (contact_number is null or char_length(btrim(contact_number)) between 7 and 50)
    and (email is null or char_length(btrim(email)) between 3 and 254)
    and (operating_hours is null or char_length(btrim(operating_hours)) between 3 and 2000)
  ),
  constraint health_center_array_limits check (
    cardinality(emergency_contacts) <= 20
    and cardinality(services_offered) <= 50
    and cardinality(doctors) <= 30
    and cardinality(midwives) <= 30
    and cardinality(nurses) <= 30
    and cardinality(bhws) <= 100
  )
);
insert into public.health_center_information(id) values (true);

create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  category public.faq_category not null,
  question text not null,
  answer text not null,
  display_order integer not null default 0,
  request_key uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint faq_question_length check (
    char_length(btrim(question)) between 3 and 500
  ),
  constraint faq_answer_length check (
    char_length(btrim(answer)) between 3 and 10000
  ),
  constraint faq_display_order_valid check (
    display_order between 0 and 100000
  )
);
create unique index faq_entries_request_unique
  on public.faq_entries(created_by, request_key)
  where request_key is not null;
create index faq_entries_active_order_idx
  on public.faq_entries(category, display_order, created_at, id)
  where archived_at is null;

create table public.resident_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null unique,
  resident_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  subject text not null,
  category public.inquiry_category not null,
  message text not null,
  status public.inquiry_status not null default 'open',
  staff_response text,
  handled_by uuid references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint inquiry_number_format check (
    inquiry_number ~ '^INQ-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint inquiry_subject_length check (
    char_length(btrim(subject)) between 3 and 200
  ),
  constraint inquiry_message_length check (
    char_length(btrim(message)) between 5 and 5000
  ),
  constraint inquiry_response_length check (
    staff_response is null
    or char_length(btrim(staff_response)) between 2 and 2000
  ),
  constraint inquiry_state_timestamps check (
    (status <> 'resolved' or resolved_at is not null)
    and (status <> 'closed' or closed_at is not null)
  )
);
create unique index resident_inquiries_request_unique
  on public.resident_inquiries(resident_profile_id, request_key)
  where request_key is not null;
create index resident_inquiries_staff_queue_idx
  on public.resident_inquiries(status, updated_at desc, id);
create index resident_inquiries_resident_idx
  on public.resident_inquiries(resident_profile_id, created_at desc, id);

alter table public.announcements enable row level security;
alter table public.assistance_notifications enable row level security;
alter table public.health_center_information enable row level security;
alter table public.faq_entries enable row level security;
alter table public.resident_inquiries enable row level security;

revoke all on table public.announcements, public.assistance_notifications,
  public.health_center_information, public.faq_entries,
  public.resident_inquiries from public, anon, authenticated;
revoke all on sequence public.inquiry_number_seq
  from public, anon, authenticated;

create or replace function public.assistance_require_role(
  p_roles public.app_role[]
)
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_role public.app_role := public.current_profile_role();
begin
  if actor_role is null or not (actor_role = any(p_roles)) then
    raise exception 'this assistance action is not authorized'
      using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create or replace function public.assistance_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_changed_fields text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_summary,
    case when p_changed_fields is null then null
      else jsonb_build_object('changed_fields', p_changed_fields) end
  );
end;
$$;

create or replace function public.assistance_add_notification(
  p_recipient uuid,
  p_type public.assistance_notification_type,
  p_title text,
  p_summary text,
  p_source_type text,
  p_source_id uuid,
  p_action_path text,
  p_dedup_key text,
  p_available_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null then return; end if;
  insert into public.assistance_notifications(
    recipient_profile_id, notification_type, title, summary,
    source_type, source_id, action_path, dedup_key, available_at
  )
  select p_recipient, p_type, btrim(p_title), btrim(p_summary),
    p_source_type, p_source_id, p_action_path, p_dedup_key, p_available_at
  where exists (
    select 1 from public.profiles p
    where p.id=p_recipient and p.account_status='active'
  )
  on conflict(recipient_profile_id, dedup_key) do nothing;
end;
$$;

create or replace function public.announcement_list(
  p_search text default null,
  p_category public.announcement_category default null,
  p_include_archived boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, title text, category public.announcement_category, content text,
  publish_at timestamptz, expires_at timestamptz, is_pinned boolean,
  created_by uuid, creator_name text, version bigint, archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  normalized text := nullif(btrim(p_search),'');
begin
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid announcement pagination';
  end if;
  if p_include_archived and actor_role not in ('admin','barangay_health_worker') then
    raise exception 'archived announcements require announcement management access'
      using errcode='42501';
  end if;
  return query
  select a.id,a.title,a.category,a.content,a.publish_at,a.expires_at,a.is_pinned,
    a.created_by,concat_ws(' ',p.first_name,p.last_name)::text,a.version,
    a.archived_at,count(*) over()
  from public.announcements a
  join public.profiles p on p.id=a.created_by
  where (p_category is null or a.category=p_category)
    and (normalized is null or a.title ilike '%'||normalized||'%'
      or a.content ilike '%'||normalized||'%')
    and (
      (p_include_archived and actor_role in ('admin','barangay_health_worker'))
      or (
        a.archived_at is null and a.publish_at <= now()
        and (a.expires_at is null or a.expires_at > now())
      )
    )
  order by a.is_pinned desc,a.publish_at desc,a.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.announcement_save(
  p_id uuid,
  p_title text,
  p_category public.announcement_category,
  p_content text,
  p_publish_at timestamptz,
  p_expires_at timestamptz,
  p_is_pinned boolean,
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
  current_record public.announcements%rowtype;
  saved_record public.announcements%rowtype;
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker']::public.app_role[]
  );
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_content),'') is null
    or char_length(btrim(p_title)) > 200
    or char_length(btrim(p_content)) > 10000
    or p_publish_at is null
    or (p_expires_at is not null and p_expires_at <= p_publish_at) then
    raise exception 'invalid announcement values';
  end if;
  if p_id is null then
    if p_request_key is null then raise exception 'announcement request key is required'; end if;
    select * into current_record from public.announcements
    where created_by=actor_id and request_key=p_request_key limit 1;
    if found then return query select current_record.id,current_record.version; return; end if;
    insert into public.announcements(
      title,category,content,publish_at,expires_at,is_pinned,
      request_key,created_by,updated_by
    ) values (
      btrim(p_title),p_category,btrim(p_content),p_publish_at,p_expires_at,
      p_is_pinned,p_request_key,actor_id,actor_id
    ) returning * into saved_record;
    perform public.assistance_audit(
      'announcement.created','announcements',saved_record.id,
      'Created announcement',null
    );
    insert into public.assistance_notifications(
      recipient_profile_id,notification_type,title,summary,source_type,
      source_id,action_path,dedup_key,available_at
    )
    select profile.id,'new_announcement','New announcement',
      saved_record.title,'announcements',saved_record.id,'/announcements',
      'announcement:'||saved_record.id::text,saved_record.publish_at
    from public.profiles profile
    where profile.account_status='active'
    on conflict(recipient_profile_id,dedup_key) do nothing;
  else
    select * into current_record from public.announcements
    where announcements.id=p_id for update;
    if not found then raise exception 'announcement not found' using errcode='P0002'; end if;
    if current_record.archived_at is not null then raise exception 'archived announcement cannot be edited'; end if;
    if current_record.version<>p_expected_version then raise exception 'announcement changed by another user'; end if;
    update public.announcements as target set
      title=btrim(p_title),category=p_category,content=btrim(p_content),
      publish_at=p_publish_at,expires_at=p_expires_at,is_pinned=p_is_pinned,
      updated_by=actor_id,updated_at=statement_timestamp(),
      version=target.version+1
    where target.id=p_id returning * into saved_record;
    perform public.assistance_audit(
      case when current_record.is_pinned is distinct from p_is_pinned
        then 'announcement.pinned' else 'announcement.updated' end,
      'announcements',saved_record.id,
      case when current_record.is_pinned is distinct from p_is_pinned
        then 'Changed announcement pin state' else 'Updated announcement' end,
      array['title','category','content','publish_at','expires_at','is_pinned']
    );
  end if;
  return query select saved_record.id,saved_record.version;
end;
$$;

create or replace function public.announcement_archive(
  p_id uuid, p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.announcements%rowtype;
  new_version bigint;
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker']::public.app_role[]
  );
  select * into current_record from public.announcements
  where id=p_id for update;
  if not found then raise exception 'announcement not found' using errcode='P0002'; end if;
  if current_record.version<>p_expected_version then raise exception 'announcement changed by another user'; end if;
  if current_record.archived_at is null then
    update public.announcements set archived_at=statement_timestamp(),
      updated_by=auth.uid(),updated_at=statement_timestamp(),version=version+1
    where id=p_id returning version into new_version;
    perform public.assistance_audit(
      'announcement.archived','announcements',p_id,'Archived announcement',null
    );
  end if;
  return coalesce(new_version,current_record.version);
end;
$$;

create or replace function public.assistance_notification_list(
  p_unread_only boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, notification_type public.assistance_notification_type,
  title text, summary text, action_path text, available_at timestamptz,
  read_at timestamptz, total_count bigint, unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid notification pagination';
  end if;
  return query
  select n.id,n.notification_type,n.title,n.summary,n.action_path,n.available_at,
    n.read_at,count(*) over(),
    count(*) filter(where n.read_at is null) over()
  from public.assistance_notifications n
  where n.recipient_profile_id=auth.uid() and n.available_at<=now()
    and (not p_unread_only or n.read_at is null)
  order by n.available_at desc,n.created_at desc,n.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.assistance_notification_read(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  update public.assistance_notifications set read_at=coalesce(read_at,statement_timestamp())
  where id=p_id and recipient_profile_id=auth.uid() and available_at<=now();
  if not found then raise exception 'notification not found' using errcode='P0002'; end if;
  perform public.assistance_audit(
    'notification.read','assistance_notifications',p_id,'Read notification',null
  );
end;
$$;

create or replace function public.assistance_notification_read_all()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare changed bigint;
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  update public.assistance_notifications set read_at=statement_timestamp()
  where recipient_profile_id=auth.uid() and read_at is null and available_at<=now();
  get diagnostics changed = row_count;
  perform public.assistance_audit(
    'notification.read_all','assistance_notifications',null,
    'Read all notifications',array['read_at']
  );
  return changed;
end;
$$;

create or replace function public.health_center_information_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  return (
    select to_jsonb(i)-'updated_by' from public.health_center_information i
    where i.id
  );
end;
$$;

create or replace function public.health_center_information_save(
  p_health_center_name text,p_address text,p_contact_number text,p_email text,
  p_operating_hours text,p_emergency_contacts text[],p_services_offered text[],
  p_doctors text[],p_midwives text[],p_nurses text[],p_bhws text[],
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare new_version bigint;
begin
  perform public.assistance_require_role(array['admin']::public.app_role[]);
  if nullif(btrim(p_health_center_name),'') is null
    or char_length(btrim(p_health_center_name)) > 200
    or cardinality(coalesce(p_emergency_contacts,'{}')) > 20
    or cardinality(coalesce(p_services_offered,'{}')) > 50
    or cardinality(coalesce(p_doctors,'{}')) > 30
    or cardinality(coalesce(p_midwives,'{}')) > 30
    or cardinality(coalesce(p_nurses,'{}')) > 30
    or cardinality(coalesce(p_bhws,'{}')) > 100
    or exists (
      select 1
      from unnest(
        coalesce(p_emergency_contacts,'{}')
        || coalesce(p_services_offered,'{}')
        || coalesce(p_doctors,'{}')
        || coalesce(p_midwives,'{}')
        || coalesce(p_nurses,'{}')
        || coalesce(p_bhws,'{}')
      ) as item(value)
      where nullif(btrim(item.value),'') is null
        or char_length(btrim(item.value)) > 500
    ) then
    raise exception 'invalid health center information';
  end if;
  update public.health_center_information set
    health_center_name=btrim(p_health_center_name),
    address=nullif(btrim(p_address),''),
    contact_number=nullif(btrim(p_contact_number),''),
    email=nullif(btrim(p_email),''),
    operating_hours=nullif(btrim(p_operating_hours),''),
    emergency_contacts=array(
      select btrim(item.value)
      from unnest(coalesce(p_emergency_contacts,'{}')) as item(value)
    ),
    services_offered=array(
      select btrim(item.value)
      from unnest(coalesce(p_services_offered,'{}')) as item(value)
    ),
    doctors=array(
      select btrim(item.value)
      from unnest(coalesce(p_doctors,'{}')) as item(value)
    ),
    midwives=array(
      select btrim(item.value)
      from unnest(coalesce(p_midwives,'{}')) as item(value)
    ),
    nurses=array(
      select btrim(item.value)
      from unnest(coalesce(p_nurses,'{}')) as item(value)
    ),
    bhws=array(
      select btrim(item.value)
      from unnest(coalesce(p_bhws,'{}')) as item(value)
    ),
    updated_by=auth.uid(),updated_at=statement_timestamp(),version=version+1
  where id and version=p_expected_version returning version into new_version;
  if not found then raise exception 'health center information changed by another user'; end if;
  perform public.assistance_audit(
    'health_center.updated','health_center_information',null,
    'Updated health center information',
    array['health_center_name','address','contact_number','email',
      'operating_hours','emergency_contacts','services_offered','team']
  );
  return new_version;
end;
$$;

create or replace function public.faq_list(
  p_search text default null,p_category public.faq_category default null,
  p_include_archived boolean default false,p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,category public.faq_category,question text,answer text,
  display_order integer,version bigint,archived_at timestamptz,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.assistance_require_role(
    array['admin','barangay_health_worker','nurse','midwife','resident']::public.app_role[]
  );
  normalized text := nullif(btrim(p_search),'');
begin
  if p_limit not between 1 and 100 or p_offset<0 then raise exception 'invalid FAQ pagination'; end if;
  if p_include_archived and actor_role<>'admin' then
    raise exception 'archived FAQs require administrator access' using errcode='42501';
  end if;
  return query
  select f.id,f.category,f.question,f.answer,f.display_order,f.version,
    f.archived_at,count(*) over()
  from public.faq_entries f
  where (p_category is null or f.category=p_category)
    and (normalized is null or f.question ilike '%'||normalized||'%'
      or f.answer ilike '%'||normalized||'%')
    and ((p_include_archived and actor_role='admin') or f.archived_at is null)
  order by f.category,f.display_order,f.created_at,f.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.faq_save(
  p_id uuid,p_category public.faq_category,p_question text,p_answer text,
  p_display_order integer,p_expected_version bigint,p_request_key uuid
)
returns table(id uuid,version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.faq_entries%rowtype;
  saved public.faq_entries%rowtype;
begin
  perform public.assistance_require_role(array['admin']::public.app_role[]);
  if nullif(btrim(p_question),'') is null or nullif(btrim(p_answer),'') is null
    or p_display_order not between 0 and 100000 then raise exception 'invalid FAQ values'; end if;
  if p_id is null then
    if p_request_key is null then raise exception 'FAQ request key is required'; end if;
    select * into current_record from public.faq_entries
    where created_by=auth.uid() and request_key=p_request_key limit 1;
    if found then return query select current_record.id,current_record.version; return; end if;
    insert into public.faq_entries(
      category,question,answer,display_order,request_key,created_by,updated_by
    ) values (
      p_category,btrim(p_question),btrim(p_answer),p_display_order,p_request_key,
      auth.uid(),auth.uid()
    ) returning * into saved;
    perform public.assistance_audit('faq.created','faq_entries',saved.id,'Created FAQ',null);
  else
    select * into current_record from public.faq_entries
    where faq_entries.id=p_id for update;
    if not found then raise exception 'FAQ not found' using errcode='P0002'; end if;
    if current_record.version<>p_expected_version then raise exception 'FAQ changed by another user'; end if;
    update public.faq_entries as target set category=p_category,question=btrim(p_question),
      answer=btrim(p_answer),display_order=p_display_order,updated_by=auth.uid(),
      updated_at=statement_timestamp(),version=target.version+1
    where target.id=p_id returning * into saved;
    perform public.assistance_audit('faq.updated','faq_entries',saved.id,'Updated FAQ',
      array['category','question','answer','display_order']);
  end if;
  return query select saved.id,saved.version;
end;
$$;

create or replace function public.faq_archive(p_id uuid,p_expected_version bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare new_version bigint;
begin
  perform public.assistance_require_role(array['admin']::public.app_role[]);
  update public.faq_entries set archived_at=statement_timestamp(),
    updated_by=auth.uid(),updated_at=statement_timestamp(),version=version+1
  where id=p_id and version=p_expected_version and archived_at is null
  returning version into new_version;
  if not found then raise exception 'FAQ not found or changed by another user'; end if;
  perform public.assistance_audit('faq.archived','faq_entries',p_id,'Archived FAQ',null);
  return new_version;
end;
$$;

create or replace function public.inquiry_create(
  p_subject text,p_category public.inquiry_category,p_message text,p_request_key uuid
)
returns table(id uuid,inquiry_number text,status public.inquiry_status,version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.resident_inquiries%rowtype;
  saved public.resident_inquiries%rowtype;
begin
  perform public.assistance_require_role(array['resident']::public.app_role[]);
  if p_request_key is null then raise exception 'inquiry request key is required'; end if;
  if not exists(
    select 1 from public.residents r where r.linked_profile_id=auth.uid()
      and r.status='active' and r.archived_at is null
  ) then raise exception 'an active linked resident record is required' using errcode='42501'; end if;
  select * into existing from public.resident_inquiries
  where resident_profile_id=auth.uid() and request_key=p_request_key limit 1;
  if found then
    if existing.subject is distinct from btrim(p_subject)
      or existing.category is distinct from p_category
      or existing.message is distinct from btrim(p_message) then
      raise exception 'inquiry request key was reused with different data';
    end if;
    return query select existing.id,existing.inquiry_number,existing.status,existing.version;
    return;
  end if;
  insert into public.resident_inquiries(
    inquiry_number,resident_profile_id,subject,category,message,request_key
  ) values (
    format('INQ-%s-%s',to_char(clock_timestamp(),'YYYY'),
      lpad(nextval('public.inquiry_number_seq')::text,6,'0')),
    auth.uid(),btrim(p_subject),p_category,btrim(p_message),p_request_key
  ) returning * into saved;
  perform public.assistance_audit(
    'inquiry.created','resident_inquiries',saved.id,'Created resident inquiry',null
  );
  return query select saved.id,saved.inquiry_number,saved.status,saved.version;
end;
$$;

create or replace function public.inquiry_list(
  p_status public.inquiry_status default null,p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,inquiry_number text,subject text,category public.inquiry_category,
  message text,status public.inquiry_status,staff_response text,
  created_at timestamptz,updated_at timestamptz,version bigint,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_role public.app_role := public.assistance_require_role(
  array['admin','barangay_health_worker','resident']::public.app_role[]
);
begin
  if p_limit not between 1 and 50 or p_offset<0 then raise exception 'invalid inquiry pagination'; end if;
  return query
  select i.id,i.inquiry_number,i.subject,i.category,i.message,i.status,
    i.staff_response,i.created_at,i.updated_at,i.version,count(*) over()
  from public.resident_inquiries i
  where (p_status is null or i.status=p_status)
    and (actor_role in ('admin','barangay_health_worker')
      or i.resident_profile_id=auth.uid())
  order by case i.status when 'open' then 1 when 'in_progress' then 2
    when 'resolved' then 3 else 4 end,i.updated_at desc,i.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.inquiry_update_status(
  p_id uuid,p_status public.inquiry_status,p_staff_response text,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.resident_inquiries%rowtype;
  new_version bigint;
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker']::public.app_role[]
  );
  select * into current_record from public.resident_inquiries where id=p_id for update;
  if not found then raise exception 'inquiry not found' using errcode='P0002'; end if;
  if current_record.version<>p_expected_version then raise exception 'inquiry changed by another user'; end if;
  if current_record.status='closed' then raise exception 'closed inquiry cannot be changed'; end if;
  update public.resident_inquiries set status=p_status,
    staff_response=nullif(btrim(p_staff_response),''),
    handled_by=auth.uid(),updated_at=statement_timestamp(),version=version+1,
    resolved_at=case when p_status='resolved' then statement_timestamp()
      else resolved_at end,
    closed_at=case when p_status='closed' then statement_timestamp()
      else closed_at end
  where id=p_id returning version into new_version;
  perform public.assistance_audit(
    'inquiry.status_changed','resident_inquiries',p_id,
    'Changed inquiry status',array['status','staff_response']
  );
  return new_version;
end;
$$;

create or replace function public.assistance_activity_list(
  p_limit integer default 30,p_offset integer default 0
)
returns table(
  event_id text,event_type text,title text,summary text,
  occurred_at timestamptz,action_path text,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_role public.app_role := public.assistance_require_role(
  array['admin','resident']::public.app_role[]
);
begin
  if p_limit not between 1 and 100 or p_offset<0 then raise exception 'invalid activity pagination'; end if;
  if actor_role='admin' then
    return query
    select ('audit:'||a.id::text),a.action,
      initcap(replace(a.action,'.',' '))::text,a.summary,a.created_at,
      case when a.entity_type='appointments' then '/appointments'
        when a.entity_type='health_encounters' then '/health-records'
        when a.entity_type like 'maternal_%' or a.entity_type like 'child_%'
          then '/maternal-child-care'
        when a.entity_type='announcements' then '/announcements'
        when a.entity_type='resident_inquiries' then '/contact'
        when a.entity_type='faq_entries' then '/faq'
        when a.entity_type='health_center_information' then '/health-center'
        when a.entity_type='assistance_notifications' then '/notifications'
        when a.entity_type='households' then '/households'
        when a.entity_type='residents' then '/residents'
        when a.entity_type='profiles' then '/user-management'
        else null end::text,
      count(*) over()
    from public.audit_logs a
    where a.action not in ('notification.read','notification.read_all')
    order by a.created_at desc,a.id desc limit p_limit offset p_offset;
  else
    return query
    with events as (
      select ('audit:'||a.id::text) event_id,a.action event_type,
        case a.action
          when 'appointment.created' then 'Appointment created'
          when 'appointment.resident_requested' then 'Appointment requested'
          when 'appointment.request_confirmed' then 'Appointment confirmed'
          when 'appointment.request_rejected' then 'Appointment request rejected'
          when 'appointment.confirmed' then 'Appointment confirmed'
          when 'appointment.completed' then 'Appointment completed'
          when 'appointment.rescheduled' then 'Appointment rescheduled'
          when 'appointment.resident_cancelled' then 'Appointment cancelled'
          when 'appointment.cancelled' then 'Appointment cancelled'
          else 'Appointment updated' end::text title,
        'Your appointment activity was updated.'::text summary,
        a.created_at occurred_at,'/appointments'::text action_path
      from public.audit_logs a
      join public.appointments ap on ap.id=a.entity_id
      join public.residents r on r.id=ap.resident_id
      where r.linked_profile_id=auth.uid() and a.entity_type='appointments'
        and a.action in (
          'appointment.created','appointment.resident_requested',
          'appointment.request_confirmed','appointment.request_rejected',
          'appointment.confirmed','appointment.completed',
          'appointment.rescheduled','appointment.resident_cancelled',
          'appointment.cancelled'
        )
      union all
      select ('audit:'||a.id::text),a.action,'Health record signed',
        'A clinical encounter was signed.',a.created_at,'/health-records'
      from public.audit_logs a
      join public.health_encounters e on e.id=a.entity_id
      join public.residents r on r.id=e.resident_id
      where r.linked_profile_id=auth.uid() and a.entity_type='health_encounters'
        and a.action='encounter.signed'
      union all
      select ('notification:'||n.id::text),n.notification_type::text,n.title,
        n.summary,n.available_at,n.action_path
      from public.assistance_notifications n
      where n.recipient_profile_id=auth.uid() and n.available_at<=now()
        and n.notification_type in ('maternal_event','child_event','new_announcement')
    )
    select e.event_id,e.event_type,e.title,e.summary,e.occurred_at,e.action_path,
      count(*) over()
    from events e order by e.occurred_at desc,e.event_id
    limit p_limit offset p_offset;
  end if;
end;
$$;

-- Independent notification triggers reuse trusted row relationships. They do
-- not alter existing audit triggers or event outboxes.
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
begin
  if tg_op<>'UPDATE' or old.status=new.status then return new; end if;
  select r.linked_profile_id into resident_profile from public.residents r
  where r.id=new.resident_id;
  if new.status='confirmed' then event_type:='appointment_approved'; event_title:='Appointment approved';
  elsif new.status='rescheduled' then event_type:='appointment_rescheduled'; event_title:='Appointment rescheduled';
  elsif new.status='cancelled' and old.status='pending'
    and new.request_source='resident' and public.current_profile_role()<>'resident'
    then event_type:='appointment_rejected'; event_title:='Appointment request rejected';
  elsif new.status='cancelled' then event_type:='appointment_cancelled'; event_title:='Appointment cancelled';
  elsif new.status='checked_in' then event_type:='appointment_checked_in'; event_title:='Appointment checked in';
  else return new;
  end if;
  perform public.assistance_add_notification(
    resident_profile,event_type,event_title,
    'Appointment '||new.appointment_number||' was updated.',
    'appointments',new.id,'/appointments',
    'appointment:'||new.id::text||':'||new.status::text,now()
  );
  if new.assigned_staff_id is not null and new.assigned_staff_id<>auth.uid() then
    perform public.assistance_add_notification(
      new.assigned_staff_id,event_type,event_title,
      'An assigned appointment was updated.','appointments',new.id,
      '/appointments','staff-appointment:'||new.id::text||':'||new.status::text,now()
    );
  end if;
  return new;
end;
$$;
create trigger appointments_assistance_notifications
  after update of status on public.appointments
  for each row execute function public.assistance_notify_appointment();

create or replace function public.assistance_notify_health_encounter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid;
begin
  if old.status<>new.status and new.status='signed' then
    select r.linked_profile_id into recipient from public.residents r
    where r.id=new.resident_id;
    perform public.assistance_add_notification(
      recipient,'health_encounter_signed','Health encounter signed',
      'A health center encounter was signed.','health_encounters',new.id,
      '/health-records','encounter:'||new.id::text||':signed',now()
    );
  end if;
  return new;
end;
$$;
create trigger health_encounters_assistance_notifications
  after update of status on public.health_encounters
  for each row execute function public.assistance_notify_health_encounter();

create or replace function public.assistance_notify_maternal_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  resident_id uuid;
  recipient uuid;
  event_type public.assistance_notification_type;
  title_text text;
begin
  if tg_table_name like 'maternal_%' then
    event_type:='maternal_event'; title_text:='Maternal care updated';
    if tg_table_name='maternal_pregnancies' then
      resident_id := (row_data->>'resident_id')::uuid;
    else
      select p.resident_id into resident_id from public.maternal_pregnancies p
      where p.id=(row_data->>'pregnancy_id')::uuid;
    end if;
  else
    event_type:='child_event'; title_text:='Child care updated';
    if tg_table_name='child_health_profiles' then
      resident_id := (row_data->>'child_resident_id')::uuid;
    else
      select c.child_resident_id into resident_id from public.child_health_profiles c
      where c.id=(row_data->>'child_profile_id')::uuid;
    end if;
  end if;
  select r.linked_profile_id into recipient from public.residents r where r.id=resident_id;
  perform public.assistance_add_notification(
    recipient,event_type,title_text,'A care record was updated.',
    tg_table_name,new.id,'/maternal-child-care',
    tg_table_name||':'||new.id::text||':'||new.version::text,now()
  );
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'maternal_pregnancies','maternal_prenatal_visits',
    'maternal_delivery_outcomes','maternal_postnatal_visits',
    'child_health_profiles','child_growth_measurements',
    'child_immunizations','child_health_visits'
  ] loop
    execute format(
      'create trigger %I_assistance_notifications
       after insert or update on public.%I for each row
       execute function public.assistance_notify_maternal_child()',
      table_name,table_name
    );
  end loop;
end;
$$;

revoke all on function public.assistance_require_role(public.app_role[]),
  public.assistance_audit(text,text,uuid,text,text[]),
  public.assistance_add_notification(uuid,public.assistance_notification_type,text,text,text,uuid,text,text,timestamptz),
  public.assistance_notify_appointment(),
  public.assistance_notify_health_encounter(),
  public.assistance_notify_maternal_child()
  from public,anon,authenticated;

revoke all on function public.announcement_list(text,public.announcement_category,boolean,integer,integer),
  public.announcement_save(uuid,text,public.announcement_category,text,timestamptz,timestamptz,boolean,bigint,uuid),
  public.announcement_archive(uuid,bigint),
  public.assistance_notification_list(boolean,integer,integer),
  public.assistance_notification_read(uuid),
  public.assistance_notification_read_all(),
  public.health_center_information_get(),
  public.health_center_information_save(text,text,text,text,text,text[],text[],text[],text[],text[],text[],bigint),
  public.faq_list(text,public.faq_category,boolean,integer,integer),
  public.faq_save(uuid,public.faq_category,text,text,integer,bigint,uuid),
  public.faq_archive(uuid,bigint),
  public.inquiry_create(text,public.inquiry_category,text,uuid),
  public.inquiry_list(public.inquiry_status,integer,integer),
  public.inquiry_update_status(uuid,public.inquiry_status,text,bigint),
  public.assistance_activity_list(integer,integer)
  from public,anon,authenticated;

grant execute on function public.announcement_list(text,public.announcement_category,boolean,integer,integer),
  public.announcement_save(uuid,text,public.announcement_category,text,timestamptz,timestamptz,boolean,bigint,uuid),
  public.announcement_archive(uuid,bigint),
  public.assistance_notification_list(boolean,integer,integer),
  public.assistance_notification_read(uuid),
  public.assistance_notification_read_all(),
  public.health_center_information_get(),
  public.health_center_information_save(text,text,text,text,text,text[],text[],text[],text[],text[],text[],bigint),
  public.faq_list(text,public.faq_category,boolean,integer,integer),
  public.faq_save(uuid,public.faq_category,text,text,integer,bigint,uuid),
  public.faq_archive(uuid,bigint),
  public.inquiry_create(text,public.inquiry_category,text,uuid),
  public.inquiry_list(public.inquiry_status,integer,integer),
  public.inquiry_update_status(uuid,public.inquiry_status,text,bigint),
  public.assistance_activity_list(integer,integer)
  to authenticated,service_role;

commit;
