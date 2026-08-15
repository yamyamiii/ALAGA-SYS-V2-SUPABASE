-- DEVELOPMENT/TEST RESET ONLY — DO NOT RUN ON A PRODUCTION DATABASE WITH REAL PATIENT DATA.
--
-- Manual, one-time appointment test-data reset for ALAGA-SYS through Migration 41.
-- This file is intentionally outside supabase/migrations and is never run by db push.
-- It does not delete residents, profiles/auth users, staff accounts, announcements,
-- role assignments, health-center configuration, or clinical records.
--
-- Required operator procedure:
--   1. Confirm the Supabase project shown by the SQL editor is the intended test project.
--      The repository's currently linked project ref is: untiftyqzdvzjdqxwens
--   2. Run the preflight SELECTs and review every count and clinical-link result.
--   3. If any clinical-link row is returned, stop. Review and, only when the records
--      are confirmed test data, run the separately guarded optional companion script:
--      scripts/reset-appointment-linked-clinical-test-data-OPTIONAL.sql
--   4. Uncomment the SET LOCAL confirmation below only for the final reviewed run.
--   5. Keep COMMIT for the real reset, or replace COMMIT with ROLLBACK for a rehearsal.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';

-- This explicit confirmation is deliberately commented out. The script fails closed
-- until an operator reviews the target project and uncomments this exact line.
-- set local alaga.appointment_test_reset_confirmation = 'untiftyqzdvzjdqxwens:RESET ALL APPOINTMENT TEST DATA';

-- Connection identity is informational. Supabase does not expose a portable,
-- trustworthy project-ref setting inside ordinary PostgreSQL sessions, so the
-- project-ref confirmation above remains an intentional operator responsibility.
select
  current_database() as database_name,
  current_user as database_user,
  inet_server_addr() as server_address,
  inet_server_port() as server_port,
  statement_timestamp() as inspected_at;

-- Fail safely if the deployed schema has drifted or gained another appointment FK.
do $schema_guard$
declare
  missing_tables text[];
  missing_expected_fks text[];
  unexpected_fks text[];
begin
  select array_agg(required_name order by required_name)
  into missing_tables
  from unnest(array[
    'public.appointments',
    'public.appointment_request_events',
    'public.health_encounters',
    'public.maternal_prenatal_visits',
    'public.maternal_postnatal_visits',
    'public.child_growth_measurements',
    'public.child_health_visits',
    'public.assistance_notifications',
    'public.outbound_notification_jobs',
    'public.notification_delivery_attempts',
    'public.audit_logs',
    'public.appointment_number_seq'
  ]) as required_name
  where to_regclass(required_name) is null;

  if missing_tables is not null then
    raise exception 'appointment reset refused: required relations are missing: %',
      array_to_string(missing_tables, ', ');
  end if;

  with expected(table_name, column_name) as (
    values
      ('public.appointments', 'rescheduled_from_id'),
      ('public.appointment_request_events', 'appointment_id'),
      ('public.health_encounters', 'appointment_id'),
      ('public.maternal_prenatal_visits', 'appointment_id'),
      ('public.maternal_postnatal_visits', 'appointment_id'),
      ('public.child_growth_measurements', 'appointment_id'),
      ('public.child_health_visits', 'appointment_id')
  ), actual as (
    select
      format('%I.%I', constraint_schema.nspname, constraint_table.relname) as table_name,
      column_attribute.attname::text as column_name
    from pg_constraint as constraint_record
    join pg_class as constraint_table
      on constraint_table.oid = constraint_record.conrelid
    join pg_namespace as constraint_schema
      on constraint_schema.oid = constraint_table.relnamespace
    join pg_attribute as column_attribute
      on column_attribute.attrelid = constraint_record.conrelid
      and column_attribute.attnum = constraint_record.conkey[1]
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.appointments'::regclass
      and array_length(constraint_record.conkey, 1) = 1
  )
  select array_agg(expected.table_name || '.' || expected.column_name
    order by expected.table_name, expected.column_name)
  into missing_expected_fks
  from expected
  left join actual using (table_name, column_name)
  where actual.table_name is null;

  if missing_expected_fks is not null then
    raise exception 'appointment reset refused: expected appointment FKs are missing: %',
      array_to_string(missing_expected_fks, ', ');
  end if;

  with expected(table_name, column_name) as (
    values
      ('public.appointments', 'rescheduled_from_id'),
      ('public.appointment_request_events', 'appointment_id'),
      ('public.health_encounters', 'appointment_id'),
      ('public.maternal_prenatal_visits', 'appointment_id'),
      ('public.maternal_postnatal_visits', 'appointment_id'),
      ('public.child_growth_measurements', 'appointment_id'),
      ('public.child_health_visits', 'appointment_id')
  ), actual as (
    select
      format('%I.%I', constraint_schema.nspname, constraint_table.relname) as table_name,
      column_attribute.attname::text as column_name
    from pg_constraint as constraint_record
    join pg_class as constraint_table
      on constraint_table.oid = constraint_record.conrelid
    join pg_namespace as constraint_schema
      on constraint_schema.oid = constraint_table.relnamespace
    join pg_attribute as column_attribute
      on column_attribute.attrelid = constraint_record.conrelid
      and column_attribute.attnum = constraint_record.conkey[1]
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.appointments'::regclass
      and array_length(constraint_record.conkey, 1) = 1
  )
  select array_agg(actual.table_name || '.' || actual.column_name
    order by actual.table_name, actual.column_name)
  into unexpected_fks
  from actual
  left join expected using (table_name, column_name)
  where expected.table_name is null;

  if unexpected_fks is not null then
    raise exception 'appointment reset refused: review newly discovered appointment FKs: %',
      array_to_string(unexpected_fks, ', ');
  end if;
