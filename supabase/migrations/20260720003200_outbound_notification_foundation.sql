-- Release candidate: provider-neutral outbound notification foundation.
-- External delivery is opt-in, asynchronous, and contains only allowlisted
-- operational values. Core workflows never depend on queue or provider success.

begin;

create type public.notification_locale as enum ('en', 'fil');
create type public.outbound_notification_channel as enum ('email', 'sms');
create type public.outbound_notification_status as enum (
  'pending', 'processing', 'sent', 'failed', 'cancelled'
);
create type public.outbound_delivery_outcome as enum (
  'sent', 'temporary_failure', 'permanent_failure', 'disabled'
);
create type public.outbound_notification_event as enum (
  'appointment_request_received', 'appointment_confirmed',
  'appointment_rejected', 'appointment_rescheduled',
  'appointment_cancelled', 'appointment_reminder',
  'prenatal_reminder', 'postnatal_reminder',
  'child_appointment_reminder', 'immunization_reminder',
  'signed_document_available', 'inquiry_updated',
  'important_announcement'
);
create type public.outbound_notification_template as enum (
  'appointment_request_received', 'appointment_confirmed',
  'appointment_rejected', 'appointment_rescheduled',
  'appointment_cancelled', 'appointment_reminder',
  'inquiry_updated', 'important_announcement',
  'signed_document_available'
);

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  appointment_updates_enabled boolean not null default true,
  appointment_reminders_enabled boolean not null default true,
  announcement_enabled boolean not null default true,
  inquiry_updates_enabled boolean not null default true,
  maternal_child_reminders_enabled boolean not null default true,
  document_updates_enabled boolean not null default true,
  locale public.notification_locale not null default 'en',
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.outbound_notification_channel_status (
  channel public.outbound_notification_channel primary key,
  provider_configured boolean not null default false,
  provider_label text,
  updated_at timestamptz not null default statement_timestamp(),
  constraint outbound_channel_provider_label_safe check (
    provider_label is null
    or provider_label ~ '^[a-z][a-z0-9_-]{1,30}$'
  )
);
insert into public.outbound_notification_channel_status(channel)
values ('email'), ('sms');

create table public.outbound_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  event_type public.outbound_notification_event not null,
  source_type text not null,
  source_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  channel public.outbound_notification_channel not null,
  template_key public.outbound_notification_template not null,
  locale public.notification_locale not null,
  safe_variables jsonb not null default '{}'::jsonb,
  status public.outbound_notification_status not null default 'pending',
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 5,
  manual_retry_count smallint not null default 0,
  next_attempt_at timestamptz not null default statement_timestamp(),
  locked_at timestamptz,
  locked_by uuid,
  provider_message_reference text,
  destination_hint text,
  failure_category text,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  constraint outbound_jobs_event_key_safe check (
    char_length(event_key) between 3 and 300
    and event_key ~ '^[a-z0-9:._-]+$'
  ),
  constraint outbound_jobs_source_type_safe check (
    source_type ~ '^[a-z][a-z0-9_]{1,62}$'
  ),
  constraint outbound_jobs_attempt_bounds check (
    attempt_count between 0 and 7
    and max_attempts between 1 and 7
    and attempt_count <= max_attempts
    and manual_retry_count between 0 and 2
  ),
  constraint outbound_jobs_lock_consistent check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  ),
  constraint outbound_jobs_terminal_timestamps check (
    (status = 'sent' and sent_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and sent_at is null)
    or (status in ('pending', 'processing', 'failed') and sent_at is null and cancelled_at is null)
  ),
  constraint outbound_jobs_provider_reference_length check (
    provider_message_reference is null
    or char_length(provider_message_reference) <= 500
  ),
  constraint outbound_jobs_destination_masked check (
    destination_hint is null
    or (char_length(destination_hint) <= 254 and destination_hint like '%*%')
  ),
  constraint outbound_jobs_failure_category_safe check (
    failure_category is null
    or failure_category ~ '^[a-z][a-z0-9_]{1,49}$'
  ),
  unique(recipient_profile_id, channel, event_key)
);

create table public.notification_delivery_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.outbound_notification_jobs(id) on delete restrict,
  attempt_number smallint not null,
  channel public.outbound_notification_channel not null,
  outcome public.outbound_delivery_outcome not null,
  failure_category text,
  latency_ms integer not null,
  attempted_at timestamptz not null default statement_timestamp(),
  constraint notification_attempt_number_valid check (
    attempt_number between 1 and 7
  ),
  constraint notification_attempt_latency_valid check (
    latency_ms between 0 and 120000
  ),
  constraint notification_attempt_failure_safe check (
    failure_category is null
    or failure_category ~ '^[a-z][a-z0-9_]{1,49}$'
  ),
  unique(job_id, attempt_number)
);

create index outbound_jobs_ready_idx
  on public.outbound_notification_jobs(channel, next_attempt_at, created_at, id)
  where status = 'pending';
create index outbound_jobs_processing_idx
  on public.outbound_notification_jobs(locked_at, id)
  where status = 'processing';
