-- DEVELOPMENT/TEST RESET ONLY — DO NOT RUN ON A PRODUCTION DATABASE WITH REAL PATIENT DATA.
--
-- OPTIONAL COMPANION — NOT PART OF THE APPOINTMENT RESET.
-- Use this only after the main reset preflight reports appointment-linked clinical
-- records and a qualified operator confirms every previewed record is disposable
-- development/test data. This script deletes clinical records; it is intentionally
-- guarded by a separate confirmation and never runs during deployment.
--
-- After this optional cleanup succeeds, run scripts/reset-appointment-test-data.sql.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';

-- Deliberately disabled. First run with this line commented to review the preview;
-- then uncomment it only if every listed clinical record is confirmed test data.
-- set local alaga.clinical_test_reset_confirmation = 'untiftyqzdvzjdqxwens:DELETE REVIEWED APPOINTMENT-LINKED CLINICAL TEST DATA';

lock table public.appointments in access exclusive mode;
lock table public.health_encounters,
  public.vital_signs,
  public.clinical_referrals,
  public.maternal_prenatal_visits,
  public.maternal_postnatal_visits,
  public.child_growth_measurements,
  public.child_health_visits,
  public.assistance_notifications,
  public.outbound_notification_jobs,
  public.notification_delivery_attempts,
  public.audit_logs in share row exclusive mode;

create temporary table clinical_reset_appointment_targets (
  id uuid primary key,
  appointment_number text not null
) on commit drop;

insert into clinical_reset_appointment_targets(id, appointment_number)
select appointment.id, appointment.appointment_number
from public.appointments as appointment;

create temporary table clinical_reset_encounter_targets (
  id uuid primary key
) on commit drop;

with recursive encounter_roots(id) as (
  select encounter.id
  from public.health_encounters as encounter
  join clinical_reset_appointment_targets as target
    on target.id = encounter.appointment_id
  union
  select visit.encounter_id
  from public.maternal_prenatal_visits as visit
  join clinical_reset_appointment_targets as target
    on target.id = visit.appointment_id
  where visit.encounter_id is not null
  union
  select visit.encounter_id
  from public.maternal_postnatal_visits as visit
  join clinical_reset_appointment_targets as target
    on target.id = visit.appointment_id
  where visit.encounter_id is not null
  union
  select measurement.encounter_id
  from public.child_growth_measurements as measurement
  join clinical_reset_appointment_targets as target
    on target.id = measurement.appointment_id
  where measurement.encounter_id is not null
  union
  select visit.encounter_id
  from public.child_health_visits as visit
  join clinical_reset_appointment_targets as target
    on target.id = visit.appointment_id
  where visit.encounter_id is not null
), encounter_chain(id) as (
  select id from encounter_roots
  union
  select amendment.id
  from public.health_encounters as amendment
  join encounter_chain as parent on parent.id = amendment.amends_encounter_id
)
insert into clinical_reset_encounter_targets(id)
select id from encounter_chain;

create temporary table clinical_reset_prenatal_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_prenatal_targets(id)
select visit.id
from public.maternal_prenatal_visits as visit
where exists (
    select 1 from clinical_reset_appointment_targets as appointment
    where appointment.id = visit.appointment_id
  )
  or exists (
    select 1 from clinical_reset_encounter_targets as encounter
    where encounter.id = visit.encounter_id
  );

create temporary table clinical_reset_postnatal_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_postnatal_targets(id)
select visit.id
from public.maternal_postnatal_visits as visit
where exists (
    select 1 from clinical_reset_appointment_targets as appointment
    where appointment.id = visit.appointment_id
  )
  or exists (
    select 1 from clinical_reset_encounter_targets as encounter
    where encounter.id = visit.encounter_id
  );

create temporary table clinical_reset_growth_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_growth_targets(id)
select measurement.id
from public.child_growth_measurements as measurement
where exists (
    select 1 from clinical_reset_appointment_targets as appointment
    where appointment.id = measurement.appointment_id
  )
  or exists (
    select 1 from clinical_reset_encounter_targets as encounter
    where encounter.id = measurement.encounter_id
  );

create temporary table clinical_reset_child_visit_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_child_visit_targets(id)
select visit.id
from public.child_health_visits as visit
where exists (
    select 1 from clinical_reset_appointment_targets as appointment
    where appointment.id = visit.appointment_id
  )
  or exists (
    select 1 from clinical_reset_encounter_targets as encounter
    where encounter.id = visit.encounter_id
  );

create temporary table clinical_reset_referral_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_referral_targets(id)
select referral.id
from public.clinical_referrals as referral
join clinical_reset_encounter_targets as encounter
  on encounter.id = referral.encounter_id;

create temporary table clinical_reset_source_targets (
  source_type text not null,
  id uuid not null,
  primary key (source_type, id)
) on commit drop;

insert into clinical_reset_source_targets(source_type, id)
select 'health_encounters', id from clinical_reset_encounter_targets
union all
select 'clinical_referrals', id from clinical_reset_referral_targets
union all
select 'maternal_prenatal_visits', id from clinical_reset_prenatal_targets
union all
select 'maternal_postnatal_visits', id from clinical_reset_postnatal_targets
union all
select 'child_growth_measurements', id from clinical_reset_growth_targets
union all
select 'child_health_visits', id from clinical_reset_child_visit_targets;

create temporary table clinical_reset_job_targets (id uuid primary key)
on commit drop;
insert into clinical_reset_job_targets(id)
select job.id
from public.outbound_notification_jobs as job
join clinical_reset_source_targets as source
  on source.source_type = job.source_type and source.id = job.source_id;

