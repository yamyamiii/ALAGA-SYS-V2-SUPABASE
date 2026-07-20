-- Phase 2B: trusted administrator user management and lifecycle safeguards.
-- Browser clients retain safe own-profile updates only. Privileged profile and
-- Auth operations are routed through a verified Edge Function and these
-- service-role-only helpers.

-- Forward-correct the Phase 1 audit helper's volatility metadata. Its
-- jsonb-building expressions are STABLE rather than IMMUTABLE, as reported by
-- the hosted database linter. The completed migration remains untouched.
alter function public.audit_safe_snapshot(text, jsonb) stable;

alter table public.profiles
  add column invited_by uuid references public.profiles (id) on delete restrict,
  add column invitation_sent_at timestamptz,
  add column status_changed_at timestamptz not null default now();

create index profiles_invited_by_idx
  on public.profiles (invited_by)
  where invited_by is not null;

create index profiles_status_changed_at_idx
  on public.profiles (account_status, status_changed_at desc);

-- This operational table supports an atomic per-administrator request window.
-- It is not exposed through RLS or direct API-role grants.
create table public.admin_action_rate_limits (
  actor_profile_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null,
  constraint admin_action_rate_limits_request_count_positive check (request_count > 0)
);

alter table public.admin_action_rate_limits enable row level security;
revoke all on table public.admin_action_rate_limits from public, anon, authenticated;

-- Direct authenticated administrators no longer update other profiles through
-- PostgREST. Trusted service-role RPCs below own privileged mutations.
drop policy if exists profiles_update_admin on public.profiles;

-- Extend the Phase 1 protection trigger to cover lifecycle metadata. The
-- trusted flag can be set only inside RPCs that are not executable by browser
-- roles.
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

revoke all on function public.protect_profile_privileged_fields() from public;
revoke all on function public.protect_profile_privileged_fields() from anon, authenticated;

-- Serialize reductions in active administrators and reject any change that
-- would leave the system without one. This covers role/status updates and
-- exceptional profile deletion, independently of the Edge Function UI.
create or replace function public.protect_last_active_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removes_active_admin boolean;
begin
  removes_active_admin := old.role = 'admin'::public.app_role
    and old.account_status = 'active'::public.account_status
    and (
      tg_op = 'DELETE'
      or new.role <> 'admin'::public.app_role
      or new.account_status <> 'active'::public.account_status
    );

  if not removes_active_admin then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('alaga:last-active-administrator', 0)
  );

  if not exists (
    select 1
    from public.profiles as p
    where p.id <> old.id
      and p.role = 'admin'::public.app_role
      and p.account_status = 'active'::public.account_status
  ) then
    raise exception 'the final active administrator cannot be demoted, disabled, or deleted'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_last_active_administrator() from public;
revoke all on function public.protect_last_active_administrator() from anon, authenticated;

create trigger profiles_protect_last_active_admin_update
  before update of role, account_status on public.profiles
  for each row execute function public.protect_last_active_administrator();

create trigger profiles_protect_last_active_admin_delete
  before delete on public.profiles
  for each row execute function public.protect_last_active_administrator();

create or replace function public.assert_active_administrator(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1
    from public.profiles as p
    where p.id = p_actor_id
      and p.role = 'admin'::public.app_role
      and p.account_status = 'active'::public.account_status
  ) then
    raise exception 'an active administrator is required'
      using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config('app.trusted_user_management', 'on', true);
end;
$$;

revoke all on function public.assert_active_administrator(uuid) from public;
revoke all on function public.assert_active_administrator(uuid) from anon, authenticated;

create or replace function public.record_user_management_audit(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_summary text,
  p_old_values jsonb default null,
  p_new_values jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

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
    p_actor_id,
    p_action,
    'profiles',
    p_target_id,
    p_summary,
    p_old_values,
    p_new_values,
    null
  );
end;
$$;