end;
$schema_guard$;

-- Prevent a concurrent workflow from inserting or changing appointment data while
-- the reviewed target set and its exact dependent artifacts are being removed.
lock table public.appointments in access exclusive mode;
lock table public.appointment_request_events,
  public.health_encounters,
  public.maternal_prenatal_visits,
  public.maternal_postnatal_visits,
  public.child_growth_measurements,
  public.child_health_visits,
  public.assistance_notifications,
  public.outbound_notification_jobs,
  public.notification_delivery_attempts,
  public.audit_logs in share row exclusive mode;

create temporary table appointment_reset_targets (
  id uuid primary key,
  appointment_number text not null
) on commit drop;

insert into appointment_reset_targets(id, appointment_number)
select appointment.id, appointment.appointment_number
from public.appointments as appointment;

create temporary table appointment_reset_job_targets (
  id uuid primary key
) on commit drop;

insert into appointment_reset_job_targets(id)
select job.id
from public.outbound_notification_jobs as job
join appointment_reset_targets as target on target.id = job.source_id
where job.source_type = 'appointments';

-- Pre-cleanup counts. These are identifiers/counts only and contain no clinical text.
select 'appointments' as relation_name, count(*)::bigint as rows_to_delete
from appointment_reset_targets
union all
select 'appointment_request_events', count(*)::bigint
from public.appointment_request_events as event
join appointment_reset_targets as target on target.id = event.appointment_id
union all
select 'assistance_notifications', count(*)::bigint
from public.assistance_notifications as notification
join appointment_reset_targets as target on target.id = notification.source_id
where notification.source_type = 'appointments'
union all
select 'outbound_notification_jobs', count(*)::bigint
from appointment_reset_job_targets
union all
select 'notification_delivery_attempts', count(*)::bigint
from public.notification_delivery_attempts as attempt
join appointment_reset_job_targets as job on job.id = attempt.job_id
union all
select 'appointment_audit_logs', count(*)::bigint
from public.audit_logs as audit
join appointment_reset_targets as target on target.id = audit.entity_id
where audit.entity_type = 'appointments'
union all
select 'outbound_job_audit_logs', count(*)::bigint
from public.audit_logs as audit
join appointment_reset_job_targets as job on job.id = audit.entity_id
where audit.entity_type = 'outbound_notification_jobs'
order by relation_name;

-- Clinical preflight. Any returned row requires an explicit human decision.
-- Narrative fields are intentionally not selected.
select
  'health_encounters'::text as clinical_relation,
  encounter.id as clinical_record_id,
  encounter.encounter_number as safe_record_number,
  encounter.appointment_id,
  target.appointment_number
from public.health_encounters as encounter
join appointment_reset_targets as target on target.id = encounter.appointment_id
union all
select
  'maternal_prenatal_visits', visit.id, null, visit.appointment_id,
  target.appointment_number
