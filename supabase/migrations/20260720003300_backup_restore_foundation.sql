-- Phase 12: application-aware backup and restore foundation.
-- Backup archives contain only the explicitly allowlisted application rows.
-- Auth, Storage internals, audit payloads, AI data, delivery attempts, and
-- runtime state are intentionally outside this boundary.

begin;

create type public.backup_mode as enum ('manual', 'automatic');
create type public.backup_status as enum (
  'queued', 'processing', 'completed', 'failed', 'deleted'
);
create type public.backup_frequency as enum (
  'disabled', 'daily', 'weekly', 'monthly'
);
create type public.restore_status as enum (
  'validated', 'approved', 'restoring', 'completed', 'failed', 'cancelled'
);

create table public.backup_configuration (
  id boolean primary key default true check (id),
  frequency public.backup_frequency not null default 'disabled',
  retention_count smallint not null default 7,
  next_run_at timestamptz,
  updated_by uuid references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint backup_configuration_retention_valid check (
    retention_count between 1 and 30
  ),
  constraint backup_configuration_schedule_valid check (
    (frequency = 'disabled' and next_run_at is null)
    or (frequency <> 'disabled' and next_run_at is not null)
  )
);

insert into public.backup_configuration(id) values (true);

create table public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  backup_name text not null,
  mode public.backup_mode not null,
  status public.backup_status not null default 'queued',
  requested_by uuid references public.profiles(id) on delete restrict,
  retry_of uuid references public.backup_jobs(id) on delete restrict,
  storage_path text unique,
  package_sha256 text,
  checksum_status text not null default 'pending',
  backup_version text not null default '1.0',
  application_version text not null default '0.1.0',
  schema_version integer not null default 33,
  size_bytes bigint,
  file_count integer,
  record_counts jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  attempt_count smallint not null default 0,
  locked_at timestamptz,
  locked_by uuid,
  failure_category text,
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint backup_jobs_name_safe check (
    backup_name ~ '^ALAGA_BACKUP_[0-9]{8}_[0-9]{6}\.zip$'
  ),
  constraint backup_jobs_storage_path_safe check (
    storage_path is null
    or storage_path ~ '^packages/[0-9a-f-]{36}/ALAGA_BACKUP_[0-9]{8}_[0-9]{6}\.zip$'
  ),
  constraint backup_jobs_sha256_valid check (
    package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint backup_jobs_checksum_status_valid check (
    checksum_status in ('pending', 'verified', 'failed')
  ),
  constraint backup_jobs_attempts_valid check (attempt_count between 0 and 3),
  constraint backup_jobs_size_valid check (size_bytes is null or size_bytes > 0),
  constraint backup_jobs_lock_valid check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  ),
  constraint backup_jobs_completion_valid check (
    (status = 'completed' and completed_at is not null and storage_path is not null
      and package_sha256 is not null and checksum_status = 'verified')
    or status <> 'completed'
  ),
  constraint backup_jobs_deleted_valid check (
    (status = 'deleted' and deleted_at is not null and storage_path is null)
    or status <> 'deleted'
  ),
  constraint backup_jobs_failure_safe check (
    failure_category is null or failure_category ~ '^[a-z][a-z0-9_]{1,49}$'
  )
);

create index backup_jobs_history_idx
  on public.backup_jobs(created_at desc, id);
create index backup_jobs_queue_idx
  on public.backup_jobs(created_at, id)
  where status = 'queued';