create index outbound_jobs_recipient_idx
  on public.outbound_notification_jobs(recipient_profile_id, created_at desc, id);
create index outbound_jobs_source_idx
  on public.outbound_notification_jobs(source_type, source_id, status);
create index notification_attempts_rate_idx
  on public.notification_delivery_attempts(channel, attempted_at desc, job_id);

alter table public.notification_preferences enable row level security;
alter table public.outbound_notification_channel_status enable row level security;
alter table public.outbound_notification_jobs enable row level security;
alter table public.notification_delivery_attempts enable row level security;

revoke all on table public.notification_preferences,
  public.outbound_notification_channel_status,
  public.outbound_notification_jobs,
  public.notification_delivery_attempts from public, anon, authenticated;
revoke all on sequence public.notification_delivery_attempts_id_seq
  from public, anon, authenticated;

create or replace function public.notification_normalize_email(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(p_value)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
      and char_length(btrim(p_value)) <= 254
      then lower(btrim(p_value))
    else null
  end
$$;

create or replace function public.notification_normalize_ph_mobile(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') value
  )
  select case
    when value ~ '^09[0-9]{9}$' then '+63' || substr(value, 2)
    when value ~ '^639[0-9]{9}$' then '+' || value
    else null
  end
  from normalized
$$;

create or replace function public.notification_mask_email(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when public.notification_normalize_email(p_value) is null then null
    else left(split_part(lower(btrim(p_value)), '@', 1), 1)
      || repeat('*', greatest(char_length(split_part(lower(btrim(p_value)), '@', 1)) - 1, 3))
      || '@' || split_part(lower(btrim(p_value)), '@', 2)
  end
$$;

create or replace function public.notification_mask_mobile(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when public.notification_normalize_ph_mobile(p_value) is null then null
    else left(public.notification_normalize_ph_mobile(p_value), 3)
      || '******' || right(public.notification_normalize_ph_mobile(p_value), 3)
  end
$$;

create or replace function public.notification_template_variables_valid(
  p_template public.outbound_notification_template,
  p_variables jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  expected_keys text[];
  actual_keys text[];
  variable_key text;
  variable_value text;
begin
  if jsonb_typeof(p_variables) <> 'object' then return false; end if;
  expected_keys := case p_template
    when 'appointment_confirmed' then array['date', 'time']
    when 'appointment_rescheduled' then array['date', 'time']
    when 'appointment_reminder' then array['date', 'time']
    when 'inquiry_updated' then array['status']
    when 'important_announcement' then array['title']
    when 'signed_document_available' then array['document_kind']
    else array[]::text[]
  end;
  select coalesce(array_agg(variable_key order by variable_key), array[]::text[])
  into actual_keys
  from jsonb_object_keys(p_variables) as keys(variable_key);
  if actual_keys is distinct from expected_keys then return false; end if;
  foreach variable_key in array actual_keys loop
    if jsonb_typeof(p_variables -> variable_key) <> 'string' then return false; end if;
    variable_value := p_variables ->> variable_key;
    if char_length(variable_value) > 200 or variable_value ~ '[\r\n]' then return false; end if;
  end loop;
  if p_template in ('appointment_confirmed', 'appointment_rescheduled', 'appointment_reminder') then
    return (p_variables ->> 'date') ~ '^[A-Za-z]+ [0-9]{1,2}, [0-9]{4}$'
      and (p_variables ->> 'time') ~ '^[0-9]{1,2}:[0-9]{2} (AM|PM)$';
  elsif p_template = 'inquiry_updated' then
    return (p_variables ->> 'status') in ('Open', 'In progress', 'Resolved', 'Closed');
  elsif p_template = 'signed_document_available' then
    return (p_variables ->> 'document_kind') in ('consultation summary', 'referral form');
  elsif p_template = 'important_announcement' then
    return char_length(btrim(p_variables ->> 'title')) between 3 and 200;
  end if;
  return true;
end;
$$;

alter table public.outbound_notification_jobs
  add constraint outbound_jobs_safe_variables check (
    public.notification_template_variables_valid(template_key, safe_variables)
  );

create or replace function public.notification_recipient_eligible(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.account_status = 'active'::public.account_status
      and (
        p.role <> 'resident'::public.app_role
        or exists (
          select 1 from public.residents r
          where r.linked_profile_id = p.id
            and r.status = 'active'::public.resident_status
            and r.archived_at is null
        )
      )
    from public.profiles p where p.id = p_profile_id
  ), false)
$$;

create or replace function public.notification_event_preference_enabled(
  p_profile_id uuid,
  p_event_type public.outbound_notification_event,
  p_template public.outbound_notification_template,
  p_channel public.outbound_notification_channel
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.notification_recipient_eligible(p_profile_id)
    and case p_channel
      when 'email' then coalesce(pref.email_enabled, false)
      when 'sms' then coalesce(pref.sms_enabled, false)
    end
    and case
      when p_template in (
        'appointment_request_received', 'appointment_confirmed',
        'appointment_rejected', 'appointment_rescheduled',
        'appointment_cancelled'
      ) then coalesce(pref.appointment_updates_enabled, true)
      when p_event_type in (
        'prenatal_reminder', 'postnatal_reminder',
        'child_appointment_reminder', 'immunization_reminder'
      ) then coalesce(pref.appointment_reminders_enabled, true)
        and coalesce(pref.maternal_child_reminders_enabled, true)
      when p_event_type = 'appointment_reminder'
        then coalesce(pref.appointment_reminders_enabled, true)
      when p_template = 'important_announcement'
        then coalesce(pref.announcement_enabled, true)
      when p_template = 'inquiry_updated'
        then coalesce(pref.inquiry_updates_enabled, true)
      when p_template = 'signed_document_available'
        then coalesce(pref.document_updates_enabled, true)
      else false
    end
  from (select p_profile_id profile_id) target
  left join public.notification_preferences pref
    on pref.profile_id = target.profile_id
$$;

create or replace function public.notification_enqueue_for_profile(
  p_recipient_profile_id uuid,
  p_event_key text,
  p_event_type public.outbound_notification_event,
  p_source_type text,
  p_source_id uuid,
  p_template public.outbound_notification_template,
  p_safe_variables jsonb,
  p_available_at timestamptz default statement_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_channel public.outbound_notification_channel;
  selected_locale public.notification_locale;
begin
  if p_recipient_profile_id is null or p_source_id is null
    or p_event_key !~ '^[a-z0-9:._-]{3,300}$'
    or p_source_type !~ '^[a-z][a-z0-9_]{1,62}$'
    or not public.notification_template_variables_valid(p_template, p_safe_variables) then
    return;
  end if;
  select coalesce(pref.locale, 'en'::public.notification_locale)
  into selected_locale
  from (select p_recipient_profile_id profile_id) target
  left join public.notification_preferences pref on pref.profile_id = target.profile_id;
  foreach selected_channel in array array[
    'email'::public.outbound_notification_channel,
    'sms'::public.outbound_notification_channel
  ] loop
    if public.notification_event_preference_enabled(
      p_recipient_profile_id, p_event_type, p_template, selected_channel
    ) then
      insert into public.outbound_notification_jobs(
        event_key, event_type, source_type, source_id,
        recipient_profile_id, channel, template_key, locale,
        safe_variables, next_attempt_at
      ) values (
        p_event_key, p_event_type, p_source_type, p_source_id,
        p_recipient_profile_id, selected_channel, p_template, selected_locale,
        p_safe_variables, greatest(p_available_at, statement_timestamp())
      ) on conflict(recipient_profile_id, channel, event_key) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.notification_cancel_appointment_reminders(
  p_appointment_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.outbound_notification_jobs job
  set status = 'cancelled', cancelled_at = statement_timestamp(),
      locked_at = null, locked_by = null, updated_at = statement_timestamp(),
      failure_category = 'source_changed', version = job.version + 1
  where job.source_type = 'appointments' and job.source_id = p_appointment_id
    and job.event_type in (
      'appointment_reminder', 'prenatal_reminder', 'postnatal_reminder',
      'child_appointment_reminder', 'immunization_reminder'
    )
    and job.status in ('pending', 'processing')
$$;

create or replace function public.notification_schedule_appointment_reminder(
  p_appointment public.appointments
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  appointment_at timestamptz;
  reminder_at timestamptz;
  reminder_event public.outbound_notification_event;
  safe_values jsonb;
begin
  perform public.notification_cancel_appointment_reminders(p_appointment.id);
  if p_appointment.status <> 'confirmed'::public.appointment_status
    or p_appointment.archived_at is not null then return; end if;
  appointment_at := (p_appointment.scheduled_date + p_appointment.start_time)
    at time zone 'Asia/Manila';
  if appointment_at <= statement_timestamp() then return; end if;
  select r.linked_profile_id into recipient
  from public.residents r where r.id = p_appointment.resident_id;
  reminder_event := case
    when lower(p_appointment.service_type) like '%prenatal%' then 'prenatal_reminder'
    when lower(p_appointment.service_type) like '%postnatal%' then 'postnatal_reminder'
    when lower(p_appointment.service_type) like '%immuniz%' then 'immunization_reminder'
    when lower(p_appointment.service_type) like '%child%' then 'child_appointment_reminder'
    else 'appointment_reminder'
  end;
  safe_values := jsonb_build_object(
    'date', to_char(p_appointment.scheduled_date, 'FMMonth FMDD, YYYY'),
    'time', to_char(p_appointment.start_time, 'FMHH12:MI AM')
  );
  reminder_at := greatest(statement_timestamp(), appointment_at - interval '24 hours');
  perform public.notification_enqueue_for_profile(
    recipient,
    'appointment:' || p_appointment.id::text || ':reminder:'
      || to_char(appointment_at at time zone 'UTC', 'YYYYMMDDHH24MI'),
    reminder_event, 'appointments', p_appointment.id,
    'appointment_reminder', safe_values, reminder_at
  );
end;
$$;

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
begin
  source_record := new;
  select r.linked_profile_id into recipient
  from public.residents r where r.id = new.resident_id;
  if tg_op = 'INSERT' then
    if new.request_source = 'resident'::public.appointment_request_source
      and new.status = 'pending'::public.appointment_status then
      perform public.notification_enqueue_for_profile(
        recipient, 'appointment:' || new.id::text || ':request_received',
        'appointment_request_received', 'appointments', new.id,
        'appointment_request_received', '{}'::jsonb, statement_timestamp()
      );
    end if;
    return new;
  end if;

  if new.status = 'rescheduled'::public.appointment_status
    and old.status is distinct from new.status then
    perform public.notification_cancel_appointment_reminders(new.id);
    select * into replacement from public.appointments a
    where a.rescheduled_from_id = new.id order by a.created_at desc limit 1;
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
  elsif new.status = 'confirmed'::public.appointment_status
    and (old.scheduled_date, old.start_time) is distinct from
      (new.scheduled_date, new.start_time) then
    template := 'appointment_rescheduled';
    event_type := 'appointment_rescheduled';
    event_suffix := 'schedule:' || new.version::text;
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
    statement_timestamp()
  );
  if new.status = 'confirmed'::public.appointment_status then
    perform public.notification_schedule_appointment_reminder(new);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create trigger appointments_outbound_notification_insert
  after insert on public.appointments
  for each row execute function public.notification_notify_appointment_outbound();
create trigger appointments_outbound_notification_update
  after update of status, scheduled_date, start_time on public.appointments
  for each row execute function public.notification_notify_appointment_outbound();

create or replace function public.notification_notify_signed_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid;
begin
  if old.status is distinct from new.status
    and new.status = 'signed'::public.health_encounter_status then
    select r.linked_profile_id into recipient from public.residents r
    where r.id = new.resident_id;
    perform public.notification_enqueue_for_profile(
      recipient, 'health_encounter:' || new.id::text || ':signed',
      'signed_document_available', 'health_encounters', new.id,
      'signed_document_available',
      jsonb_build_object('document_kind', 'consultation summary'),
      statement_timestamp()
    );
  end if;
  return new;
exception when others then return new;
end;
$$;
create trigger health_encounters_outbound_notification
  after update of status on public.health_encounters
  for each row execute function public.notification_notify_signed_document();

create or replace function public.notification_notify_finalized_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid;
begin
  if old.status is distinct from new.status
    and new.status = 'finalized'::public.referral_status then
    select resident.linked_profile_id into recipient
    from public.health_encounters encounter
    join public.residents resident on resident.id = encounter.resident_id
    where encounter.id = new.encounter_id;
    perform public.notification_enqueue_for_profile(
      recipient, 'referral:' || new.id::text || ':finalized',
      'signed_document_available', 'clinical_referrals', new.id,
      'signed_document_available',
      jsonb_build_object('document_kind', 'referral form'),
      statement_timestamp()
    );
  end if;
  return new;
exception when others then return new;
end;
$$;
create trigger clinical_referrals_outbound_notification
  after update of status on public.clinical_referrals
  for each row execute function public.notification_notify_finalized_referral();

create or replace function public.notification_notify_inquiry_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status, old.staff_response) is distinct from
    (new.status, new.staff_response) then
    perform public.notification_enqueue_for_profile(
      new.resident_profile_id,
      'inquiry:' || new.id::text || ':version:' || new.version::text,
      'inquiry_updated', 'resident_inquiries', new.id, 'inquiry_updated',
      jsonb_build_object('status', initcap(replace(new.status::text, '_', ' '))),
      statement_timestamp()
    );
  end if;
  return new;
exception when others then return new;
end;
$$;
create trigger resident_inquiries_outbound_notification
  after update of status, staff_response on public.resident_inquiries
  for each row execute function public.notification_notify_inquiry_update();

create or replace function public.notification_notify_important_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient record;
begin
  if new.archived_at is not null
    or new.category not in (
      'emergency'::public.announcement_category,
      'advisory'::public.announcement_category
    ) then return new; end if;
  if tg_op = 'UPDATE' and (old.title, old.publish_at, old.category) is not distinct from
    (new.title, new.publish_at, new.category) then return new; end if;
  for recipient in select p.id from public.profiles p
    where public.notification_recipient_eligible(p.id)
  loop
    perform public.notification_enqueue_for_profile(
      recipient.id,
      'announcement:' || new.id::text || ':version:' || new.version::text,
      'important_announcement', 'announcements', new.id,
      'important_announcement', jsonb_build_object('title', new.title),
      new.publish_at
    );
  end loop;
  return new;
exception when others then return new;
end;
$$;
create trigger announcements_outbound_notification
  after insert or update of title, publish_at, category, archived_at
  on public.announcements
  for each row execute function public.notification_notify_important_announcement();

create or replace function public.notification_enforce_in_app_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare pref public.notification_preferences%rowtype;
begin
  select * into pref from public.notification_preferences p
  where p.profile_id = new.recipient_profile_id;
  if not found then return new; end if;
  if not pref.in_app_enabled then return null; end if;
  if new.notification_type in (
      'appointment_approved', 'appointment_rejected',
      'appointment_rescheduled', 'appointment_cancelled',
      'appointment_checked_in'
    ) and not pref.appointment_updates_enabled then return null;
  elsif new.notification_type = 'new_announcement'
    and not pref.announcement_enabled then return null;
  elsif new.notification_type in ('maternal_event', 'child_event')
    and not pref.maternal_child_reminders_enabled then return null;
  elsif new.notification_type = 'health_encounter_signed'
    and not pref.document_updates_enabled then return null;
  end if;
  return new;
end;
$$;
create trigger assistance_notifications_preferences
  before insert on public.assistance_notifications
  for each row execute function public.notification_enforce_in_app_preference();

create or replace function public.notification_preferences_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  pref public.notification_preferences%rowtype;
  auth_record record;
  linked boolean;
begin
  perform public.current_profile_role();
  insert into public.notification_preferences(profile_id) values (actor_id)
  on conflict(profile_id) do nothing;
  select * into pref from public.notification_preferences p
  where p.profile_id = actor_id;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at
  into auth_record from auth.users u where u.id = actor_id;
  linked := public.notification_recipient_eligible(actor_id);
  return jsonb_build_object(
    'in_app_enabled', pref.in_app_enabled,
    'email_enabled', pref.email_enabled,
    'sms_enabled', pref.sms_enabled,
    'appointment_updates_enabled', pref.appointment_updates_enabled,
    'appointment_reminders_enabled', pref.appointment_reminders_enabled,
    'announcement_enabled', pref.announcement_enabled,
    'inquiry_updates_enabled', pref.inquiry_updates_enabled,
    'maternal_child_reminders_enabled', pref.maternal_child_reminders_enabled,
    'document_updates_enabled', pref.document_updates_enabled,
    'locale', pref.locale::text,
    'version', pref.version,
    'email_contact_available', linked and auth_record.email_confirmed_at is not null
      and public.notification_normalize_email(auth_record.email) is not null,
    'email_destination', case when auth_record.email_confirmed_at is not null
      then public.notification_mask_email(auth_record.email) end,
    'sms_contact_available', linked and auth_record.phone_confirmed_at is not null
      and public.notification_normalize_ph_mobile(auth_record.phone) is not null,
    'sms_destination', case when auth_record.phone_confirmed_at is not null
      then public.notification_mask_mobile(auth_record.phone) end,
    'email_provider_configured', coalesce((select s.provider_configured
      from public.outbound_notification_channel_status s where s.channel = 'email'), false),
    'sms_provider_configured', coalesce((select s.provider_configured
      from public.outbound_notification_channel_status s where s.channel = 'sms'), false)
  );
end;
$$;

create or replace function public.notification_preferences_update(
  p_in_app_enabled boolean,
  p_email_enabled boolean,
  p_sms_enabled boolean,
  p_appointment_updates_enabled boolean,
  p_appointment_reminders_enabled boolean,
  p_announcement_enabled boolean,
  p_inquiry_updates_enabled boolean,
  p_maternal_child_reminders_enabled boolean,
  p_document_updates_enabled boolean,
  p_locale public.notification_locale,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  pref public.notification_preferences%rowtype;
  auth_record record;
  new_version bigint;
begin
  perform public.current_profile_role();
  if p_in_app_enabled is null or p_email_enabled is null or p_sms_enabled is null
    or p_appointment_updates_enabled is null or p_appointment_reminders_enabled is null
    or p_announcement_enabled is null or p_inquiry_updates_enabled is null
    or p_maternal_child_reminders_enabled is null or p_document_updates_enabled is null
    or p_locale is null then raise exception 'invalid notification preferences'; end if;
  insert into public.notification_preferences(profile_id) values (actor_id)
  on conflict(profile_id) do nothing;
  select * into pref from public.notification_preferences p
  where p.profile_id = actor_id for update;
  if pref.version is distinct from p_expected_version then
    raise exception 'notification preferences changed in another session'
      using errcode = '40001';
  end if;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at
  into auth_record from auth.users u where u.id = actor_id;
  if p_email_enabled and (
    not public.notification_recipient_eligible(actor_id)
    or auth_record.email_confirmed_at is null
    or public.notification_normalize_email(auth_record.email) is null
  ) then raise exception 'verified email is unavailable' using errcode = '23514'; end if;
  if p_sms_enabled and (
    not public.notification_recipient_eligible(actor_id)
    or auth_record.phone_confirmed_at is null
    or public.notification_normalize_ph_mobile(auth_record.phone) is null
  ) then raise exception 'verified mobile number is unavailable' using errcode = '23514'; end if;
  update public.notification_preferences p set
    in_app_enabled = p_in_app_enabled, email_enabled = p_email_enabled,
    sms_enabled = p_sms_enabled,
    appointment_updates_enabled = p_appointment_updates_enabled,
    appointment_reminders_enabled = p_appointment_reminders_enabled,
    announcement_enabled = p_announcement_enabled,
    inquiry_updates_enabled = p_inquiry_updates_enabled,
    maternal_child_reminders_enabled = p_maternal_child_reminders_enabled,
    document_updates_enabled = p_document_updates_enabled,
    locale = p_locale, version = p.version + 1,
    updated_at = statement_timestamp()
  where p.profile_id = actor_id returning p.version into new_version;
  insert into public.audit_logs(
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    actor_id, 'notification.preferences_updated', 'notification_preferences',
    actor_id, 'Updated own notification preferences',
    jsonb_build_object('channels_changed', true, 'content_included', false)
  );
  return new_version;
end;
$$;

create or replace function public.notification_delivery_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_profile_role() <> 'admin'::public.app_role then
    raise exception 'notification delivery access requires an administrator'
      using errcode = '42501';
  end if;
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'pending', (select count(*) from public.outbound_notification_jobs where status = 'pending'),
      'processing', (select count(*) from public.outbound_notification_jobs where status = 'processing'),
      'sent', (select count(*) from public.outbound_notification_jobs where status = 'sent'),
      'failed', (select count(*) from public.outbound_notification_jobs where status = 'failed'),
      'cancelled', (select count(*) from public.outbound_notification_jobs where status = 'cancelled'),
      'unconfigured', (select count(*) from public.outbound_notification_jobs j
        join public.outbound_notification_channel_status s on s.channel = j.channel
        where j.status = 'pending' and not s.provider_configured)
    ),
    'channels', coalesce((select jsonb_agg(jsonb_build_object(
      'channel', s.channel::text,
      'configured', s.provider_configured,
      'provider', s.provider_label,
      'updated_at', s.updated_at
    ) order by s.channel) from public.outbound_notification_channel_status s), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select j.id, j.event_type::text event_type, j.channel::text channel,
          j.status::text status, j.destination_hint, j.attempt_count,
          j.max_attempts, j.manual_retry_count, j.failure_category,
          j.next_attempt_at, j.sent_at, j.created_at, j.version
        from public.outbound_notification_jobs j
        order by j.created_at desc, j.id desc limit 50
      ) recent), '[]'::jsonb)
  );
end;
$$;

create or replace function public.notification_retry_failed_job(
  p_job_id uuid,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.outbound_notification_jobs%rowtype;
  new_version bigint;
begin
  if public.current_profile_role() <> 'admin'::public.app_role then
    raise exception 'notification retry requires an administrator'
      using errcode = '42501';
  end if;
  select * into current_job from public.outbound_notification_jobs j
  where j.id = p_job_id for update;
  if not found then raise exception 'notification job not found' using errcode = 'P0002'; end if;
  if current_job.version is distinct from p_expected_version then
    raise exception 'notification job changed in another session' using errcode = '40001';
  end if;
  if current_job.status <> 'failed' or current_job.manual_retry_count >= 2 then
    raise exception 'notification job is not retry eligible' using errcode = '23514';
  end if;
  update public.outbound_notification_jobs j set
    status = 'pending', next_attempt_at = statement_timestamp(),
    max_attempts = least(7, greatest(j.max_attempts, j.attempt_count + 1)),
    manual_retry_count = j.manual_retry_count + 1,
    failure_category = null, version = j.version + 1,
    updated_at = statement_timestamp()
  where j.id = p_job_id returning j.version into new_version;
  insert into public.audit_logs(
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    auth.uid(), 'notification.retry_requested', 'outbound_notification_jobs',
    p_job_id, 'Requested a bounded retry for a failed notification',
    jsonb_build_object('message_content_included', false)
  );
  return new_version;
end;
$$;

create or replace function public.notification_channel_status_set(
  p_email_configured boolean,
  p_email_provider text,
  p_sms_configured boolean,
  p_sms_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'notification channel status requires service role'
      using errcode = '42501';
  end if;
  update public.outbound_notification_channel_status set
    provider_configured = p_email_configured,
    provider_label = case when p_email_configured then nullif(btrim(p_email_provider), '') end,
    updated_at = statement_timestamp()
  where channel = 'email';
  update public.outbound_notification_channel_status set
    provider_configured = p_sms_configured,
    provider_label = case when p_sms_configured then nullif(btrim(p_sms_provider), '') end,
    updated_at = statement_timestamp()
  where channel = 'sms';
end;
$$;

create or replace function public.notification_claim_jobs(
  p_worker_id uuid,
  p_batch_size integer default 20,
  p_email_global_hourly integer default 100,
  p_sms_global_hourly integer default 50,
  p_email_recipient_hourly integer default 20,
  p_sms_recipient_hourly integer default 5
)
returns table(
  id uuid,
  event_type public.outbound_notification_event,
  recipient_profile_id uuid,
  channel public.outbound_notification_channel,
  template_key public.outbound_notification_template,
  locale public.notification_locale,
  safe_variables jsonb,
  attempt_number smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_channel public.outbound_notification_channel;
  global_limit integer;
  recipient_limit integer;
  global_remaining integer;
  batch_remaining integer := p_batch_size;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'notification queue processing requires service role'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_batch_size not between 1 and 50
    or p_email_global_hourly not between 1 and 1000
    or p_sms_global_hourly not between 1 and 500
    or p_email_recipient_hourly not between 1 and 100
    or p_sms_recipient_hourly not between 1 and 20 then
    raise exception 'invalid notification processing limits';
  end if;

  update public.outbound_notification_jobs j set
    status = 'pending', locked_at = null, locked_by = null,
    next_attempt_at = statement_timestamp(),
    failure_category = 'stale_lock_recovered',
    updated_at = statement_timestamp(), version = j.version + 1
  where j.status = 'processing'
    and j.locked_at < statement_timestamp() - interval '10 minutes';

  update public.outbound_notification_jobs j set
    status = 'cancelled', cancelled_at = statement_timestamp(),
    failure_category = 'recipient_ineligible', updated_at = statement_timestamp(),
    version = j.version + 1
  where j.status = 'pending'
    and not public.notification_recipient_eligible(j.recipient_profile_id);

  update public.outbound_notification_jobs j set
    status = 'cancelled', cancelled_at = statement_timestamp(),
    failure_category = 'preference_disabled', updated_at = statement_timestamp(),
    version = j.version + 1
  where j.status = 'pending'
    and not public.notification_event_preference_enabled(
      j.recipient_profile_id, j.event_type, j.template_key, j.channel
    );

  update public.outbound_notification_jobs j set
    status = 'cancelled', cancelled_at = statement_timestamp(),
    failure_category = 'source_changed', updated_at = statement_timestamp(),
    version = j.version + 1
  where j.status = 'pending' and j.source_type = 'appointments'
    and j.event_type in (
      'appointment_reminder', 'prenatal_reminder', 'postnatal_reminder',
      'child_appointment_reminder', 'immunization_reminder'
    ) and not exists (
      select 1 from public.appointments a where a.id = j.source_id
        and a.status = 'confirmed'::public.appointment_status
        and a.archived_at is null
        and ((a.scheduled_date + a.start_time) at time zone 'Asia/Manila') > statement_timestamp()
        and j.safe_variables = jsonb_build_object(
          'date', to_char(a.scheduled_date, 'FMMonth FMDD, YYYY'),
          'time', to_char(a.start_time, 'FMHH12:MI AM')
        )
    );

  foreach selected_channel in array array[
    'email'::public.outbound_notification_channel,
    'sms'::public.outbound_notification_channel
  ] loop
    exit when batch_remaining <= 0;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('outbound-notification:' || selected_channel::text, 0)
    );
    if not coalesce((select status.provider_configured
      from public.outbound_notification_channel_status status
      where status.channel = selected_channel), false) then continue; end if;
    global_limit := case when selected_channel = 'email' then p_email_global_hourly
      else p_sms_global_hourly end;
    recipient_limit := case when selected_channel = 'email' then p_email_recipient_hourly
      else p_sms_recipient_hourly end;
    global_remaining := greatest(0, global_limit - (
      (select count(*) from public.notification_delivery_attempts attempt
        where attempt.channel = selected_channel
          and attempt.attempted_at >= statement_timestamp() - interval '1 hour')
      + (select count(*) from public.outbound_notification_jobs processing
        where processing.channel = selected_channel
          and processing.status = 'processing'
          and processing.locked_at >= statement_timestamp() - interval '1 hour')
    ));
    if global_remaining <= 0 then continue; end if;

    return query
    with ranked as (
      select job.id,
        row_number() over (
          partition by job.recipient_profile_id
          order by job.next_attempt_at, job.created_at, job.id
        ) recipient_rank,
        (select count(*) from public.notification_delivery_attempts attempt
          join public.outbound_notification_jobs attempted_job on attempted_job.id = attempt.job_id
          where attempted_job.recipient_profile_id = job.recipient_profile_id
            and attempt.channel = selected_channel
            and attempt.attempted_at >= statement_timestamp() - interval '1 hour')
        + (select count(*) from public.outbound_notification_jobs processing
          where processing.recipient_profile_id = job.recipient_profile_id
            and processing.channel = selected_channel
            and processing.status = 'processing'
            and processing.locked_at >= statement_timestamp() - interval '1 hour') prior_count
      from public.outbound_notification_jobs job
      where job.status = 'pending' and job.channel = selected_channel
        and job.next_attempt_at <= statement_timestamp()
        and job.attempt_count < job.max_attempts
    ), selected as (
      select job.id from public.outbound_notification_jobs job
      join ranked on ranked.id = job.id
      where ranked.prior_count + ranked.recipient_rank <= recipient_limit
        and job.status = 'pending'
      order by job.next_attempt_at, job.created_at, job.id
      for update of job skip locked
      limit least(batch_remaining, global_remaining)
    ), claimed as (
      update public.outbound_notification_jobs job set
        status = 'processing', locked_at = statement_timestamp(),
        locked_by = p_worker_id, failure_category = null,
        updated_at = statement_timestamp(), version = job.version + 1
      where job.id in (select selected.id from selected)
      returning job.*
    )
    select claimed.id, claimed.event_type, claimed.recipient_profile_id,
      claimed.channel, claimed.template_key, claimed.locale,
      claimed.safe_variables, (claimed.attempt_count + 1)::smallint
    from claimed;
    get diagnostics global_limit = row_count;
    batch_remaining := batch_remaining - global_limit;
  end loop;
end;
$$;

create or replace function public.notification_complete_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_outcome public.outbound_delivery_outcome,
  p_latency_ms integer,
  p_destination_hint text,
  p_provider_reference text,
  p_failure_category text
)
returns public.outbound_notification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.outbound_notification_jobs%rowtype;
  next_status public.outbound_notification_status;
  next_attempt smallint;
  retry_seconds integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'notification completion requires service role' using errcode = '42501';
  end if;
  if p_latency_ms not between 0 and 120000
    or (p_destination_hint is not null and (
      char_length(p_destination_hint) > 254 or p_destination_hint not like '%*%'
    )) or (p_provider_reference is not null and char_length(p_provider_reference) > 500)
    or (p_failure_category is not null and p_failure_category !~ '^[a-z][a-z0-9_]{1,49}$') then
    raise exception 'invalid notification completion metadata';
  end if;
  select * into job from public.outbound_notification_jobs target
  where target.id = p_job_id and target.status = 'processing'
    and target.locked_by = p_worker_id for update;
  if not found then raise exception 'notification processing lease is unavailable'
    using errcode = 'P0002'; end if;
  next_attempt := job.attempt_count + 1;
  insert into public.notification_delivery_attempts(
    job_id, attempt_number, channel, outcome, failure_category, latency_ms
  ) values (
    job.id, next_attempt, job.channel, p_outcome, p_failure_category, p_latency_ms
  );
  if p_outcome = 'sent' then
    next_status := 'sent';
  elsif p_outcome in ('permanent_failure', 'disabled')
    or next_attempt >= job.max_attempts then
    next_status := 'failed';
  else
    next_status := 'pending';
  end if;
  retry_seconds := least(21600, 300 * power(2, least(next_attempt - 1, 6))::integer);
  update public.outbound_notification_jobs target set
    status = next_status, attempt_count = next_attempt,
    locked_at = null, locked_by = null,
    destination_hint = coalesce(p_destination_hint, target.destination_hint),
    provider_message_reference = case when p_outcome = 'sent'
      then p_provider_reference else target.provider_message_reference end,
    failure_category = case when p_outcome = 'sent' then null
      else coalesce(p_failure_category, p_outcome::text) end,
    next_attempt_at = case when next_status = 'pending'
      then statement_timestamp() + retry_seconds * interval '1 second'
      else target.next_attempt_at end,
    sent_at = case when next_status = 'sent' then statement_timestamp() end,
    updated_at = statement_timestamp(), version = target.version + 1
  where target.id = job.id;
  return next_status;
end;
$$;

grant all on table public.notification_preferences,
  public.outbound_notification_channel_status,
  public.outbound_notification_jobs,
  public.notification_delivery_attempts to service_role;
grant usage, select on sequence public.notification_delivery_attempts_id_seq
  to service_role;

revoke all on function public.notification_normalize_email(text),
  public.notification_normalize_ph_mobile(text),
  public.notification_mask_email(text),
  public.notification_mask_mobile(text),
  public.notification_template_variables_valid(public.outbound_notification_template,jsonb),
  public.notification_recipient_eligible(uuid),
  public.notification_event_preference_enabled(uuid,public.outbound_notification_event,public.outbound_notification_template,public.outbound_notification_channel),
  public.notification_enqueue_for_profile(uuid,text,public.outbound_notification_event,text,uuid,public.outbound_notification_template,jsonb,timestamptz),
  public.notification_cancel_appointment_reminders(uuid),
  public.notification_schedule_appointment_reminder(public.appointments),
  public.notification_notify_appointment_outbound(),
  public.notification_notify_signed_document(),
  public.notification_notify_finalized_referral(),
  public.notification_notify_inquiry_update(),
  public.notification_notify_important_announcement(),
  public.notification_enforce_in_app_preference(),
  public.notification_preferences_get(),
  public.notification_preferences_update(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,public.notification_locale,bigint),
  public.notification_delivery_summary(),
  public.notification_retry_failed_job(uuid,bigint),
  public.notification_channel_status_set(boolean,text,boolean,text),
  public.notification_claim_jobs(uuid,integer,integer,integer,integer,integer),
  public.notification_complete_job(uuid,uuid,public.outbound_delivery_outcome,integer,text,text,text)
  from public, anon, authenticated;

grant execute on function public.notification_preferences_get(),
  public.notification_preferences_update(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,public.notification_locale,bigint),
  public.notification_delivery_summary(),
  public.notification_retry_failed_job(uuid,bigint)
  to authenticated, service_role;

grant execute on function public.notification_channel_status_set(boolean,text,boolean,text),
  public.notification_claim_jobs(uuid,integer,integer,integer,integer,integer),
  public.notification_complete_job(uuid,uuid,public.outbound_delivery_outcome,integer,text,text,text)
  to service_role;

commit;