revoke all on function public.record_user_management_audit(uuid, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.record_user_management_audit(uuid, uuid, text, text, jsonb, jsonb) from anon, authenticated;

create or replace function public.consume_admin_action_rate_limit(
  p_actor_id uuid,
  p_max_requests integer default 60,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_max_requests not between 1 and 300
    or p_window_seconds not between 10 and 3600 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.admin_action_rate_limits (
    actor_profile_id,
    window_started_at,
    request_count
  )
  values (p_actor_id, clock_timestamp(), 1)
  on conflict (actor_profile_id) do update
  set
    window_started_at = case
      when public.admin_action_rate_limits.window_started_at
        <= clock_timestamp() - make_interval(secs => p_window_seconds)
      then clock_timestamp()
      else public.admin_action_rate_limits.window_started_at
    end,
    request_count = case
      when public.admin_action_rate_limits.window_started_at
        <= clock_timestamp() - make_interval(secs => p_window_seconds)
      then 1
      else public.admin_action_rate_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_admin_action_rate_limit(uuid, integer, integer) from public;
revoke all on function public.consume_admin_action_rate_limit(uuid, integer, integer) from anon, authenticated;

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
    p.id,
    u.email::text,
    p.role,
    p.first_name,
    p.middle_name,
    p.last_name,
    p.suffix,
    p.phone_number,
    p.account_status,
    u.last_sign_in_at,
    u.created_at,
    p.invitation_sent_at,
    p.status_changed_at,
    count(*) over() as total_count
  from public.profiles as p
  join auth.users as u on u.id = p.id
  where (p_role is null or p.role = p_role)
    and (p_status is null or p.account_status = p_status)
    and (
      nullif(btrim(p_search), '') is null
      or lower(coalesce(u.email, '')) like '%' || lower(btrim(p_search)) || '%'
      or lower(
        coalesce(p.first_name, '') || ' '
        || coalesce(p.middle_name, '') || ' '
        || coalesce(p.last_name, '')
      ) like '%' || lower(btrim(p_search)) || '%'
    )
  order by u.created_at desc, p.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.admin_list_users(uuid, text, public.app_role, public.account_status, integer, integer) from public;
revoke all on function public.admin_list_users(uuid, text, public.app_role, public.account_status, integer, integer) from anon, authenticated;

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
    p.id,
    u.email::text,
    p.role,
    p.first_name,
    p.middle_name,
    p.last_name,
    p.suffix,
    p.phone_number,
    p.account_status,
    u.last_sign_in_at,
    u.created_at,
    p.invitation_sent_at,
    p.status_changed_at
  from public.profiles as p
  join auth.users as u on u.id = p.id
  where p.id = p_target_id;
end;
$$;

revoke all on function public.admin_get_user(uuid, uuid) from public;
revoke all on function public.admin_get_user(uuid, uuid) from anon, authenticated;

create or replace function public.admin_finalize_user_provisioning(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.app_role,
  p_account_status public.account_status,
  p_first_name text,
  p_middle_name text default null,
  p_last_name text default null,
  p_suffix text default null,
  p_phone_number text default null,
  p_was_invited boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_profile public.profiles%rowtype;
  current_profile public.profiles%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_id = p_actor_id then
    raise exception 'administrators cannot provision their own account';
  end if;

  if nullif(btrim(p_first_name), '') is null
    or nullif(btrim(p_last_name), '') is null then
    raise exception 'first and last name are required';
  end if;

  if p_was_invited and p_account_status <> 'invited'::public.account_status then
    raise exception 'invited profiles must begin in invited status';
  end if;

  select * into previous_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'the Auth user profile was not created';
  end if;

  update public.profiles
  set
    role = p_role,
    account_status = p_account_status,
    first_name = nullif(btrim(p_first_name), ''),
    middle_name = nullif(btrim(p_middle_name), ''),
    last_name = nullif(btrim(p_last_name), ''),
    suffix = nullif(btrim(p_suffix), ''),
    phone_number = nullif(btrim(p_phone_number), ''),
    invited_by = case when p_was_invited then p_actor_id else null end,
    invitation_sent_at = case when p_was_invited then statement_timestamp() else null end,
    status_changed_at = statement_timestamp()
  where id = p_target_id
  returning * into current_profile;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_id,
    case when p_was_invited then 'user.invited' else 'user.created' end,
    case
      when p_was_invited then 'Administrator invited a user account'
      else 'Administrator created a user account'
    end,
    public.audit_safe_snapshot('profiles', to_jsonb(previous_profile)),
    public.audit_safe_snapshot('profiles', to_jsonb(current_profile))
  );
end;
$$;

revoke all on function public.admin_finalize_user_provisioning(uuid, uuid, public.app_role, public.account_status, text, text, text, text, text, boolean) from public;
revoke all on function public.admin_finalize_user_provisioning(uuid, uuid, public.app_role, public.account_status, text, text, text, text, text, boolean) from anon, authenticated;

create or replace function public.admin_update_user_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_profile public.profiles%rowtype;
  current_profile public.profiles%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_id = p_actor_id then
    raise exception 'administrators cannot change their own role';
  end if;

  select * into previous_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if previous_profile.role = p_new_role then raise exception 'role is unchanged'; end if;

  update public.profiles
  set role = p_new_role
  where id = p_target_id
  returning * into current_profile;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_id,
    'user.role_changed',
    'Administrator changed an account role',
    jsonb_build_object(
      'id', previous_profile.id,
      'role', previous_profile.role,
      'account_status', previous_profile.account_status
    ),
    jsonb_build_object(
      'id', current_profile.id,
      'role', current_profile.role,
      'account_status', current_profile.account_status
    )
  );
end;
$$;

revoke all on function public.admin_update_user_role(uuid, uuid, public.app_role) from public;
revoke all on function public.admin_update_user_role(uuid, uuid, public.app_role) from anon, authenticated;

create or replace function public.admin_update_user_status(
  p_actor_id uuid,
  p_target_id uuid,
  p_new_status public.account_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_profile public.profiles%rowtype;
  current_profile public.profiles%rowtype;
  allowed_transition boolean;
  audit_action text;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_target_id = p_actor_id then
    raise exception 'administrators cannot change their own account status';
  end if;

  select * into previous_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if previous_profile.account_status = p_new_status then
    raise exception 'account status is unchanged';
  end if;

  allowed_transition := case previous_profile.account_status
    when 'invited'::public.account_status then p_new_status in ('active', 'inactive')
    when 'active'::public.account_status then p_new_status in ('inactive', 'suspended')
    when 'inactive'::public.account_status then p_new_status = 'active'::public.account_status
    when 'suspended'::public.account_status then p_new_status in ('active', 'inactive')
    else false
  end;

  if not allowed_transition then
    raise exception 'the requested account status transition is not allowed';
  end if;

  update public.profiles
  set
    account_status = p_new_status,
    status_changed_at = statement_timestamp()
  where id = p_target_id
  returning * into current_profile;

  audit_action := case
    when p_new_status = 'suspended'::public.account_status then 'account.suspended'
    when p_new_status = 'inactive'::public.account_status then 'account.deactivated'
    when previous_profile.account_status = 'invited'::public.account_status then 'account.activated'
    else 'account.reactivated'
  end;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_id,
    audit_action,
    'Administrator changed an account status',
    jsonb_build_object(
      'id', previous_profile.id,
      'role', previous_profile.role,
      'account_status', previous_profile.account_status
    ),
    jsonb_build_object(
      'id', current_profile.id,
      'role', current_profile.role,
      'account_status', current_profile.account_status
    )
  );
end;
$$;

revoke all on function public.admin_update_user_status(uuid, uuid, public.account_status) from public;
revoke all on function public.admin_update_user_status(uuid, uuid, public.account_status) from anon, authenticated;

create or replace function public.admin_update_user_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_first_name text,
  p_middle_name text default null,
  p_last_name text default null,
  p_suffix text default null,
  p_phone_number text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  if nullif(btrim(p_first_name), '') is null
    or nullif(btrim(p_last_name), '') is null then
    raise exception 'first and last name are required';
  end if;

  update public.profiles
  set
    first_name = nullif(btrim(p_first_name), ''),
    middle_name = nullif(btrim(p_middle_name), ''),
    last_name = nullif(btrim(p_last_name), ''),
    suffix = nullif(btrim(p_suffix), ''),
    phone_number = nullif(btrim(p_phone_number), '')
  where id = p_target_id;

  if not found then raise exception 'profile not found'; end if;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_id,
    'profile.admin_updated',
    'Administrator updated safe profile fields',
    null,
    jsonb_build_object('id', p_target_id)
  );