-- Review-only preview: identifiers and structured state, never clinical narratives.
select
  encounter.id as encounter_id,
  encounter.encounter_number,
  encounter.appointment_id,
  appointment.appointment_number,
  encounter.status,
  encounter.amends_encounter_id
from public.health_encounters as encounter
join clinical_reset_encounter_targets as target on target.id = encounter.id
left join clinical_reset_appointment_targets as appointment
  on appointment.id = encounter.appointment_id
order by encounter.encounter_number;

select 'health_encounters' as clinical_relation, count(*)::bigint as rows_to_delete
from clinical_reset_encounter_targets
union all
select 'vital_signs', count(*)::bigint
from public.vital_signs as vital
join clinical_reset_encounter_targets as target on target.id = vital.encounter_id
union all
select 'clinical_referrals', count(*)::bigint from clinical_reset_referral_targets
union all
select 'maternal_prenatal_visits', count(*)::bigint from clinical_reset_prenatal_targets
union all
select 'maternal_postnatal_visits', count(*)::bigint from clinical_reset_postnatal_targets
union all
select 'child_growth_measurements', count(*)::bigint from clinical_reset_growth_targets
union all
select 'child_health_visits', count(*)::bigint from clinical_reset_child_visit_targets
union all
select 'clinical_notifications', count(*)::bigint
from public.assistance_notifications as notification
join clinical_reset_source_targets as source
  on source.source_type = notification.source_type and source.id = notification.source_id
union all
select 'clinical_outbound_jobs', count(*)::bigint from clinical_reset_job_targets
order by clinical_relation;

do $clinical_guard$
begin
  if current_setting('alaga.clinical_test_reset_confirmation', true)
      is distinct from
      'untiftyqzdvzjdqxwens:DELETE REVIEWED APPOINTMENT-LINKED CLINICAL TEST DATA' then
    raise exception using
      errcode = 'P0001',
      message = 'clinical test cleanup refused: review every previewed record and uncomment the exact SET LOCAL confirmation only for disposable test data';
  end if;
end;
$clinical_guard$;

delete from public.notification_delivery_attempts as attempt
using clinical_reset_job_targets as job
where attempt.job_id = job.id;

delete from public.outbound_notification_jobs as job
using clinical_reset_job_targets as target
where job.id = target.id;

delete from public.assistance_notifications as notification
using clinical_reset_source_targets as source
where notification.source_type = source.source_type
  and notification.source_id = source.id;

alter table public.audit_logs disable trigger audit_logs_append_only;

delete from public.audit_logs as audit
using clinical_reset_job_targets as job
where audit.entity_type = 'outbound_notification_jobs'
  and audit.entity_id = job.id;

delete from public.audit_logs as audit
using clinical_reset_source_targets as source
where audit.entity_type = source.source_type
  and audit.entity_id = source.id;

alter table public.audit_logs enable trigger audit_logs_append_only;

delete from public.clinical_referrals as referral
using clinical_reset_referral_targets as target
where referral.id = target.id;

delete from public.vital_signs as vital
using clinical_reset_encounter_targets as target
where vital.encounter_id = target.id;

delete from public.maternal_prenatal_visits as visit
using clinical_reset_prenatal_targets as target
where visit.id = target.id;

delete from public.maternal_postnatal_visits as visit
using clinical_reset_postnatal_targets as target
where visit.id = target.id;

delete from public.child_growth_measurements as measurement
using clinical_reset_growth_targets as target
where measurement.id = target.id;

delete from public.child_health_visits as visit
using clinical_reset_child_visit_targets as target
where visit.id = target.id;

-- Remove encounter amendment chains leaf-first to honor the RESTRICT self-FK.
do $delete_encounter_chain$
declare
  selected_encounter_id uuid;
begin
  while exists (select 1 from clinical_reset_encounter_targets) loop
    select encounter.id
    into selected_encounter_id
    from public.health_encounters as encounter
    join clinical_reset_encounter_targets as target on target.id = encounter.id
    where not exists (
      select 1
      from public.health_encounters as amendment
      where amendment.amends_encounter_id = encounter.id
    )
    order by encounter.created_at desc, encounter.id
    limit 1;

    if selected_encounter_id is null then
      raise exception 'clinical cleanup refused: encounter chain has an unreviewed reference or cycle';
    end if;

    delete from public.health_encounters
    where id = selected_encounter_id;

    delete from clinical_reset_encounter_targets
    where id = selected_encounter_id;

    selected_encounter_id := null;
  end loop;
end;
$delete_encounter_chain$;

select 'appointment_linked_health_encounters_remaining' as verification,
  count(*)::bigint as row_count
from public.health_encounters as encounter
join clinical_reset_appointment_targets as appointment
  on appointment.id = encounter.appointment_id
union all
select 'appointment_linked_prenatal_visits_remaining', count(*)::bigint
from public.maternal_prenatal_visits as visit
join clinical_reset_appointment_targets as appointment
  on appointment.id = visit.appointment_id
union all
select 'appointment_linked_postnatal_visits_remaining', count(*)::bigint
from public.maternal_postnatal_visits as visit
join clinical_reset_appointment_targets as appointment
  on appointment.id = visit.appointment_id
union all
select 'appointment_linked_growth_measurements_remaining', count(*)::bigint
from public.child_growth_measurements as measurement
join clinical_reset_appointment_targets as appointment
  on appointment.id = measurement.appointment_id
union all
select 'appointment_linked_child_visits_remaining', count(*)::bigint
from public.child_health_visits as visit
join clinical_reset_appointment_targets as appointment
  on appointment.id = visit.appointment_id
order by verification;

commit;
-- For a rehearsal, replace the COMMIT above with: ROLLBACK;
