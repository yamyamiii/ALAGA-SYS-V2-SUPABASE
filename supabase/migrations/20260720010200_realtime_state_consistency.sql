-- System-wide realtime cache reconciliation without publishing sensitive rows.
-- Event rows contain only an invalidation topic, optional entity identifier,
-- audience, and timing boundary. Authoritative data is always refetched through
-- the existing RLS/RPC read models.

begin;

create table public.realtime_sync_events (
  id bigint generated always as identity primary key,
  topic text not null,
  entity_id uuid,
  audience_profile_id uuid references public.profiles(id) on delete cascade,
  audience_role public.app_role,
  available_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint realtime_sync_events_topic_valid check (
    topic in (
      'profile',
      'registration',
      'registry',
      'appointment',
      'notification',
      'announcement'
    )
  ),
  constraint realtime_sync_events_one_audience check (
    (audience_profile_id is not null)::integer
      + (audience_role is not null)::integer = 1
  )
);

create index realtime_sync_events_profile_idx
  on public.realtime_sync_events(audience_profile_id, id desc)
  where audience_profile_id is not null;
create index realtime_sync_events_role_idx
  on public.realtime_sync_events(audience_role, id desc)
  where audience_role is not null;
create index realtime_sync_events_created_idx
  on public.realtime_sync_events(created_at);
create index realtime_sync_events_available_idx
  on public.realtime_sync_events(available_at, id);

alter table public.realtime_sync_events enable row level security;

create policy realtime_sync_events_select_authorized
  on public.realtime_sync_events for select to authenticated
  using (
    audience_profile_id = auth.uid()
    or audience_role = public.current_profile_role()
  );

revoke all on table public.realtime_sync_events
  from public, anon, authenticated;
grant select on table public.realtime_sync_events to authenticated;
grant select, insert, delete on table public.realtime_sync_events to service_role;

