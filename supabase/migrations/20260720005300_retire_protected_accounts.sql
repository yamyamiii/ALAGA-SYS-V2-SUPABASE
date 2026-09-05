-- Retire non-Administrator login accounts whose historical profile identity
-- must remain available to restrictive foreign keys. Full hard deletion stays
-- reserved for accounts that pass the existing dependency assessment.

alter table public.profiles
  add column retired_at timestamptz,
  add column retired_by uuid references public.profiles (id) on delete restrict,
  add constraint profiles_retirement_consistent check (
    (retired_at is null and retired_by is null)
    or (
      retired_at is not null
      and retired_by is not null
      and account_status = 'inactive'::public.account_status
    )
  );

create index profiles_retired_at_idx
  on public.profiles (retired_at desc)
  where retired_at is not null;

create table public.account_retirements (
  profile_id uuid primary key
    references public.profiles (id) on delete restrict,
  previous_account_status public.account_status not null,
  blocker_code text not null,
  retired_by uuid not null
    references public.profiles (id) on delete restrict,
  retired_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint account_retirements_blocker_code_valid check (
    blocker_code in (
      'appointment_history',
      'clinical_history',
      'audit_history',
      'inquiry_history',
      'notification_history',
      'household_dependency',
      'retained_media',
      'protected_resident_lifecycle',
      'protected_dependency'
    )
  )
);

alter table public.account_retirements enable row level security;
revoke all on table public.account_retirements
  from public, anon, authenticated, service_role;

-- Retired lifecycle fields are privileged even for own-profile updates.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  trusted_workflow boolean := coalesce(
    current_setting('app.trusted_user_management', true) = 'on',
    false
  );
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity and creation timestamp are immutable';
  end if;

  if not trusted_workflow and (
    new.invited_by is distinct from old.invited_by
    or new.invitation_sent_at is distinct from old.invitation_sent_at
    or new.status_changed_at is distinct from old.status_changed_at
    or new.retired_at is distinct from old.retired_at
    or new.retired_by is distinct from old.retired_by
  ) then
    raise exception 'profile lifecycle metadata requires a trusted workflow';
  end if;

  if actor_id = old.id and not trusted_workflow then
    if new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.last_login_at is distinct from old.last_login_at then
      raise exception 'users may update only safe personal profile fields';
    end if;
  elsif actor_id is not null
    and not trusted_workflow
    and not public.is_admin()
    and (
      new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.last_login_at is distinct from old.last_login_at
    ) then
    raise exception 'only trusted administrator workflows may change privileged profile fields';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_fields()
  from public, anon, authenticated;

create or replace function public.protect_retired_profile_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  trusted_workflow boolean := coalesce(
    current_setting('app.trusted_user_management', true) = 'on',
    false
  );
  trusted_restore boolean := coalesce(
    current_setting('app.trusted_account_retirement_restore', true) = 'on',
    false
  );
begin
  if old.retired_at is null and new.retired_at is not null then
    if not trusted_workflow
      or new.retired_by is null
      or new.account_status <> 'inactive'::public.account_status then
      raise exception 'account retirement requires the trusted Administrator workflow'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.retired_at is not null and not trusted_restore then
    raise exception 'retired account profile is immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_retired_profile_lifecycle()
  from public, anon, authenticated;

create trigger profiles_protect_retired_lifecycle
  before update on public.profiles
  for each row execute function public.protect_retired_profile_lifecycle();

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
  deletion_assessment record;
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
    retired_at
  ) values (
    target_profile.id,
    target_profile.account_status,
    deletion_assessment.blocker_code,
    p_actor_id,
    retired_timestamp
  );

  update public.profiles as profile_to_retire
  set
    account_status = 'inactive'::public.account_status,
    status_changed_at = retired_timestamp,
    retired_at = retired_timestamp,
    retired_by = p_actor_id
  where profile_to_retire.id = target_profile.id;

  perform public.record_user_management_audit(
    p_actor_id,
    target_profile.id,
    'account.access_retirement_prepared',
    'Administrator permanently removed access while retaining protected history',
    pg_catalog.jsonb_build_object(
      'role', target_profile.role,
      'account_status', target_profile.account_status
    ),
    pg_catalog.jsonb_build_object(
      'role', target_profile.role,
      'account_status', 'inactive',
      'retired', true,
      'retention_category', deletion_assessment.blocker_code
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
      'retired', true
    ),
    pg_catalog.jsonb_build_object(
      'account_status', retirement_record.previous_account_status,
      'retired', false
    )
  );

  delete from public.account_retirements as retirement_to_delete
  where retirement_to_delete.profile_id = target_profile.id;
end;
$$;

-- Retired identities are excluded from normal User Management while their
-- profile rows remain available to historical foreign keys and authorized
-- record presentation.
create or replace function public.admin_list_users(
  p_actor_id uuid,
  p_search text default null,
  p_role public.app_role default null,
  p_status public.account_status default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  role public.app_role,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  phone_number text,
  account_status public.account_status,
  last_login_at timestamptz,
  created_at timestamptz,
  invitation_sent_at timestamptz,
  status_changed_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid pagination parameters';
  end if;

  return query
  select
    profile.id,
    auth_user.email::text,
    profile.role,
    profile.first_name,
    profile.middle_name,
    profile.last_name,
    profile.suffix,
    profile.phone_number,
    profile.account_status,
    auth_user.last_sign_in_at,
    auth_user.created_at,
    profile.invitation_sent_at,
    profile.status_changed_at,
    count(*) over() as total_count
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.retired_at is null
    and (p_role is null or profile.role = p_role)
    and (p_status is null or profile.account_status = p_status)
    and (
      nullif(btrim(p_search), '') is null
      or lower(coalesce(auth_user.email, '')) like '%' || lower(btrim(p_search)) || '%'
      or lower(
        coalesce(profile.first_name, '') || ' '
        || coalesce(profile.middle_name, '') || ' '
        || coalesce(profile.last_name, '')
      ) like '%' || lower(btrim(p_search)) || '%'
    )
  order by auth_user.created_at desc, profile.id
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.admin_get_user(
  p_actor_id uuid,
  p_target_id uuid
)
returns table (
  id uuid,
  email text,
  role public.app_role,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  phone_number text,
  account_status public.account_status,
  last_login_at timestamptz,
  created_at timestamptz,
  invitation_sent_at timestamptz,
  status_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  return query
  select
    profile.id,
    auth_user.email::text,
    profile.role,
    profile.first_name,
    profile.middle_name,
    profile.last_name,
    profile.suffix,
    profile.phone_number,
    profile.account_status,
    auth_user.last_sign_in_at,
    auth_user.created_at,
    profile.invitation_sent_at,
    profile.status_changed_at
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.id = p_target_id
    and profile.retired_at is null;
end;
$$;

revoke all on function public.admin_prepare_account_retirement(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_account_retirement(
  uuid, uuid, public.account_status
) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_users(
  uuid, text, public.app_role, public.account_status, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_user(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_prepare_account_retirement(uuid, uuid)
  to service_role;
grant execute on function public.admin_restore_account_retirement(
  uuid, uuid, public.account_status
) to service_role;
grant execute on function public.admin_list_users(
  uuid, text, public.app_role, public.account_status, integer, integer
) to service_role;
grant execute on function public.admin_get_user(uuid, uuid)
  to service_role;

comment on table public.account_retirements is
  'Service-only account retirement state. Protected history continues to reference the retained profile identity.';
comment on function public.admin_prepare_account_retirement(uuid, uuid) is
  'Retires only supported non-Administrator accounts whose dependency assessment requires historical identity retention.';