from public.maternal_prenatal_visits as visit
join appointment_reset_targets as target on target.id = visit.appointment_id
union all
select
  'maternal_postnatal_visits', visit.id, null, visit.appointment_id,
  target.appointment_number
from public.maternal_postnatal_visits as visit
join appointment_reset_targets as target on target.id = visit.appointment_id
union all
select
  'child_growth_measurements', measurement.id, null,
  measurement.appointment_id, target.appointment_number
from public.child_growth_measurements as measurement
join appointment_reset_targets as target on target.id = measurement.appointment_id
union all
select
  'child_health_visits', visit.id, null, visit.appointment_id,
  target.appointment_number
from public.child_health_visits as visit
join appointment_reset_targets as target on target.id = visit.appointment_id
order by clinical_relation, safe_record_number nulls last, clinical_record_id;

do $clinical_guard$
declare
  linked_health_encounters bigint;
  linked_prenatal_visits bigint;
  linked_postnatal_visits bigint;
  linked_growth_measurements bigint;
  linked_child_visits bigint;
begin
  select count(*) into linked_health_encounters
  from public.health_encounters as encounter
  join appointment_reset_targets as target on target.id = encounter.appointment_id;

  select count(*) into linked_prenatal_visits
  from public.maternal_prenatal_visits as visit
  join appointment_reset_targets as target on target.id = visit.appointment_id;

  select count(*) into linked_postnatal_visits
  from public.maternal_postnatal_visits as visit
  join appointment_reset_targets as target on target.id = visit.appointment_id;

  select count(*) into linked_growth_measurements
  from public.child_growth_measurements as measurement
  join appointment_reset_targets as target on target.id = measurement.appointment_id;

  select count(*) into linked_child_visits
  from public.child_health_visits as visit
  join appointment_reset_targets as target on target.id = visit.appointment_id;

  if linked_health_encounters + linked_prenatal_visits
      + linked_postnatal_visits + linked_growth_measurements
      + linked_child_visits > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'appointment reset refused: linked clinical records require review (health_encounters=%s, prenatal=%s, postnatal=%s, growth=%s, child_visits=%s)',
        linked_health_encounters,
        linked_prenatal_visits,
        linked_postnatal_visits,
        linked_growth_measurements,
        linked_child_visits
      );
  end if;
end;
$clinical_guard$;

-- The destructive phase remains unreachable until the operator confirms the
-- reviewed project and preflight results.
do $guard$
begin
  if current_setting('alaga.appointment_test_reset_confirmation', true)
      is distinct from
      'untiftyqzdvzjdqxwens:RESET ALL APPOINTMENT TEST DATA' then
    raise exception using
      errcode = 'P0001',
      message = 'appointment reset refused: review the target test project and uncomment the exact SET LOCAL confirmation';
  end if;
end;
$guard$;

-- Dependency order:
--   delivery attempts -> outbound jobs -> in-app notifications -> request events
--   -> audit artifacts -> legacy self-links -> appointments.
delete from public.notification_delivery_attempts as attempt
using appointment_reset_job_targets as job
where attempt.job_id = job.id;

delete from public.outbound_notification_jobs as job
using appointment_reset_job_targets as target
where job.id = target.id;

delete from public.assistance_notifications as notification
using appointment_reset_targets as target
where notification.source_type = 'appointments'
  and notification.source_id = target.id;

delete from public.appointment_request_events as event
using appointment_reset_targets as target
where event.appointment_id = target.id;

-- audit_logs is append-only in normal operation. This narrowly scoped manual reset
-- temporarily disables only its mutation guard. PostgreSQL rolls the ALTER back if
-- any later statement fails, and the trigger is re-enabled before commit.
alter table public.audit_logs disable trigger audit_logs_append_only;

delete from public.audit_logs as audit
using appointment_reset_job_targets as job
where audit.entity_type = 'outbound_notification_jobs'
  and audit.entity_id = job.id;

delete from public.audit_logs as audit
using appointment_reset_targets as target
where audit.entity_type = 'appointments'
  and audit.entity_id = target.id;

alter table public.audit_logs enable trigger audit_logs_append_only;

-- All appointment workflow triggers are disabled only while clearing obsolete
-- self-links and deleting the already locked target set. This prevents test-reset
-- updates from generating fresh audit/notification events. FK triggers remain active.
alter table public.appointments disable trigger user;

