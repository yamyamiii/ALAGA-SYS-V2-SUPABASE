-- MANUAL, ONE-TIME ADMINISTRATOR BOOTSTRAP
--
-- 1. Create the intended Auth user in the hosted Supabase Dashboard.
-- 2. Replace the all-zero UUID below with that exact auth.users UUID.
-- 3. Review the UUID and email in the first SELECT before executing this file.
-- 4. Run the complete transaction only after Phase 1 and Phase 2B migrations.
--
-- This script fails closed if an active administrator already exists. Re-running
-- it for the same already-promoted UUID is an idempotent no-op.

begin;

do $$
declare
  target_user_id constant uuid := 'bacf224b-d337-485c-83a9-dc91ee12285a';
  target_email text;
  target_profile public.profiles%rowtype;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the reviewed Auth user UUID';
  end if;

  select u.email::text
  into target_email
  from auth.users as u
  where u.id = target_user_id;

  if target_email is null then
    raise exception 'the selected Auth user UUID does not exist or has no email';
  end if;

  select *
  into target_profile
  from public.profiles as p
  where p.id = target_user_id
  for update;

  if not found then
    raise exception 'the selected Auth user has no matching profile';
  end if;

  if target_profile.role = 'admin'::public.app_role
    and target_profile.account_status = 'active'::public.account_status then
    raise notice 'the selected user is already an active administrator';
    return;
  end if;

  if exists (
    select 1
    from public.profiles as p
    where p.role = 'admin'::public.app_role
      and p.account_status = 'active'::public.account_status
  ) then
    raise exception 'bootstrap retired: an active administrator already exists';
  end if;

  -- The Phase 2B profile trigger accepts lifecycle metadata only from a
  -- transaction-local trusted workflow. This flag disappears at commit and
  -- does not install or expose any reusable bootstrap capability.
  perform set_config('app.trusted_user_management', 'on', true);

  update public.profiles
  set
    role = 'admin'::public.app_role,
    account_status = 'active'::public.account_status,
    status_changed_at = statement_timestamp()
  where id = target_user_id;

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
    target_user_id,
    'admin.bootstrap',
    'profiles',
    target_user_id,
    'Project owner bootstrapped the initial administrator',
    jsonb_build_object(
      'id', target_profile.id,
      'role', target_profile.role,
      'account_status', target_profile.account_status
    ),
    jsonb_build_object(
      'id', target_user_id,
      'role', 'admin',
      'account_status', 'active'
    ),
    jsonb_build_object('method', 'reviewed_manual_sql')
  );

  raise notice 'bootstrapped administrator UUID %, reviewed email %',
    target_user_id,
    target_email;
end;
$$;

commit;
