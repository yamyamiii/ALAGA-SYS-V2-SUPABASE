-- Foreign-key, lookup, archive, and queue indexes not already supplied by
-- primary-key or unique constraints.

create index profiles_role_status_idx
  on public.profiles (role, account_status);

create index puroks_barangay_id_idx
  on public.puroks (barangay_id);

create index households_barangay_id_idx
  on public.households (barangay_id);
create index households_purok_id_idx
  on public.households (purok_id);
create index households_head_resident_id_idx
  on public.households (head_resident_id)
  where head_resident_id is not null;
create index households_active_location_idx
  on public.households (barangay_id, purok_id, household_number)
  where archived_at is null;

create index residents_household_id_idx
  on public.residents (household_id)
  where household_id is not null;
create index residents_barangay_id_idx
  on public.residents (barangay_id);
create index residents_purok_id_idx
  on public.residents (purok_id);
create index residents_created_by_idx
  on public.residents (created_by)
  where created_by is not null;
create index residents_updated_by_idx
  on public.residents (updated_by)
  where updated_by is not null;
create index residents_active_name_idx
  on public.residents (barangay_id, lower(last_name), lower(first_name))
  where archived_at is null;
create index residents_status_idx
  on public.residents (status, barangay_id);

create index appointments_scheduled_date_idx
  on public.appointments (scheduled_date);
create index appointments_status_idx
  on public.appointments (status);
create index appointments_resident_id_idx
  on public.appointments (resident_id, scheduled_date desc);
create index appointments_assigned_staff_id_idx
  on public.appointments (assigned_staff_id, scheduled_date, start_time)
  where assigned_staff_id is not null and archived_at is null;
create index appointments_rescheduled_from_id_idx
  on public.appointments (rescheduled_from_id)
  where rescheduled_from_id is not null;
create index appointments_created_by_idx
  on public.appointments (created_by)
  where created_by is not null;
create index appointments_updated_by_idx
  on public.appointments (updated_by)
  where updated_by is not null;
create index appointments_active_queue_idx
  on public.appointments (scheduled_date, status, priority, start_time)
  where archived_at is null
    and status in ('confirmed', 'checked_in', 'in_progress');

create index audit_logs_actor_created_idx
  on public.audit_logs (actor_profile_id, created_at desc)
  where actor_profile_id is not null;
create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
