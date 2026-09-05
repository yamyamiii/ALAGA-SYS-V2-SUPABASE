-- Qualify the permanent Resident-deletion workflow's target-table columns.
-- The prepare RPC returns an OUT column named profile_id; unqualified
-- profile_id predicates therefore raise SQLSTATE 42702 when PL/pgSQL resolves
-- the DELETE statements. Migration 47 is already deployed and is intentionally
-- left unchanged.

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
  resident_record public.residents%rowtype;
  registration_record public.resident_registration_requests%rowtype;
  preferences_record public.notification_preferences%rowtype;
  staged_record public.resident_account_deletion_staging%rowtype;
  blocker text;
  has_resident boolean := false;
  has_registration boolean := false;
  has_preferences boolean := false;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_profile_id = p_actor_id then
    raise exception 'administrators cannot permanently delete their own account'
      using errcode = '42501';
  end if;

  select profile.* into target_profile
  from public.profiles as profile
  where profile.id = p_target_profile_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if target_profile.role <> 'resident'::public.app_role then
    raise exception 'permanent deletion is limited to Resident accounts'
      using errcode = '42501';
  end if;

  select staging.* into staged_record
  from public.resident_account_deletion_staging as staging
  where staging.profile_id = p_target_profile_id
  for update;

  if found then
    if staged_record.registration_snapshot is not null
      and (staged_record.registration_snapshot ->> 'version')::integer
        is distinct from p_expected_registration_version then
      raise exception 'resident registration was changed by another administrator';
    end if;

    blocker := public.resident_account_deletion_blocker(p_target_profile_id, null);
    if blocker is not null then
      raise exception 'this Resident has existing records and cannot be permanently deleted'
        using
          errcode = '23503',
          constraint = 'resident_account_delete_protected_dependencies';
    end if;

    return query
    select
      staged_record.profile_id,
      (staged_record.registration_snapshot ->> 'id')::uuid,
      staged_record.previous_account_status;
    return;
  end if;

  select resident.* into resident_record
  from public.residents as resident
  where resident.linked_profile_id = p_target_profile_id
  for update;
  has_resident := found;

  select registration.* into registration_record
  from public.resident_registration_requests as registration
  where registration.profile_id = p_target_profile_id
  for update;
  has_registration := found;

  if has_registration then
    if registration_record.status not in (
      'pending'::public.resident_registration_status,
      'rejected'::public.resident_registration_status,
      'approved'::public.resident_registration_status
    ) then
      raise exception 'Resident registration status is not eligible for deletion';
    end if;
    if registration_record.version is distinct from p_expected_registration_version then
      raise exception 'resident registration was changed by another administrator';
    end if;
    if registration_record.status = 'approved'::public.resident_registration_status
      and (
        not has_resident
        or registration_record.resident_id is distinct from resident_record.id
      ) then
      raise exception 'approved Resident registration link is inconsistent';
    end if;
  elsif p_expected_registration_version is not null then
    raise exception 'Resident registration no longer exists';
  end if;

  select preferences.* into preferences_record
  from public.notification_preferences as preferences
  where preferences.profile_id = p_target_profile_id
  for update;
  has_preferences := found;

  blocker := public.resident_account_deletion_blocker(
    p_target_profile_id,
    case when has_resident then resident_record.id else null end
  );
  if blocker is not null then
    raise exception '%',
      case
        when has_resident then
          'this Resident has existing records and cannot be permanently deleted'
        else
          'this account has existing records and cannot be permanently deleted'
      end
      using
        errcode = '23503',
        constraint = 'resident_account_delete_protected_dependencies';
  end if;

  insert into public.resident_account_deletion_staging (
    profile_id,
    resident_snapshot,
    registration_snapshot,
    notification_preferences_snapshot,
    previous_account_status,
    prepared_by
  ) values (
    target_profile.id,
    case when has_resident then pg_catalog.to_jsonb(resident_record) end,
    case when has_registration then pg_catalog.to_jsonb(registration_record) end,
    case when has_preferences then pg_catalog.to_jsonb(preferences_record) end,
    target_profile.account_status,
    p_actor_id
  );

  update public.profiles as profile_to_suspend
  set account_status = 'suspended'::public.account_status,
      status_changed_at = pg_catalog.statement_timestamp()
  where profile_to_suspend.id = target_profile.id;

  perform public.record_user_management_audit(
    p_actor_id,
    target_profile.id,
    'account.permanent_delete_prepared',
    'Administrator prepared an eligible Resident account for permanent deletion',
    pg_catalog.jsonb_build_object(
      'account_status', target_profile.account_status,
      'has_resident_record', has_resident
    ),
    pg_catalog.jsonb_build_object(
      'account_status', 'suspended',
      'has_resident_record', has_resident
    )
  );

  delete from public.notification_preferences as preferences_to_delete
  where preferences_to_delete.profile_id = target_profile.id;

  delete from public.resident_registration_requests as registration_to_delete
  where registration_to_delete.profile_id = target_profile.id;

  if has_resident then
    delete from public.residents as resident_to_delete
    where resident_to_delete.id = resident_record.id;
  end if;

  return query
  select
    target_profile.id,
    case when has_registration then registration_record.id else null end,
    target_profile.account_status;