create table public.restore_jobs (
  id uuid primary key default gen_random_uuid(),
  backup_name text not null,
  status public.restore_status not null default 'validated',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  package_sha256 text not null,
  checksum_verified boolean not null,
  backup_version text not null,
  application_version text not null,
  schema_version integer not null,
  backup_created_at timestamptz not null,
  files text[] not null,
  preview_counts jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  confirmation_hash text not null,
  confirmation_expires_at timestamptz not null,
  report jsonb not null default '{}'::jsonb,
  failure_category text,
  started_at timestamptz,
  completed_at timestamptz,
  staging_deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint restore_jobs_name_safe check (
    backup_name ~ '^ALAGA_BACKUP_[0-9]{8}_[0-9]{6}\.zip$'
  ),
  constraint restore_jobs_storage_path_safe check (
    storage_path ~ '^restore-staging/[0-9a-f-]{36}/ALAGA_BACKUP_[0-9]{8}_[0-9]{6}\.zip$'
  ),
  constraint restore_jobs_sha256_valid check (package_sha256 ~ '^[0-9a-f]{64}$'),
  constraint restore_jobs_confirmation_valid check (
    confirmation_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint restore_jobs_failure_safe check (
    failure_category is null or failure_category ~ '^[a-z][a-z0-9_]{1,49}$'
  )
);

create index restore_jobs_history_idx
  on public.restore_jobs(created_at desc, id);

alter table public.backup_configuration enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.restore_jobs enable row level security;

revoke all on table public.backup_configuration, public.backup_jobs,
  public.restore_jobs from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'alaga-backups',
  'alaga-backups',
  false,
  104857600,
  array['application/zip']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.backup_assert_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  actor_status public.account_status;
begin
  select p.role, p.account_status into actor_role, actor_status
  from public.profiles as p where p.id = actor_id;

  if actor_id is null
    or actor_role is distinct from 'admin'::public.app_role
    or actor_status is distinct from 'active'::public.account_status then
    raise exception 'backup administration requires an active administrator'
      using errcode = '42501';
  end if;
  return actor_id;
end;
$$;

create or replace function public.backup_assert_service_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'backup worker authorization required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.backup_assert_admin() from public, anon, authenticated;
revoke all on function public.backup_assert_service_role() from public, anon, authenticated;

create or replace function public.backup_make_name(p_timestamp timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ALAGA_BACKUP_' || to_char(p_timestamp at time zone 'Asia/Manila', 'YYYYMMDD_HH24MISS') || '.zip'
$$;

revoke all on function public.backup_make_name(timestamptz) from public, anon, authenticated;

create or replace function public.backup_enqueue_manual()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.backup_assert_admin();
  job public.backup_jobs%rowtype;
  requested_at timestamptz := statement_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if exists (select 1 from public.restore_jobs where status in ('approved', 'restoring')) then
    raise exception 'backup cannot start while a restore is in progress' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.backup_jobs where status in ('queued', 'processing')) then
    raise exception 'another backup is already in progress' using errcode = 'P0001';
  end if;
  insert into public.backup_jobs(backup_name, mode, requested_by)
  values (public.backup_make_name(requested_at), 'manual', actor_id)
  returning * into job;

  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, summary)
  values (actor_id, 'backup.requested', 'backup_jobs', job.id, 'Requested an application backup');

  return jsonb_build_object('id', job.id, 'status', job.status, 'backup_name', job.backup_name);
end;
$$;

create or replace function public.backup_retry(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.backup_assert_admin();
  source_job public.backup_jobs%rowtype;
  job public.backup_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if exists (select 1 from public.restore_jobs where status in ('approved', 'restoring')) then
    raise exception 'backup cannot start while a restore is in progress' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.backup_jobs where status in ('queued', 'processing')) then
    raise exception 'another backup is already in progress' using errcode = 'P0001';
  end if;
  select * into source_job from public.backup_jobs where id = p_backup_id for update;
  if not found or source_job.status <> 'failed' then
    raise exception 'backup is not retry eligible' using errcode = 'P0001';
  end if;
  insert into public.backup_jobs(backup_name, mode, requested_by, retry_of)
  values (public.backup_make_name(statement_timestamp()), 'manual', actor_id, source_job.id)
  returning * into job;
  return jsonb_build_object('id', job.id, 'status', job.status, 'backup_name', job.backup_name);
end;
$$;

create or replace function public.backup_schedule_update(
  p_frequency public.backup_frequency,
  p_retention_count integer,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.backup_assert_admin();
  result public.backup_configuration%rowtype;
  next_run timestamptz;
begin
  if p_retention_count not between 1 and 30 then
    raise exception 'backup retention must be between 1 and 30' using errcode = '22023';
  end if;
  next_run := case p_frequency
    when 'daily' then (date_trunc('day', statement_timestamp() at time zone 'Asia/Manila')
      + interval '1 day 2 hours') at time zone 'Asia/Manila'
    when 'weekly' then (date_trunc('week', statement_timestamp() at time zone 'Asia/Manila')
      + interval '8 days 2 hours') at time zone 'Asia/Manila'
    when 'monthly' then (date_trunc('month', statement_timestamp() at time zone 'Asia/Manila')
      + interval '1 month 2 hours') at time zone 'Asia/Manila'
    else null
  end;

  update public.backup_configuration
  set frequency = p_frequency,
      retention_count = p_retention_count,
      next_run_at = next_run,
      updated_by = actor_id,
      version = version + 1,
      updated_at = statement_timestamp()
  where id and version = p_expected_version
  returning * into result;
  if not found then
    raise exception 'backup configuration changed in another session' using errcode = '40001';
  end if;
  return to_jsonb(result) - array['updated_by'];
end;
$$;

create or replace function public.backup_admin_dashboard(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.backup_assert_admin();
  result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception 'invalid backup history limit' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'configuration', (select to_jsonb(c) - array['updated_by'] from public.backup_configuration c where c.id),
    'backups', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, backup_name, mode, status, checksum_status, backup_version,
          application_version, schema_version, size_bytes, file_count,
          record_counts, report, failure_category, started_at, completed_at,
          deleted_at, created_at
        from public.backup_jobs order by created_at desc, id desc limit p_limit
      ) x
    ), '[]'::jsonb),
    'restores', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, backup_name, status, checksum_verified, backup_version,
          application_version, schema_version, backup_created_at, files,
          preview_counts, warnings,
          report, failure_category, started_at, completed_at, created_at
        from public.restore_jobs where requested_by = actor_id
        order by created_at desc, id desc limit 10
      ) x
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.backup_enqueue_due_automatic()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  configuration public.backup_configuration%rowtype;
  job_id uuid;
  due_at timestamptz := statement_timestamp();
