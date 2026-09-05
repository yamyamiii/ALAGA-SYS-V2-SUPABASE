-- Permanent Auth deletion is limited to unlinked pending/rejected Resident
-- self-registration accounts. The Edge Function performs the Auth deletion;
-- these service-role-only helpers lock and validate the database boundary and
-- temporarily suspend the target so another trusted workflow cannot approve it
-- between dependency validation and Auth deletion.

create or replace function public.admin_prepare_resident_account_deletion(
  p_actor_id uuid,
  p_target_profile_id uuid,
  p_expected_registration_version integer
)
returns table (
  profile_id uuid,
  registration_id uuid,
  previous_account_status public.account_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  registration_record public.resident_registration_requests%rowtype;
  dependency record;
  dependency_exists boolean;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_profile_id = p_actor_id then
    raise exception 'administrators cannot permanently delete their own account'
      using errcode = '42501';
  end if;

  select * into target_profile
  from public.profiles as profile
  where profile.id = p_target_profile_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if target_profile.role <> 'resident'::public.app_role then
    raise exception 'permanent deletion is limited to Resident self-registration accounts'
      using errcode = '42501';
  end if;
  if target_profile.account_status not in (
    'invited'::public.account_status,
    'inactive'::public.account_status,
    'suspended'::public.account_status
  ) then
    raise exception 'active Resident accounts must be deactivated instead'
      using errcode = '23503';
  end if;

  select * into registration_record
  from public.resident_registration_requests as registration
  where registration.profile_id = p_target_profile_id
  for update;

  if not found then
    raise exception 'permanent deletion requires a Resident self-registration';
  end if;
  if registration_record.status not in (
    'pending'::public.resident_registration_status,
    'rejected'::public.resident_registration_status
  ) then
    raise exception 'permanent deletion requires a pending or rejected Resident registration';
  end if;
  if registration_record.version <> p_expected_registration_version then
    raise exception 'resident registration was changed by another administrator';
  end if;

  if exists (
    select 1
    from public.residents as resident
    where resident.linked_profile_id = p_target_profile_id
  ) then
    raise exception 'this account has a linked Resident record and cannot be permanently deleted'
      using
        errcode = '23503',
        constraint = 'resident_account_delete_protected_dependencies';
  end if;

  -- Fail closed on every inbound profile foreign key except the registration
  -- row and explicitly disposable per-profile operational state that already
  -- uses ON DELETE CASCADE. This automatically covers appointments, clinical
  -- records, signed documents, audit authorship, notification jobs, inquiries,
  -- and future protected tables without deleting any of them.
  for dependency in
    select
      source_namespace.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table
      on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_namespace
      on source_namespace.oid = source_table.relnamespace
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = foreign_key.conkey[1]
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.profiles'::regclass
      and pg_catalog.array_length(foreign_key.conkey, 1) = 1
      and not (
        source_namespace.nspname = 'public'
        and (
          (source_table.relname = 'resident_registration_requests'
            and source_column.attname = 'profile_id')
          or (source_table.relname = 'admin_action_rate_limits'
            and source_column.attname = 'actor_profile_id')
          or (source_table.relname = 'ai_request_rate_limits'
            and source_column.attname = 'profile_id')
          or (source_table.relname = 'assistance_notifications'
            and source_column.attname = 'recipient_profile_id')
        )
      )
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I where %I = $1)',
      dependency.schema_name,
      dependency.table_name,
      dependency.column_name
    )
    into dependency_exists
    using p_target_profile_id;

    if dependency_exists then
      raise exception 'this account has protected records and cannot be permanently deleted'
        using
          errcode = '23503',
          constraint = 'resident_account_delete_protected_dependencies';
    end if;
  end loop;

  -- A future composite profile reference is unknown to this reviewed cleanup
  -- contract and therefore makes deletion ineligible until explicitly audited.
  if exists (
    select 1
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.profiles'::regclass
      and pg_catalog.array_length(foreign_key.conkey, 1) <> 1
  ) then
    raise exception 'this account has an unsupported protected dependency'
      using
        errcode = '23503',
        constraint = 'resident_account_delete_protected_dependencies';
  end if;

  if target_profile.account_status <> 'suspended'::public.account_status then
    update public.profiles
    set account_status = 'suspended'::public.account_status,
        status_changed_at = pg_catalog.statement_timestamp()
    where id = target_profile.id;
  end if;

  perform public.record_user_management_audit(
    p_actor_id,
    target_profile.id,
    'account.permanent_delete_prepared',
    'Administrator prepared an eligible self-registration account for permanent deletion',
    pg_catalog.jsonb_build_object(
      'registration_status', registration_record.status,
      'account_status', target_profile.account_status
    ),
    pg_catalog.jsonb_build_object(
      'registration_status', registration_record.status,
      'account_status', 'suspended'
    )
  );

  return query
  select target_profile.id, registration_record.id, target_profile.account_status;
end;
$$;

create or replace function public.admin_restore_resident_account_deletion(
  p_actor_id uuid,
  p_target_profile_id uuid,
  p_previous_account_status public.account_status,
  p_expected_registration_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_record public.resident_registration_requests%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_previous_account_status not in (
    'invited'::public.account_status,
    'inactive'::public.account_status,
    'suspended'::public.account_status
  ) then
    raise exception 'invalid account deletion recovery status';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_target_profile_id
    and profile.role = 'resident'::public.app_role
    and profile.account_status = 'suspended'::public.account_status
  for update;
  if not found then raise exception 'account deletion recovery profile is unavailable'; end if;

  select * into registration_record
  from public.resident_registration_requests as registration
  where registration.profile_id = p_target_profile_id
    and registration.status in (
      'pending'::public.resident_registration_status,
      'rejected'::public.resident_registration_status
    )
  for update;
  if not found then raise exception 'account deletion recovery registration is unavailable'; end if;
  if registration_record.version <> p_expected_registration_version then
    raise exception 'resident registration was changed during account deletion';
  end if;

  update public.profiles
  set account_status = p_previous_account_status,
      status_changed_at = pg_catalog.statement_timestamp()
  where id = p_target_profile_id;
end;
$$;

revoke all on function public.admin_prepare_resident_account_deletion(
  uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.admin_restore_resident_account_deletion(
  uuid, uuid, public.account_status, integer
) from public, anon, authenticated;

grant execute on function public.admin_prepare_resident_account_deletion(
  uuid, uuid, integer
) to service_role;
grant execute on function public.admin_restore_resident_account_deletion(
  uuid, uuid, public.account_status, integer
) to service_role;
