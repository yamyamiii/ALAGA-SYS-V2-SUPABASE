-- RLS helpers run as their owner to avoid recursively invoking profiles or
-- residents policies. They return no secrets and recognize only active accounts.

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
    and p.account_status = 'active'::public.account_status
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'admin'::public.app_role, false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_profile_role() in (
      'admin'::public.app_role,
      'barangay_health_worker'::public.app_role,
      'nurse'::public.app_role,
      'midwife'::public.app_role
    ),
    false
  )
$$;

create or replace function public.current_resident_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.residents as r
  where r.linked_profile_id = auth.uid()
  limit 1
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.household_id
  from public.residents as r
  where r.linked_profile_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.current_resident_id() from public;
revoke all on function public.current_household_id() from public;

-- All mutable foundation tables share one deterministic updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger barangays_set_updated_at
  before update on public.barangays
  for each row execute function public.set_updated_at();
create trigger puroks_set_updated_at
  before update on public.puroks
  for each row execute function public.set_updated_at();
create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();
create trigger residents_set_updated_at
  before update on public.residents
  for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- Primary identifiers and creation timestamps must not be rewritten through a
-- client update. Profiles has a dedicated trigger with the same guarantees.
create or replace function public.protect_row_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'row identity and creation timestamp are immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_row_identity() from public;
revoke all on function public.protect_row_identity() from anon, authenticated;

create trigger barangays_protect_identity
  before update on public.barangays
  for each row execute function public.protect_row_identity();
create trigger puroks_protect_identity
  before update on public.puroks
  for each row execute function public.protect_row_identity();
create trigger households_protect_identity
  before update on public.households
  for each row execute function public.protect_row_identity();
create trigger residents_protect_identity
  before update on public.residents
  for each row execute function public.protect_row_identity();
create trigger appointments_protect_identity
  before update on public.appointments
  for each row execute function public.protect_row_identity();

-- Authenticated writes cannot spoof creator/updater attribution. Trusted backend
-- operations with no end-user JWT may supply attribution explicitly.
create or replace function public.set_actor_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    if tg_op = 'UPDATE' then
      new.created_by := old.created_by;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := actor_id;
  else
    new.created_by := old.created_by;
  end if;

  new.updated_by := actor_id;
  return new;
end;
$$;

revoke all on function public.set_actor_attribution() from public;
revoke all on function public.set_actor_attribution() from anon, authenticated;

create trigger residents_set_actor_attribution
  before insert or update on public.residents
  for each row execute function public.set_actor_attribution();
create trigger appointments_set_actor_attribution
  before insert or update on public.appointments
  for each row execute function public.set_actor_attribution();

-- Linking a login to a resident changes which private record that account can
-- read. BHW demographic edits cannot create or change this security boundary;
-- only an admin or trusted backend workflow may do so.
create or replace function public.protect_resident_profile_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_profile_role() = 'barangay_health_worker'::public.app_role then
    if (tg_op = 'INSERT' and new.linked_profile_id is not null)
      or (
        tg_op = 'UPDATE'
        and new.linked_profile_id is distinct from old.linked_profile_id
      ) then
      raise exception 'resident profile links require an administrator or trusted workflow';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_resident_profile_link() from public;
revoke all on function public.protect_resident_profile_link() from anon, authenticated;

create trigger residents_protect_profile_link
  before insert or update on public.residents
  for each row execute function public.protect_resident_profile_link();

-- Assigned staff must be an active staff profile. Once created, changing an
-- appointment's resident owner requires a trusted backend workflow rather than
-- a direct authenticated-table update.
create or replace function public.validate_appointment_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and new.resident_id is distinct from old.resident_id then
    raise exception 'appointment resident ownership requires a trusted workflow';
  end if;

  if new.assigned_staff_id is not null
    and not exists (
      select 1
      from public.profiles as p
      where p.id = new.assigned_staff_id
        and p.account_status = 'active'::public.account_status
        and p.role in (
          'admin'::public.app_role,
          'barangay_health_worker'::public.app_role,
          'nurse'::public.app_role,
          'midwife'::public.app_role
        )
    ) then
    raise exception 'assigned_staff_id must reference an active staff profile';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_appointment_relationships() from public;
revoke all on function public.validate_appointment_relationships() from anon, authenticated;

create trigger appointments_validate_relationships
  before insert or update on public.appointments
  for each row execute function public.validate_appointment_relationships();