begin
  perform public.backup_assert_service_role();
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if exists (select 1 from public.restore_jobs where status in ('approved', 'restoring')) then
    return null;
  end if;
  select * into configuration from public.backup_configuration where id for update;
  if configuration.frequency = 'disabled' or configuration.next_run_at > due_at then
    return null;
  end if;
  if exists (select 1 from public.backup_jobs where status in ('queued', 'processing')) then
    return null;
  end if;
  insert into public.backup_jobs(backup_name, mode)
  values (public.backup_make_name(due_at), 'automatic') returning id into job_id;
  update public.backup_configuration set
    next_run_at = case configuration.frequency
      when 'daily' then ((configuration.next_run_at at time zone 'Asia/Manila') + interval '1 day') at time zone 'Asia/Manila'
      when 'weekly' then ((configuration.next_run_at at time zone 'Asia/Manila') + interval '7 days') at time zone 'Asia/Manila'
      when 'monthly' then ((configuration.next_run_at at time zone 'Asia/Manila') + interval '1 month') at time zone 'Asia/Manila'
      else null
    end,
    version = version + 1,
    updated_at = due_at
  where id;
  return job_id;
end;
$$;

create or replace function public.backup_claim_jobs(p_worker_id uuid, p_limit integer default 2)
returns setof public.backup_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if p_worker_id is null or p_limit not between 1 and 5 then
    raise exception 'invalid backup claim request' using errcode = '22023';
  end if;
  update public.backup_jobs set
    status = case when attempt_count >= 3
      then 'failed'::public.backup_status else 'queued'::public.backup_status end,
    checksum_status = case when attempt_count >= 3 then 'failed' else checksum_status end,
    failure_category = case when attempt_count >= 3 then 'worker_timeout' else failure_category end,
    locked_at = null,
    locked_by = null,
    started_at = case when attempt_count >= 3 then started_at else null end,
    completed_at = case when attempt_count >= 3 then statement_timestamp() else null end,
    updated_at = statement_timestamp()
  where status = 'processing'
    and locked_at < statement_timestamp() - interval '15 minutes';
  if exists (select 1 from public.restore_jobs where status in ('approved', 'restoring')) then
    return;
  end if;
  return query
  with candidates as (
    select id from public.backup_jobs
    where status = 'queued'
    order by created_at, id
    for update skip locked limit p_limit
  )
  update public.backup_jobs as b set
    status = 'processing', locked_at = statement_timestamp(), locked_by = p_worker_id,
    started_at = statement_timestamp(), attempt_count = b.attempt_count + 1,
    updated_at = statement_timestamp()
  from candidates where b.id = candidates.id
  returning b.*;
end;
$$;

create or replace function public.backup_export_snapshot(p_backup_id uuid, p_worker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.backup_assert_service_role();
  if not exists (
    select 1 from public.backup_jobs where id = p_backup_id
      and status = 'processing' and locked_by = p_worker_id
  ) then
    raise exception 'backup job lock is unavailable' using errcode = '42501';
  end if;

  -- One statement supplies one MVCC snapshot and deterministic row order.
  select jsonb_build_object(
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.profiles t),
    'barangays', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.barangays t),
    'puroks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.puroks t),
    'households', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.households t),
    'residents', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.residents t),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.appointments t),
    'health_encounters', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.health_encounters t),
    'vital_signs', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.vital_signs t),
    'resident_allergies', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.resident_allergies t),
    'resident_medical_history', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.resident_medical_history t),
    'maternal_pregnancies', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.maternal_pregnancies t),
    'maternal_prenatal_visits', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.maternal_prenatal_visits t),
    'maternal_delivery_outcomes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.maternal_delivery_outcomes t),
    'maternal_postnatal_visits', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.maternal_postnatal_visits t),
    'child_health_profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.child_health_profiles t),
    'child_growth_measurements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.child_growth_measurements t),
    'child_immunizations', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.child_immunizations t),
    'child_health_visits', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.child_health_visits t),
    'clinical_referrals', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.clinical_referrals t),
    'announcements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.announcements t),
    'faq_entries', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.faq_entries t),
    'health_center_information', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.health_center_information t),
    'resident_inquiries', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.resident_inquiries t),
    'notification_preferences', (select coalesce(jsonb_agg(to_jsonb(t) order by t.profile_id), '[]') from public.notification_preferences t)
  ) into result;
  return result;
end;
$$;