end;
$$;

-- The compensation function does not currently have OUT parameters, but its
-- target predicates are qualified as well so later signature changes cannot
-- introduce the same variable/column ambiguity during recovery.
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
  staged_record public.resident_account_deletion_staging%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  perform 1
  from public.profiles as profile
  where profile.id = p_target_profile_id
    and profile.role = 'resident'::public.app_role
    and profile.account_status = 'suspended'::public.account_status
  for update;
  if not found then
    raise exception 'account deletion recovery profile is unavailable';
  end if;

  select staging.* into staged_record
  from public.resident_account_deletion_staging as staging
  where staging.profile_id = p_target_profile_id
  for update;
  if not found then
    raise exception 'account deletion recovery snapshot is unavailable';
  end if;

  if staged_record.previous_account_status is distinct from p_previous_account_status then
    raise exception 'account deletion recovery status does not match';
  end if;
  if staged_record.registration_snapshot is not null
    and (staged_record.registration_snapshot ->> 'version')::integer
      is distinct from p_expected_registration_version then
    raise exception 'resident registration changed during account deletion';
  end if;

  perform pg_catalog.set_config(
    'app.trusted_resident_account_restore',
    'on',
    true
  );

  if staged_record.resident_snapshot is not null then
    insert into public.residents
    select restored.*
    from pg_catalog.jsonb_populate_record(
      null::public.residents,
      staged_record.resident_snapshot
    ) as restored;
  end if;

  if staged_record.registration_snapshot is not null then
    insert into public.resident_registration_requests
    select restored.*
    from pg_catalog.jsonb_populate_record(
      null::public.resident_registration_requests,
      staged_record.registration_snapshot
    ) as restored;
  end if;

  if staged_record.notification_preferences_snapshot is not null then
    insert into public.notification_preferences
    select restored.*
    from pg_catalog.jsonb_populate_record(
      null::public.notification_preferences,
      staged_record.notification_preferences_snapshot
    ) as restored;
  end if;

  update public.profiles as profile_to_restore
  set account_status = staged_record.previous_account_status,
      status_changed_at = pg_catalog.statement_timestamp()
  where profile_to_restore.id = p_target_profile_id;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_profile_id,
    'account.permanent_delete_restored',
    'Administrator restored an account after Auth deletion failed',
    pg_catalog.jsonb_build_object('account_status', 'suspended'),
    pg_catalog.jsonb_build_object(
      'account_status', staged_record.previous_account_status,
      'resident_record_restored', staged_record.resident_snapshot is not null
    )
  );

  delete from public.resident_account_deletion_staging as staging_to_delete
  where staging_to_delete.profile_id = p_target_profile_id;
end;
$$;

revoke all on function public.admin_prepare_resident_account_deletion(
  uuid, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_resident_account_deletion(
  uuid, uuid, public.account_status, integer
) from public, anon, authenticated, service_role;

grant execute on function public.admin_prepare_resident_account_deletion(
  uuid, uuid, integer
) to service_role;
grant execute on function public.admin_restore_resident_account_deletion(
  uuid, uuid, public.account_status, integer
) to service_role;