end;
$$;

revoke all on function public.admin_update_user_profile(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.admin_update_user_profile(uuid, uuid, text, text, text, text, text) from anon, authenticated;

create or replace function public.admin_record_invitation_resent(
  p_actor_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  update public.profiles
  set invitation_sent_at = statement_timestamp()
  where id = p_target_id
    and account_status = 'invited'::public.account_status;

  if not found then
    raise exception 'only invited accounts can receive another invitation';
  end if;

  perform public.record_user_management_audit(
    p_actor_id,
    p_target_id,
    'user.invitation_resent',
    'Administrator resent an account invitation',
    null,
    jsonb_build_object('id', p_target_id)
  );
end;
$$;

revoke all on function public.admin_record_invitation_resent(uuid, uuid) from public;
revoke all on function public.admin_record_invitation_resent(uuid, uuid) from anon, authenticated;

create or replace function public.record_admin_action_failure(
  p_actor_id uuid,
  p_action text,
  p_target_id uuid default null,
  p_error_code text default 'rejected'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id
  ) then
    return;
  end if;

  if p_action not in ('user_management.denied', 'user_management.failed')
    or p_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid failed-action audit data';
  end if;

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
    p_actor_id,
    p_action,
    'profiles',
    p_target_id,
    'A privileged user-management action was rejected',
    null,
    null,
    jsonb_build_object('error_code', p_error_code)
  );
end;
$$;

revoke all on function public.record_admin_action_failure(uuid, text, uuid, text) from public;
revoke all on function public.record_admin_action_failure(uuid, text, uuid, text) from anon, authenticated;

grant execute on function public.consume_admin_action_rate_limit(uuid, integer, integer) to service_role;
grant execute on function public.admin_list_users(uuid, text, public.app_role, public.account_status, integer, integer) to service_role;
grant execute on function public.admin_get_user(uuid, uuid) to service_role;
grant execute on function public.admin_finalize_user_provisioning(uuid, uuid, public.app_role, public.account_status, text, text, text, text, text, boolean) to service_role;
grant execute on function public.admin_update_user_role(uuid, uuid, public.app_role) to service_role;
grant execute on function public.admin_update_user_status(uuid, uuid, public.account_status) to service_role;
grant execute on function public.admin_update_user_profile(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.admin_record_invitation_resent(uuid, uuid) to service_role;
grant execute on function public.record_admin_action_failure(uuid, text, uuid, text) to service_role;
