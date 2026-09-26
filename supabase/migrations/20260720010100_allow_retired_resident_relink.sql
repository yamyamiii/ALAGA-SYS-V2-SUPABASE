-- Release only the current portal-account link when a Resident account is
-- permanently retired. The retired profile and every historical reference to
-- it remain intact; a later self-registration still requires explicit
-- Administrator identity review before the preserved Resident can be linked.

alter table public.account_retirements
  add column released_resident_id uuid
    references public.residents (id) on delete restrict;

comment on column public.account_retirements.released_resident_id is
  'Preserved Resident whose current portal link was released by this retirement; used only for trusted compensation and lifecycle auditability.';

create or replace function public.admin_prepare_account_retirement(
  p_actor_id uuid,
  p_target_profile_id uuid
)
returns table (
  profile_id uuid,
  previous_account_status public.account_status,
  already_retired boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  retirement_record public.account_retirements%rowtype;
  linked_resident public.residents%rowtype;
  deletion_assessment record;
  has_linked_resident boolean := false;
  retired_timestamp timestamptz := pg_catalog.statement_timestamp();
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_profile_id = p_actor_id then
    raise exception 'administrators cannot retire their own account'
      using errcode = '42501';
  end if;

  select profile.* into target_profile
  from public.profiles as profile
  where profile.id = p_target_profile_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if target_profile.role not in (
    'resident'::public.app_role,
    'barangay_health_worker'::public.app_role,
    'nurse'::public.app_role,
    'midwife'::public.app_role
  ) then
    raise exception 'Administrator accounts cannot be retired'
      using errcode = '42501';
  end if;

  select retirement.* into retirement_record
  from public.account_retirements as retirement
  where retirement.profile_id = target_profile.id
  for update;

  if target_profile.retired_at is not null then
    if not found then
      raise exception 'retired account state is inconsistent'
        using errcode = '23514';
    end if;

    return query
    select
      target_profile.id,
      retirement_record.previous_account_status,
      true;
    return;
  elsif found then
    raise exception 'account retirement state is inconsistent'
      using errcode = '23514';
  end if;

  if target_profile.role = 'resident'::public.app_role then
    select resident.* into linked_resident
    from public.residents as resident
    where resident.linked_profile_id = target_profile.id
    for update;
    has_linked_resident := found;
  end if;

  select assessment.* into deletion_assessment
  from public.admin_account_deletion_assessment(
    p_actor_id,
    array[p_target_profile_id]
  ) as assessment
  where assessment.profile_id = p_target_profile_id;

  if not found then raise exception 'profile not found'; end if;
  if deletion_assessment.eligible then
    raise exception 'dependency-free accounts must use permanent deletion'
      using errcode = '23514';
  end if;
  if deletion_assessment.blocker_code not in (
    'appointment_history',
    'clinical_history',
    'audit_history',
    'inquiry_history',
    'notification_history',
    'household_dependency',
    'retained_media',
    'protected_resident_lifecycle',
    'protected_dependency'
  ) then
    raise exception 'account state is not eligible for retirement'
      using errcode = '23514';
  end if;

  insert into public.account_retirements (
    profile_id,
    previous_account_status,
    blocker_code,
    retired_by,
    retired_at,
    released_resident_id
  ) values (
    target_profile.id,
    target_profile.account_status,
    deletion_assessment.blocker_code,
    p_actor_id,
    retired_timestamp,
    case when has_linked_resident then linked_resident.id else null end
  );

  update public.profiles as profile_to_retire
  set
    account_status = 'inactive'::public.account_status,
    status_changed_at = retired_timestamp,
    retired_at = retired_timestamp,
    retired_by = p_actor_id
  where profile_to_retire.id = target_profile.id;

  if has_linked_resident then
    perform pg_catalog.set_config(
      'app.trusted_resident_linking',
      'on',
      true
    );

    update public.residents as resident_to_release
    set
      linked_profile_id = null,
      updated_by = p_actor_id
    where resident_to_release.id = linked_resident.id
      and resident_to_release.linked_profile_id = target_profile.id;

    if not found then
      raise exception 'Resident portal link changed during account retirement'
        using errcode = '40001';
    end if;
  end if;

  perform public.record_user_management_audit(
    p_actor_id,
    target_profile.id,
    'account.access_retirement_prepared',
    'Administrator permanently removed access while retaining protected history',
    pg_catalog.jsonb_build_object(
      'role', target_profile.role,
      'account_status', target_profile.account_status,
      'resident_portal_linked', has_linked_resident
    ),
    pg_catalog.jsonb_build_object(
      'role', target_profile.role,
      'account_status', 'inactive',
      'retired', true,
      'retention_category', deletion_assessment.blocker_code,
      'resident_portal_link_released', has_linked_resident
    )
  );

  return query
  select target_profile.id, target_profile.account_status, false;
end;
$$;

create or replace function public.admin_restore_account_retirement(
  p_actor_id uuid,
  p_target_profile_id uuid,
  p_previous_account_status public.account_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  retirement_record public.account_retirements%rowtype;
  released_resident public.residents%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  select profile.* into target_profile
  from public.profiles as profile
  where profile.id = p_target_profile_id
  for update;
  if not found then raise exception 'profile not found'; end if;

  select retirement.* into retirement_record
  from public.account_retirements as retirement
  where retirement.profile_id = p_target_profile_id
  for update;
  if not found then
    raise exception 'account retirement recovery state is unavailable';
  end if;
  if target_profile.retired_at is null
    or retirement_record.previous_account_status is distinct from p_previous_account_status then
    raise exception 'account retirement recovery state does not match';
  end if;

  if retirement_record.released_resident_id is not null then
    select resident.* into released_resident
    from public.residents as resident
    where resident.id = retirement_record.released_resident_id
    for update;

    if not found then
      raise exception 'released Resident recovery state is unavailable';
    end if;
    if released_resident.linked_profile_id is not null
      and released_resident.linked_profile_id <> target_profile.id then
      raise exception 'released Resident already has a replacement portal account';
    end if;

    if released_resident.linked_profile_id is null then
      perform pg_catalog.set_config(
        'app.trusted_resident_linking',
        'on',
        true
      );

      update public.residents as resident_to_restore
      set
        linked_profile_id = target_profile.id,
        updated_by = p_actor_id
      where resident_to_restore.id = released_resident.id
        and resident_to_restore.linked_profile_id is null;

      if not found then
        raise exception 'released Resident portal link could not be restored'
          using errcode = '40001';
      end if;
    end if;
  end if;

  perform pg_catalog.set_config(
    'app.trusted_account_retirement_restore',
    'on',
    true
  );

  update public.profiles as profile_to_restore
  set
    account_status = retirement_record.previous_account_status,
    status_changed_at = pg_catalog.statement_timestamp(),
    retired_at = null,
    retired_by = null
  where profile_to_restore.id = target_profile.id;

  perform public.record_user_management_audit(
    p_actor_id,
    target_profile.id,
    'account.access_retirement_restored',
    'Administrator restored account state after Auth retirement failed',
    pg_catalog.jsonb_build_object(
      'account_status', 'inactive',
      'retired', true,
      'resident_portal_link_released',
      retirement_record.released_resident_id is not null
    ),
    pg_catalog.jsonb_build_object(
      'account_status', retirement_record.previous_account_status,
      'retired', false,
      'resident_portal_link_restored',
      retirement_record.released_resident_id is not null
    )
  );

  delete from public.account_retirements as retirement_to_delete
  where retirement_to_delete.profile_id = target_profile.id;
end;
$$;

-- Reconcile only links whose retained profile and retirement record agree on
-- actor and timestamp. Active, invited, non-retired inactive, and already
-- replacement-linked Residents cannot satisfy this predicate.
do $$
begin
  perform pg_catalog.set_config(
    'app.trusted_resident_linking',
    'on',
    true
  );

  update public.account_retirements as retirement
  set released_resident_id = resident.id
  from public.profiles as profile
  join public.residents as resident
    on resident.linked_profile_id = profile.id
  where retirement.profile_id = profile.id
    and retirement.released_resident_id is null
    and profile.role = 'resident'::public.app_role
    and profile.account_status = 'inactive'::public.account_status
    and profile.retired_at is not null
    and profile.retired_by is not null
    and retirement.retired_at = profile.retired_at
    and retirement.retired_by = profile.retired_by;

  update public.residents as resident_to_release
  set
    linked_profile_id = null,
    updated_by = retirement.retired_by
  from public.account_retirements as retirement
  join public.profiles as profile
    on profile.id = retirement.profile_id
  where resident_to_release.id = retirement.released_resident_id
    and resident_to_release.linked_profile_id = profile.id
    and profile.role = 'resident'::public.app_role
    and profile.account_status = 'inactive'::public.account_status
    and profile.retired_at is not null
    and profile.retired_by is not null
    and retirement.retired_at = profile.retired_at
    and retirement.retired_by = profile.retired_by;
end;
$$;

revoke all on function public.admin_prepare_account_retirement(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_account_retirement(
  uuid, uuid, public.account_status
) from public, anon, authenticated, service_role;

grant execute on function public.admin_prepare_account_retirement(uuid, uuid)
  to service_role;
grant execute on function public.admin_restore_account_retirement(
  uuid, uuid, public.account_status
) to service_role;

comment on function public.admin_prepare_account_retirement(uuid, uuid) is
  'Retires protected-history non-Administrator access and releases only a retiring Resident profile current portal link for explicit future relinking.';
comment on function public.admin_restore_account_retirement(
  uuid, uuid, public.account_status
) is
  'Compensates a failed Auth retirement by restoring both profile lifecycle state and the exact released Resident portal link when still safe.';