create or replace function public.emit_realtime_sync_event(
  p_topic text,
  p_entity_id uuid,
  p_audience_profile_id uuid default null,
  p_audience_role public.app_role default null,
  p_available_at timestamptz default statement_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.realtime_sync_events(
    topic,
    entity_id,
    audience_profile_id,
    audience_role,
    available_at
  ) values (
    p_topic,
    p_entity_id,
    p_audience_profile_id,
    p_audience_role,
    greatest(p_available_at, statement_timestamp())
  );
exception
  when others then
    -- Cache invalidation must never roll back an authorized business write.
    -- Focus/reconnect reconciliation remains the authoritative fallback.
    raise warning 'realtime sync event emission failed for topic %', p_topic;
end;
$$;

revoke all on function public.emit_realtime_sync_event(
  text, uuid, uuid, public.app_role, timestamptz
) from public, anon, authenticated;
grant execute on function public.emit_realtime_sync_event(
  text, uuid, uuid, public.app_role, timestamptz
) to service_role;

create or replace function public.emit_profile_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or new.account_status is distinct from old.account_status
    or new.role is distinct from old.role
    or new.retired_at is distinct from old.retired_at then
    perform public.emit_realtime_sync_event('profile', new.id, new.id, null, statement_timestamp());
    perform public.emit_realtime_sync_event('profile', new.id, null, 'admin', statement_timestamp());
    perform public.emit_realtime_sync_event(
      'profile', new.id, null, 'barangay_health_worker', statement_timestamp()
    );
    perform public.emit_realtime_sync_event(
      'registry', new.id, null, 'nurse', statement_timestamp()
    );
    perform public.emit_realtime_sync_event(
      'registry', new.id, null, 'midwife', statement_timestamp()
    );
  end if;
  return new;
end;
$$;

create trigger profiles_realtime_sync
  after insert or update of account_status, role, retired_at on public.profiles
  for each row execute function public.emit_profile_realtime_sync();

create or replace function public.emit_registration_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_profile_id uuid := coalesce(new.profile_id, old.profile_id);
  row_id uuid := coalesce(new.id, old.id);
begin
  perform public.emit_realtime_sync_event(
    'registration', row_id, row_profile_id, null, statement_timestamp()
  );
  perform public.emit_realtime_sync_event(
    'registration', row_id, null, 'admin', statement_timestamp()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger resident_registration_requests_realtime_sync
  after insert or update or delete on public.resident_registration_requests
  for each row execute function public.emit_registration_realtime_sync();

create or replace function public.emit_resident_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := coalesce(new.id, old.id);
begin
  perform public.emit_realtime_sync_event('registry', row_id, null, 'admin', statement_timestamp());
  perform public.emit_realtime_sync_event(
    'registry', row_id, null, 'barangay_health_worker', statement_timestamp()
  );
  perform public.emit_realtime_sync_event(
    'registry', row_id, null, 'nurse', statement_timestamp()
  );
  perform public.emit_realtime_sync_event(
    'registry', row_id, null, 'midwife', statement_timestamp()
  );
  if tg_op <> 'DELETE' and new.linked_profile_id is not null then
    perform public.emit_realtime_sync_event(
      'registry', row_id, new.linked_profile_id, null, statement_timestamp()
    );
  end if;
  if tg_op <> 'INSERT'
    and old.linked_profile_id is not null
    and old.linked_profile_id is distinct from new.linked_profile_id then
    perform public.emit_realtime_sync_event(
      'registry', row_id, old.linked_profile_id, null, statement_timestamp()
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger residents_realtime_sync
  after insert or update or delete on public.residents
  for each row execute function public.emit_resident_realtime_sync();

create or replace function public.emit_appointment_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := coalesce(new.id, old.id);
  resident_profile_id uuid;
begin
  perform public.emit_realtime_sync_event('appointment', row_id, null, 'admin', statement_timestamp());
  perform public.emit_realtime_sync_event(
    'appointment', row_id, null, 'barangay_health_worker', statement_timestamp()
  );

  select resident.linked_profile_id into resident_profile_id
  from public.residents as resident
  where resident.id = coalesce(new.resident_id, old.resident_id);
  if resident_profile_id is not null then
    perform public.emit_realtime_sync_event(
      'appointment', row_id, resident_profile_id, null, statement_timestamp()
    );
  end if;

  if tg_op <> 'DELETE' and new.assigned_staff_id is not null then
    perform public.emit_realtime_sync_event(
      'appointment', row_id, new.assigned_staff_id, null, statement_timestamp()
    );
  end if;
  if tg_op <> 'INSERT'
    and old.assigned_staff_id is not null
    and old.assigned_staff_id is distinct from new.assigned_staff_id then
    perform public.emit_realtime_sync_event(
      'appointment', row_id, old.assigned_staff_id, null, statement_timestamp()
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger appointments_realtime_sync
  after insert or update or delete on public.appointments
  for each row execute function public.emit_appointment_realtime_sync();

create or replace function public.emit_notification_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := coalesce(new.id, old.id);
  recipient_id uuid := coalesce(new.recipient_profile_id, old.recipient_profile_id);
  event_available_at timestamptz := case
    when tg_op = 'DELETE' then statement_timestamp()
    else new.available_at
  end;
begin
  perform public.emit_realtime_sync_event(
    'notification', row_id, recipient_id, null, event_available_at
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger assistance_notifications_realtime_sync
  after insert or update or delete on public.assistance_notifications
  for each row execute function public.emit_notification_realtime_sync();

create or replace function public.emit_announcement_realtime_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := coalesce(new.id, old.id);
  publication_at timestamptz := case
    when tg_op = 'DELETE' or new.archived_at is not null
      then statement_timestamp()
    else new.publish_at
  end;
  expiration_at timestamptz := case
    when tg_op = 'DELETE' then null
    else new.expires_at
  end;
  audience public.app_role;
begin
  -- Managers reconcile immediately so scheduled records remain visible.
  perform public.emit_realtime_sync_event('announcement', row_id, null, 'admin', statement_timestamp());
  perform public.emit_realtime_sync_event(
    'announcement', row_id, null, 'barangay_health_worker', statement_timestamp()
  );

  foreach audience in array array[
    'admin'::public.app_role,
    'barangay_health_worker'::public.app_role,
    'nurse'::public.app_role,
    'midwife'::public.app_role,
    'resident'::public.app_role
  ] loop
    if audience not in (
      'admin'::public.app_role,
      'barangay_health_worker'::public.app_role
    ) or publication_at > statement_timestamp() then
      perform public.emit_realtime_sync_event(
        'announcement', row_id, null, audience, publication_at
      );
    end if;
    if expiration_at is not null then
      perform public.emit_realtime_sync_event(
        'announcement', row_id, null, audience, expiration_at
      );
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger announcements_realtime_sync
  after insert or update or delete on public.announcements
  for each row execute function public.emit_announcement_realtime_sync();

revoke all on function public.emit_profile_realtime_sync(),
  public.emit_registration_realtime_sync(),
  public.emit_resident_realtime_sync(),
  public.emit_appointment_realtime_sync(),
  public.emit_notification_realtime_sync(),
  public.emit_announcement_realtime_sync()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'realtime_sync_events'
  ) then
    alter publication supabase_realtime add table public.realtime_sync_events;
  end if;
end;
$$;

commit;