-- RLS selects rows; this trigger also protects privileged profile fields. A
-- user, including an admin, cannot change their own role or account status.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity and creation timestamp are immutable';
  end if;

  if actor_id = old.id then
    if new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.last_login_at is distinct from old.last_login_at then
      raise exception 'users may update only safe personal profile fields';
    end if;
  elsif actor_id is not null
    and not public.is_admin()
    and (
      new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.last_login_at is distinct from old.last_login_at
    ) then
    raise exception 'only administrators may change privileged profile fields';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_fields() from public;
revoke all on function public.protect_profile_privileged_fields() from anon, authenticated;

create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- Audit snapshots deliberately whitelist operational identifiers and state.
-- Names, contact details, addresses, coordinates, reasons, notes, health-related
-- flags, Auth metadata, tokens, and secrets are never copied automatically.
create or replace function public.audit_safe_snapshot(
  table_name text,
  row_data jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if row_data is null then
    return null;
  end if;

  case table_name
    when 'profiles' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'role', row_data -> 'role',
        'account_status', row_data -> 'account_status',
        'last_login_at', row_data -> 'last_login_at'
      );
    when 'barangays' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'name', row_data -> 'name',
        'city_or_municipality', row_data -> 'city_or_municipality',
        'province', row_data -> 'province',
        'is_active', row_data -> 'is_active'
      );
    when 'puroks' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'barangay_id', row_data -> 'barangay_id',
        'name', row_data -> 'name',
        'code', row_data -> 'code',
        'is_active', row_data -> 'is_active'
      );
    when 'households' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'household_number', row_data -> 'household_number',
        'barangay_id', row_data -> 'barangay_id',
        'purok_id', row_data -> 'purok_id',
        'head_resident_id', row_data -> 'head_resident_id',
        'status', row_data -> 'status',
        'archived_at', row_data -> 'archived_at'
      );
    when 'residents' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'resident_number', row_data -> 'resident_number',
        'linked_profile_id', row_data -> 'linked_profile_id',
        'household_id', row_data -> 'household_id',
        'barangay_id', row_data -> 'barangay_id',
        'purok_id', row_data -> 'purok_id',
        'status', row_data -> 'status',
        'archived_at', row_data -> 'archived_at'
      );
    when 'appointments' then
      return jsonb_build_object(
        'id', row_data -> 'id',
        'appointment_number', row_data -> 'appointment_number',
        'resident_id', row_data -> 'resident_id',
        'assigned_staff_id', row_data -> 'assigned_staff_id',
        'appointment_type', row_data -> 'appointment_type',
        'service_type', row_data -> 'service_type',
        'scheduled_date', row_data -> 'scheduled_date',
        'start_time', row_data -> 'start_time',
        'end_time', row_data -> 'end_time',
        'priority', row_data -> 'priority',
        'status', row_data -> 'status',
        'rescheduled_from_id', row_data -> 'rescheduled_from_id',
        'checked_in_at', row_data -> 'checked_in_at',
        'started_at', row_data -> 'started_at',
        'completed_at', row_data -> 'completed_at',
        'cancelled_at', row_data -> 'cancelled_at',
        'archived_at', row_data -> 'archived_at'
      );
    else
      return jsonb_build_object('id', row_data -> 'id');
  end case;
end;
$$;

revoke all on function public.audit_safe_snapshot(text, jsonb) from public;
revoke all on function public.audit_safe_snapshot(text, jsonb) from anon, authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  entity_uuid uuid := coalesce(
    nullif(new_row ->> 'id', '')::uuid,
    nullif(old_row ->> 'id', '')::uuid
  );
  actor_uuid uuid;
begin
  select p.id
  into actor_uuid
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    summary,
    old_values,
    new_values,
    request_metadata
  )
  values (
    actor_uuid,
    lower(tg_op),
    tg_table_name,
    entity_uuid,
    format('%s %s record', initcap(lower(tg_op)), tg_table_name),
    public.audit_safe_snapshot(tg_table_name, old_row),
    public.audit_safe_snapshot(tg_table_name, new_row),
    null
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_row_change() from public;
revoke all on function public.audit_row_change() from anon, authenticated;

create trigger profiles_audit_changes
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();
create trigger barangays_audit_changes
  after insert or update or delete on public.barangays
  for each row execute function public.audit_row_change();
create trigger puroks_audit_changes
  after insert or update or delete on public.puroks
  for each row execute function public.audit_row_change();
create trigger households_audit_changes
  after insert or update or delete on public.households
  for each row execute function public.audit_row_change();
create trigger residents_audit_changes
  after insert or update or delete on public.residents
  for each row execute function public.audit_row_change();
create trigger appointments_audit_changes
  after insert or update or delete on public.appointments
  for each row execute function public.audit_row_change();