update public.appointments as appointment
set rescheduled_from_id = null
from appointment_reset_targets as target
where appointment.id = target.id
  and appointment.rescheduled_from_id is not null;

delete from public.appointments as appointment
using appointment_reset_targets as target
where appointment.id = target.id;

alter table public.appointments enable trigger user;

do $postcondition$
begin
  if exists (select 1 from public.appointments) then
    raise exception 'appointment reset postcondition failed: appointments is not empty';
  end if;
  if exists (
    select 1 from public.appointment_request_events as event
    join appointment_reset_targets as target on target.id = event.appointment_id
  ) then
    raise exception 'appointment reset postcondition failed: request events remain';
  end if;
  if exists (
    select 1 from public.assistance_notifications as notification
    join appointment_reset_targets as target on target.id = notification.source_id
    where notification.source_type = 'appointments'
  ) then
    raise exception 'appointment reset postcondition failed: in-app notifications remain';
  end if;
  if exists (
    select 1 from public.outbound_notification_jobs as job
    join appointment_reset_targets as target on target.id = job.source_id
    where job.source_type = 'appointments'
  ) then
    raise exception 'appointment reset postcondition failed: outbound jobs remain';
  end if;
  if exists (
    select 1 from public.audit_logs as audit
    join appointment_reset_targets as target on target.id = audit.entity_id
    where audit.entity_type = 'appointments'
  ) then
    raise exception 'appointment reset postcondition failed: appointment audit rows remain';
  end if;
end;
$postcondition$;

-- Post-cleanup verification. Appointment-backed list/dashboard/calendar/queue/report
-- totals derive from public.appointments and will therefore resolve to zero.
select 'appointments_remaining' as verification, count(*)::bigint as row_count
from public.appointments
union all
select 'request_events_remaining_for_reset_ids', count(*)::bigint
from public.appointment_request_events as event
join appointment_reset_targets as target on target.id = event.appointment_id
union all
select 'in_app_notifications_remaining_for_reset_ids', count(*)::bigint
from public.assistance_notifications as notification
join appointment_reset_targets as target on target.id = notification.source_id
where notification.source_type = 'appointments'
union all
select 'outbound_jobs_remaining_for_reset_ids', count(*)::bigint
from public.outbound_notification_jobs as job
join appointment_reset_targets as target on target.id = job.source_id
where job.source_type = 'appointments'
union all
select 'appointment_audit_rows_remaining_for_reset_ids', count(*)::bigint
from public.audit_logs as audit
join appointment_reset_targets as target on target.id = audit.entity_id
where audit.entity_type = 'appointments'
order by verification;

commit;
-- For a rehearsal, replace the COMMIT above with: ROLLBACK;

-- OPTIONAL APPOINTMENT NUMBER RESTART — RUN ONLY AFTER THE RESET COMMITTED
-- and after confirming all verification counts are zero. This is intentionally
-- commented out and is not part of the reset transaction. PostgreSQL sequence
-- public.appointment_number_seq is the real generator. is_called=false makes the
-- next nextval() return 1, so a reset performed in 2026 produces APT-2026-000001.
-- Do not run this if any appointment or retained appointment artifact can reuse an
-- old appointment number.
--
-- begin;
-- set local alaga.appointment_number_reset_confirmation = 'untiftyqzdvzjdqxwens:RESTART APT NUMBER AT 1';
-- do $number_guard$
-- begin
--   if current_setting('alaga.appointment_number_reset_confirmation', true)
--       is distinct from 'untiftyqzdvzjdqxwens:RESTART APT NUMBER AT 1'
--      or exists (select 1 from public.appointments)
--      or exists (select 1 from public.appointment_request_events)
--      or exists (
--        select 1 from public.assistance_notifications
--        where source_type = 'appointments'
--      )
--      or exists (
--        select 1 from public.outbound_notification_jobs
--        where source_type = 'appointments'
--      )
--      or exists (
--        select 1 from public.audit_logs
--        where entity_type = 'appointments'
--      ) then
--     raise exception 'appointment-number reset refused';
--   end if;
-- end;
-- $number_guard$;
-- select pg_catalog.setval('public.appointment_number_seq', 1, false);
-- commit;