create or replace function public.backup_complete_job(
  p_backup_id uuid, p_worker_id uuid, p_storage_path text,
  p_package_sha256 text, p_size_bytes bigint, p_file_count integer,
  p_record_counts jsonb, p_report jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  update public.backup_jobs set status = 'completed', storage_path = p_storage_path,
    package_sha256 = p_package_sha256, checksum_status = 'verified',
    size_bytes = p_size_bytes, file_count = p_file_count,
    record_counts = p_record_counts, report = p_report,
    completed_at = statement_timestamp(), locked_at = null, locked_by = null,
    updated_at = statement_timestamp()
  where id = p_backup_id and status = 'processing' and locked_by = p_worker_id;
  if not found then raise exception 'backup completion lock is unavailable' using errcode = '42501'; end if;
end;
$$;

create or replace function public.backup_fail_job(
  p_backup_id uuid, p_worker_id uuid, p_failure_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  if p_failure_category !~ '^[a-z][a-z0-9_]{1,49}$' then
    raise exception 'invalid backup failure category' using errcode = '22023';
  end if;
  update public.backup_jobs set status = 'failed', checksum_status = 'failed',
    failure_category = p_failure_category, locked_at = null, locked_by = null,
    completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = p_backup_id and status = 'processing' and locked_by = p_worker_id;
end;
$$;

create or replace function public.backup_retention_candidates()
returns table(id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  return query
  select ranked.id, ranked.storage_path from (
    select b.id, b.storage_path,
      row_number() over (order by b.completed_at desc, b.id desc) position,
      c.retention_count
    from public.backup_jobs b cross join public.backup_configuration c
    where b.status = 'completed' and b.mode = 'automatic' and c.id
  ) ranked where ranked.position > ranked.retention_count;
end;
$$;

create or replace function public.backup_mark_deleted(p_backup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  update public.backup_jobs set status = 'deleted', storage_path = null,
    deleted_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = p_backup_id and status = 'completed';
end;
$$;

create or replace function public.backup_restore_staging_candidates()
returns table(id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  return query
  select r.id, r.storage_path from public.restore_jobs r
  where r.staging_deleted_at is null
    and (
      r.status in ('completed', 'failed', 'cancelled')
      or (r.status = 'validated' and r.confirmation_expires_at <= statement_timestamp())
      or (r.status = 'approved' and r.updated_at < statement_timestamp() - interval '15 minutes')
    )
  order by r.created_at
  limit 20;
end;
$$;

create or replace function public.backup_restore_mark_staging_deleted(p_restore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  update public.restore_jobs set
    status = case when status in ('validated'::public.restore_status, 'approved'::public.restore_status)
      then 'cancelled'::public.restore_status else status end,
    confirmation_hash = repeat('0', 64),
    staging_deleted_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = p_restore_id and staging_deleted_at is null;
end;
$$;

create or replace function public.backup_restore_stage_register(
  p_actor_id uuid, p_restore_id uuid, p_backup_name text, p_storage_path text,
  p_package_sha256 text, p_backup_version text, p_application_version text,
  p_schema_version integer, p_backup_created_at timestamptz,
  p_files text[], p_preview_counts jsonb,
  p_warnings text[], p_confirmation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.restore_jobs%rowtype;
begin
  perform public.backup_assert_service_role();
  if not exists (select 1 from public.profiles p where p.id = p_actor_id
    and p.role = 'admin' and p.account_status = 'active') then
    raise exception 'restore administration requires an active administrator' using errcode = '42501';
  end if;
  insert into public.restore_jobs(
    id, backup_name, requested_by, storage_path, package_sha256,
    checksum_verified, backup_version, application_version, schema_version,
    backup_created_at, files, preview_counts, warnings, confirmation_hash,
    confirmation_expires_at
  ) values (
    p_restore_id, p_backup_name, p_actor_id, p_storage_path, p_package_sha256,
    true, p_backup_version, p_application_version, p_schema_version,
    p_backup_created_at, p_files, p_preview_counts, p_warnings, p_confirmation_hash,
    statement_timestamp() + interval '10 minutes'
  ) returning * into result;
  return to_jsonb(result) - array['storage_path', 'confirmation_hash', 'requested_by'];
end;
$$;

create or replace function public.backup_preview_rows(
  p_table regclass, p_key text, p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming jsonb;
  existing jsonb;
  key_value text;
  missing_count integer := 0;
  identical_count integer := 0;
  conflict_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'restore preview table payload must be an array' using errcode = '22023';
  end if;
  for incoming in execute format(
    'select to_jsonb(r) from jsonb_populate_recordset(null::%s, $1) r', p_table
  ) using p_rows loop
    key_value := incoming ->> p_key;
    if key_value is null then
      raise exception 'restore preview row has no primary key' using errcode = '22023';
    end if;
    execute format('select to_jsonb(t) from %s t where t.%I::text = $1', p_table, p_key)
      into existing using key_value;
    if existing is null then
      missing_count := missing_count + 1;
    elsif existing = incoming then
      identical_count := identical_count + 1;
    else
      conflict_count := conflict_count + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'new_rows', missing_count,
    'identical_rows', identical_count,
    'conflicts', conflict_count
  );
end;
$$;

revoke all on function public.backup_preview_rows(regclass, text, jsonb)
  from public, anon, authenticated;

create or replace function public.backup_restore_dry_run(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_names constant text[] := array[
    'profiles', 'barangays', 'puroks', 'households', 'residents', 'appointments',
    'health_encounters', 'vital_signs', 'resident_allergies', 'resident_medical_history',
    'maternal_pregnancies', 'maternal_prenatal_visits', 'maternal_delivery_outcomes',
    'maternal_postnatal_visits', 'child_health_profiles', 'child_growth_measurements',
    'child_immunizations', 'child_health_visits', 'clinical_referrals', 'announcements',
    'faq_entries', 'health_center_information', 'resident_inquiries',
    'notification_preferences'
  ];
  primary_keys constant text[] := array[
    'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id',
    'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'id', 'profile_id'
  ];
  index_value integer;
  table_report jsonb;
  tables_report jsonb := '{}'::jsonb;
  new_total integer := 0;
  identical_total integer := 0;
  conflict_total integer := 0;
  missing_auth integer;
begin
  perform public.backup_assert_service_role();
  for index_value in 1..array_length(table_names, 1) loop
    table_report := public.backup_preview_rows(
      format('public.%I', table_names[index_value])::regclass,
      primary_keys[index_value],
      coalesce(p_payload -> table_names[index_value], '[]'::jsonb)
    );
    tables_report := tables_report || jsonb_build_object(table_names[index_value], table_report);
    new_total := new_total + (table_report ->> 'new_rows')::integer;
    identical_total := identical_total + (table_report ->> 'identical_rows')::integer;
    conflict_total := conflict_total + (table_report ->> 'conflicts')::integer;
  end loop;

  select count(*)::integer into missing_auth
  from jsonb_to_recordset(coalesce(p_payload -> 'profiles', '[]'::jsonb)) as supplied(id uuid)
  left join auth.users as auth_user on auth_user.id = supplied.id
  where auth_user.id is null;

  return jsonb_build_object(
    'new_rows', new_total,
    'identical_rows', identical_total,
    'conflicts', conflict_total,
    'missing_auth_users', missing_auth,
    'tables', tables_report
  );
end;
$$;

create or replace function public.backup_restore_confirm(p_restore_id uuid, p_confirmation_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.backup_assert_admin();
  restore_record public.restore_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if exists (select 1 from public.backup_jobs where status in ('queued', 'processing')) then
    raise exception 'restore cannot be confirmed while a backup is in progress' using errcode = 'P0001';
  end if;
  select * into restore_record from public.restore_jobs
  where id = p_restore_id and requested_by = actor_id for update;
  if not found or restore_record.status <> 'validated'
    or restore_record.confirmation_expires_at <= statement_timestamp()
    or restore_record.confirmation_hash <> encode(digest(p_confirmation_token, 'sha256'), 'hex') then
    raise exception 'restore confirmation is invalid or expired' using errcode = '42501';
  end if;
  update public.restore_jobs set status = 'approved', confirmation_hash = repeat('0', 64),
    updated_at = statement_timestamp() where id = p_restore_id;
  return jsonb_build_object('id', p_restore_id, 'status', 'approved');
end;
$$;

create or replace function public.backup_restore_cancel(p_restore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.backup_assert_admin();
begin
  update public.restore_jobs set status = 'cancelled', confirmation_hash = repeat('0', 64),
    updated_at = statement_timestamp()
  where id = p_restore_id and requested_by = actor_id and status in ('validated', 'approved');
end;
$$;

create or replace function public.backup_merge_rows(
  p_table regclass, p_key text, p_rows jsonb, p_ignored_columns text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming jsonb;
  existing jsonb;
  key_value text;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'restore table payload must be an array' using errcode = '22023';
  end if;
  for incoming in execute format(
    'select to_jsonb(r) from jsonb_populate_recordset(null::%s, $1) r', p_table
  ) using p_rows loop
    key_value := incoming ->> p_key;
    if key_value is null then raise exception 'restore row has no primary key' using errcode = '22023'; end if;
    execute format('select to_jsonb(t) from %s t where t.%I::text = $1', p_table, p_key)
      into existing using key_value;
    if existing is null then
      execute format(
        'insert into %s select * from jsonb_populate_record(null::%s, $1)', p_table, p_table
      ) using incoming;
      inserted_count := inserted_count + 1;
    elsif existing - p_ignored_columns = incoming - p_ignored_columns then
      skipped_count := skipped_count + 1;
    else
      raise exception 'restore conflict in % for key %', p_table::text, key_value
        using errcode = '40001';
    end if;
  end loop;
  return jsonb_build_object('restored', inserted_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.backup_merge_rows(regclass, text, jsonb, text[]) from public, anon, authenticated;

create or replace function public.backup_restore_apply(p_restore_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restore_record public.restore_jobs%rowtype;
  report jsonb := '{}'::jsonb;
  started timestamptz := clock_timestamp();
  actor_id uuid;
  households jsonb;
  appointments jsonb;
  encounters jsonb;
  dry_run jsonb;
begin
  perform public.backup_assert_service_role();
  perform pg_advisory_xact_lock(hashtextextended('alaga-backup-queue', 0));
  if exists (select 1 from public.backup_jobs where status in ('queued', 'processing')) then
    raise exception 'restore cannot start while a backup is in progress' using errcode = 'P0001';
  end if;
  select * into restore_record from public.restore_jobs where id = p_restore_id for update;
  if not found or restore_record.status <> 'approved' or not restore_record.checksum_verified
    or restore_record.schema_version <> 33 or restore_record.backup_version <> '1.0' then
    raise exception 'restore package is not approved or compatible' using errcode = '42501';
  end if;
  actor_id := restore_record.requested_by;
  dry_run := public.backup_restore_dry_run(p_payload);
  if (dry_run ->> 'conflicts')::integer > 0 then
    raise exception 'restore conflict detected during final dry run' using errcode = '40001';
  end if;
  if (dry_run ->> 'missing_auth_users')::integer > 0 then
    raise exception 'required Supabase Auth users are missing' using errcode = '23503';
  end if;
  report := jsonb_build_object('dry_run', dry_run);
  update public.restore_jobs set status = 'restoring', started_at = statement_timestamp(),
    updated_at = statement_timestamp() where id = p_restore_id;

  lock table public.profiles, public.barangays, public.puroks, public.households,
    public.residents, public.appointments, public.health_encounters, public.vital_signs,
    public.resident_allergies, public.resident_medical_history,
    public.maternal_pregnancies, public.maternal_prenatal_visits,
    public.maternal_delivery_outcomes, public.maternal_postnatal_visits,
    public.child_health_profiles, public.child_growth_measurements,
    public.child_immunizations, public.child_health_visits, public.clinical_referrals,
    public.announcements, public.faq_entries, public.health_center_information,
    public.resident_inquiries, public.notification_preferences in share row exclusive mode;

  alter table public.profiles disable trigger user;
  alter table public.barangays disable trigger user;
  alter table public.puroks disable trigger user;
  alter table public.households disable trigger user;
  alter table public.residents disable trigger user;
  alter table public.appointments disable trigger user;
  alter table public.health_encounters disable trigger user;
  alter table public.vital_signs disable trigger user;
  alter table public.resident_allergies disable trigger user;
  alter table public.resident_medical_history disable trigger user;
  alter table public.maternal_pregnancies disable trigger user;
  alter table public.maternal_prenatal_visits disable trigger user;
  alter table public.maternal_delivery_outcomes disable trigger user;
  alter table public.maternal_postnatal_visits disable trigger user;
  alter table public.child_health_profiles disable trigger user;
  alter table public.child_growth_measurements disable trigger user;
  alter table public.child_immunizations disable trigger user;
  alter table public.child_health_visits disable trigger user;
  alter table public.clinical_referrals disable trigger user;
  alter table public.announcements disable trigger user;
  alter table public.faq_entries disable trigger user;
  alter table public.health_center_information disable trigger user;
  alter table public.resident_inquiries disable trigger user;
  alter table public.notification_preferences disable trigger user;

  households := coalesce(p_payload->'households', '[]'::jsonb);
  appointments := coalesce(p_payload->'appointments', '[]'::jsonb);
  encounters := coalesce(p_payload->'health_encounters', '[]'::jsonb);
  report := report || jsonb_build_object('profiles', public.backup_merge_rows('public.profiles', 'id', p_payload->'profiles'));
  report := report || jsonb_build_object('barangays', public.backup_merge_rows('public.barangays', 'id', p_payload->'barangays'));
  report := report || jsonb_build_object('puroks', public.backup_merge_rows('public.puroks', 'id', p_payload->'puroks'));
  report := report || jsonb_build_object('households', public.backup_merge_rows('public.households', 'id',
    (select coalesce(jsonb_agg(value || jsonb_build_object('head_resident_id', null)), '[]'::jsonb) from jsonb_array_elements(households)), array['head_resident_id']));
  report := report || jsonb_build_object('residents', public.backup_merge_rows('public.residents', 'id', p_payload->'residents'));
  report := report || jsonb_build_object('appointments', public.backup_merge_rows('public.appointments', 'id',
    (select coalesce(jsonb_agg(value || jsonb_build_object('rescheduled_from_id', null)), '[]'::jsonb) from jsonb_array_elements(appointments)), array['rescheduled_from_id']));
  report := report || jsonb_build_object('health_encounters', public.backup_merge_rows('public.health_encounters', 'id',
    (select coalesce(jsonb_agg(value || jsonb_build_object('amends_encounter_id', null)), '[]'::jsonb) from jsonb_array_elements(encounters)), array['amends_encounter_id']));
  report := report || jsonb_build_object('vital_signs', public.backup_merge_rows('public.vital_signs', 'id', p_payload->'vital_signs'));
  report := report || jsonb_build_object('resident_allergies', public.backup_merge_rows('public.resident_allergies', 'id', p_payload->'resident_allergies'));
  report := report || jsonb_build_object('resident_medical_history', public.backup_merge_rows('public.resident_medical_history', 'id', p_payload->'resident_medical_history'));
  report := report || jsonb_build_object('maternal_pregnancies', public.backup_merge_rows('public.maternal_pregnancies', 'id', p_payload->'maternal_pregnancies'));
  report := report || jsonb_build_object('maternal_prenatal_visits', public.backup_merge_rows('public.maternal_prenatal_visits', 'id', p_payload->'maternal_prenatal_visits'));
  report := report || jsonb_build_object('maternal_delivery_outcomes', public.backup_merge_rows('public.maternal_delivery_outcomes', 'id', p_payload->'maternal_delivery_outcomes'));
  report := report || jsonb_build_object('maternal_postnatal_visits', public.backup_merge_rows('public.maternal_postnatal_visits', 'id', p_payload->'maternal_postnatal_visits'));
  report := report || jsonb_build_object('child_health_profiles', public.backup_merge_rows('public.child_health_profiles', 'id', p_payload->'child_health_profiles'));
  report := report || jsonb_build_object('child_growth_measurements', public.backup_merge_rows('public.child_growth_measurements', 'id', p_payload->'child_growth_measurements'));
  report := report || jsonb_build_object('child_immunizations', public.backup_merge_rows('public.child_immunizations', 'id', p_payload->'child_immunizations'));
  report := report || jsonb_build_object('child_health_visits', public.backup_merge_rows('public.child_health_visits', 'id', p_payload->'child_health_visits'));
  report := report || jsonb_build_object('clinical_referrals', public.backup_merge_rows('public.clinical_referrals', 'id', p_payload->'clinical_referrals'));
  report := report || jsonb_build_object('announcements', public.backup_merge_rows('public.announcements', 'id', p_payload->'announcements'));
  report := report || jsonb_build_object('faq_entries', public.backup_merge_rows('public.faq_entries', 'id', p_payload->'faq_entries'));
  report := report || jsonb_build_object('health_center_information', public.backup_merge_rows('public.health_center_information', 'id', p_payload->'health_center_information'));
  report := report || jsonb_build_object('resident_inquiries', public.backup_merge_rows('public.resident_inquiries', 'id', p_payload->'resident_inquiries'));
  report := report || jsonb_build_object('notification_preferences', public.backup_merge_rows('public.notification_preferences', 'profile_id', p_payload->'notification_preferences'));

  update public.households h set head_resident_id = (x.value->>'head_resident_id')::uuid
  from jsonb_array_elements(households) x(value)
  where h.id = (x.value->>'id')::uuid and x.value->>'head_resident_id' is not null
    and h.head_resident_id is null;
  update public.appointments a set rescheduled_from_id = (x.value->>'rescheduled_from_id')::uuid
  from jsonb_array_elements(appointments) x(value)
  where a.id = (x.value->>'id')::uuid and x.value->>'rescheduled_from_id' is not null
    and a.rescheduled_from_id is null;
  update public.health_encounters e set amends_encounter_id = (x.value->>'amends_encounter_id')::uuid
  from jsonb_array_elements(encounters) x(value)
  where e.id = (x.value->>'id')::uuid and x.value->>'amends_encounter_id' is not null
    and e.amends_encounter_id is null;

  if exists (
    select 1 from jsonb_array_elements(households) x(value)
    join public.households h on h.id = (x.value->>'id')::uuid
    where h.head_resident_id is distinct from (x.value->>'head_resident_id')::uuid
  ) or exists (
    select 1 from jsonb_array_elements(appointments) x(value)
    join public.appointments a on a.id = (x.value->>'id')::uuid
    where a.rescheduled_from_id is distinct from (x.value->>'rescheduled_from_id')::uuid
  ) or exists (
    select 1 from jsonb_array_elements(encounters) x(value)
    join public.health_encounters e on e.id = (x.value->>'id')::uuid
    where e.amends_encounter_id is distinct from (x.value->>'amends_encounter_id')::uuid
  ) then
    raise exception 'restore conflict in deferred relationship' using errcode = '40001';
  end if;

  alter table public.profiles enable trigger user;
  alter table public.barangays enable trigger user;
  alter table public.puroks enable trigger user;
  alter table public.households enable trigger user;
  alter table public.residents enable trigger user;
  alter table public.appointments enable trigger user;
  alter table public.health_encounters enable trigger user;
  alter table public.vital_signs enable trigger user;
  alter table public.resident_allergies enable trigger user;
  alter table public.resident_medical_history enable trigger user;
  alter table public.maternal_pregnancies enable trigger user;
  alter table public.maternal_prenatal_visits enable trigger user;
  alter table public.maternal_delivery_outcomes enable trigger user;
  alter table public.maternal_postnatal_visits enable trigger user;
  alter table public.child_health_profiles enable trigger user;
  alter table public.child_growth_measurements enable trigger user;
  alter table public.child_immunizations enable trigger user;
  alter table public.child_health_visits enable trigger user;
  alter table public.clinical_referrals enable trigger user;
  alter table public.announcements enable trigger user;
  alter table public.faq_entries enable trigger user;
  alter table public.health_center_information enable trigger user;
  alter table public.resident_inquiries enable trigger user;
  alter table public.notification_preferences enable trigger user;

  perform setval('public.resident_number_seq', greatest(1, coalesce((select substring(resident_number from '[0-9]+$')::bigint from public.residents order by substring(resident_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.household_number_seq', greatest(1, coalesce((select substring(household_number from '[0-9]+$')::bigint from public.households order by substring(household_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.appointment_number_seq', greatest(1, coalesce((select substring(appointment_number from '[0-9]+$')::bigint from public.appointments order by substring(appointment_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.health_encounter_number_seq', greatest(1, coalesce((select substring(encounter_number from '[0-9]+$')::bigint from public.health_encounters order by substring(encounter_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.maternal_pregnancy_number_seq', greatest(1, coalesce((select substring(pregnancy_number from '[0-9]+$')::bigint from public.maternal_pregnancies order by substring(pregnancy_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.child_health_profile_number_seq', greatest(1, coalesce((select substring(child_number from '[0-9]+$')::bigint from public.child_health_profiles order by substring(child_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.referral_number_seq', greatest(1, coalesce((select substring(referral_number from '[0-9]+$')::bigint from public.clinical_referrals order by substring(referral_number from '[0-9]+$')::bigint desc limit 1), 1)), true);
  perform setval('public.inquiry_number_seq', greatest(1, coalesce((select substring(inquiry_number from '[0-9]+$')::bigint from public.resident_inquiries order by substring(inquiry_number from '[0-9]+$')::bigint desc limit 1), 1)), true);

  report := report || jsonb_build_object(
    'duration_ms', floor(extract(epoch from (clock_timestamp() - started)) * 1000)::integer,
    'integrity', 'verified', 'rollback', 'transactional'
  );
  update public.restore_jobs set status = 'completed', report = report,
    completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = p_restore_id;
  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, summary)
  values (actor_id, 'backup.restore_completed', 'restore_jobs', p_restore_id,
    'Restored an integrity-verified application backup');
  return report;
exception when others then
  -- The whole function call, including status and trigger changes, rolls back.
  raise;
end;
$$;

create or replace function public.backup_restore_fail(
  p_restore_id uuid, p_failure_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.backup_assert_service_role();
  if p_failure_category !~ '^[a-z][a-z0-9_]{1,49}$' then
    raise exception 'invalid restore failure category' using errcode = '22023';
  end if;
  update public.restore_jobs set status = 'failed', failure_category = p_failure_category,
    completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = p_restore_id and status in ('validated', 'approved', 'restoring');
end;
$$;

revoke all on function public.backup_enqueue_manual() from public, anon;
revoke all on function public.backup_retry(uuid) from public, anon;
revoke all on function public.backup_schedule_update(public.backup_frequency, integer, bigint) from public, anon;
revoke all on function public.backup_admin_dashboard(integer) from public, anon;
revoke all on function public.backup_restore_confirm(uuid, text) from public, anon;
revoke all on function public.backup_restore_cancel(uuid) from public, anon;
grant execute on function public.backup_enqueue_manual() to authenticated;
grant execute on function public.backup_retry(uuid) to authenticated;
grant execute on function public.backup_schedule_update(public.backup_frequency, integer, bigint) to authenticated;
grant execute on function public.backup_admin_dashboard(integer) to authenticated;
grant execute on function public.backup_restore_confirm(uuid, text) to authenticated;
grant execute on function public.backup_restore_cancel(uuid) to authenticated;

revoke all on function public.backup_enqueue_due_automatic() from public, anon, authenticated;
revoke all on function public.backup_claim_jobs(uuid, integer) from public, anon, authenticated;
revoke all on function public.backup_export_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.backup_complete_job(uuid, uuid, text, text, bigint, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.backup_fail_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.backup_retention_candidates() from public, anon, authenticated;
revoke all on function public.backup_mark_deleted(uuid) from public, anon, authenticated;
revoke all on function public.backup_restore_staging_candidates() from public, anon, authenticated;
revoke all on function public.backup_restore_mark_staging_deleted(uuid) from public, anon, authenticated;
revoke all on function public.backup_restore_stage_register(uuid, uuid, text, text, text, text, text, integer, timestamptz, text[], jsonb, text[], text) from public, anon, authenticated;
revoke all on function public.backup_restore_dry_run(jsonb) from public, anon, authenticated;
revoke all on function public.backup_restore_apply(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.backup_restore_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.backup_enqueue_due_automatic() to service_role;
grant execute on function public.backup_claim_jobs(uuid, integer) to service_role;
grant execute on function public.backup_export_snapshot(uuid, uuid) to service_role;
grant execute on function public.backup_complete_job(uuid, uuid, text, text, bigint, integer, jsonb, jsonb) to service_role;
grant execute on function public.backup_fail_job(uuid, uuid, text) to service_role;
grant execute on function public.backup_retention_candidates() to service_role;
grant execute on function public.backup_mark_deleted(uuid) to service_role;
grant execute on function public.backup_restore_staging_candidates() to service_role;
grant execute on function public.backup_restore_mark_staging_deleted(uuid) to service_role;
grant execute on function public.backup_restore_stage_register(uuid, uuid, text, text, text, text, text, integer, timestamptz, text[], jsonb, text[], text) to service_role;
grant execute on function public.backup_restore_dry_run(jsonb) to service_role;
grant execute on function public.backup_restore_apply(uuid, jsonb) to service_role;
grant execute on function public.backup_restore_fail(uuid, text) to service_role;

comment on table public.backup_jobs is
  'Minimized application-backup history; archives are private Storage objects.';
comment on function public.backup_restore_apply(uuid, jsonb) is
  'Service-role-only merge-missing restore. Conflicts abort the transaction.';

commit;
