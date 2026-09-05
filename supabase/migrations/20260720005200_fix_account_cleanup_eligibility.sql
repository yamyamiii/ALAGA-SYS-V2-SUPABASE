-- Make archived Resident identity rows eligible for the existing guarded
-- permanent-delete workflow when no real protected dependency exists. Expose
-- only a coarse, non-sensitive blocker category to the trusted Edge Function
-- so Administrator UX can distinguish retained history from eligible cleanup.

create or replace function public.resident_account_deletion_blocker(
  p_profile_id uuid,
  p_resident_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  target_resident public.residents%rowtype;
  dependency record;
  dependency_exists boolean;
begin
  select profile.* into target_profile
  from public.profiles as profile
  where profile.id = p_profile_id;

  if not found then return 'profile_missing'; end if;
  if target_profile.avatar_path is not null then return 'profile_avatar'; end if;

  if p_resident_id is not null then
    select resident.* into target_resident
    from public.residents as resident
    where resident.id = p_resident_id
      and resident.linked_profile_id = p_profile_id;

    if not found then return 'resident_link_mismatch'; end if;
    if target_resident.photo_path is not null then return 'resident_photo'; end if;
    if target_resident.status not in (
      'active'::public.resident_status,
      'inactive'::public.resident_status,
      'archived'::public.resident_status
    ) then
      return 'resident_protected_lifecycle';
    end if;
  end if;

  for dependency in
    select distinct
      source_namespace.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table
      on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_namespace
      on source_namespace.oid = source_table.relnamespace
    cross join lateral pg_catalog.unnest(foreign_key.conkey)
      with ordinality as source_key(attnum, key_position)
    cross join lateral pg_catalog.unnest(foreign_key.confkey)
      with ordinality as target_key(attnum, key_position)
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = source_key.attnum
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = foreign_key.confrelid
      and target_column.attnum = target_key.attnum
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.profiles'::pg_catalog.regclass
      and source_key.key_position = target_key.key_position
      and target_column.attname = 'id'
      and not (
        source_namespace.nspname = 'public'
        and (
          (source_table.relname = 'resident_registration_requests'
            and source_column.attname = 'profile_id')
          or (source_table.relname = 'residents'
            and source_column.attname = 'linked_profile_id')
          or (source_table.relname = 'notification_preferences'
            and source_column.attname = 'profile_id')
          or (source_table.relname = 'admin_action_rate_limits'
            and source_column.attname = 'actor_profile_id')
          or (source_table.relname = 'ai_request_rate_limits'
            and source_column.attname = 'profile_id')
          or (source_table.relname = 'assistance_notifications'
            and source_column.attname = 'recipient_profile_id')
          or (source_table.relname = 'resident_account_deletion_staging'
            and source_column.attname = 'profile_id')
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
    using p_profile_id;

    if dependency_exists then
      return pg_catalog.format(
        'profile_dependency:%s.%s.%s',
        dependency.schema_name,
        dependency.table_name,
        dependency.column_name
      );
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.profiles'::pg_catalog.regclass
      and not exists (
        select 1
        from pg_catalog.unnest(foreign_key.confkey) as target_key(attnum)
        join pg_catalog.pg_attribute as target_column
          on target_column.attrelid = foreign_key.confrelid
          and target_column.attnum = target_key.attnum
        where target_column.attname = 'id'
      )
  ) then
    return 'unknown_profile_reference';
  end if;

  if p_resident_id is null then return null; end if;

  for dependency in
    select distinct
      source_namespace.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table
      on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_namespace
      on source_namespace.oid = source_table.relnamespace
    cross join lateral pg_catalog.unnest(foreign_key.conkey)
      with ordinality as source_key(attnum, key_position)
    cross join lateral pg_catalog.unnest(foreign_key.confkey)
      with ordinality as target_key(attnum, key_position)
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = source_key.attnum
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = foreign_key.confrelid
      and target_column.attnum = target_key.attnum
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.residents'::pg_catalog.regclass
      and source_key.key_position = target_key.key_position
      and target_column.attname = 'id'
      and not (
        source_namespace.nspname = 'public'
        and source_table.relname = 'resident_registration_requests'
        and source_column.attname = 'resident_id'
      )
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I where %I = $1)',
      dependency.schema_name,
      dependency.table_name,
      dependency.column_name
    )
    into dependency_exists
    using p_resident_id;

    if dependency_exists then
      return pg_catalog.format(
        'resident_dependency:%s.%s.%s',
        dependency.schema_name,
        dependency.table_name,
        dependency.column_name
      );
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.residents'::pg_catalog.regclass
      and not exists (
        select 1
        from pg_catalog.unnest(foreign_key.confkey) as target_key(attnum)
        join pg_catalog.pg_attribute as target_column
          on target_column.attrelid = foreign_key.confrelid
          and target_column.attnum = target_key.attnum
        where target_column.attname = 'id'
      )
  ) then
    return 'unknown_resident_reference';
  end if;

  return null;
end;
$$;

revoke all on function public.resident_account_deletion_blocker(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_account_deletion_assessment(
  p_actor_id uuid,
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  eligible boolean,
  deletion_kind text,
  blocker_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  raw_blocker text;
  safe_blocker text;
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_profile_ids is null
    or pg_catalog.cardinality(p_profile_ids) not between 1 and 100 then
    raise exception 'invalid account deletion assessment scope';
  end if;

  for target in
    select
      profile.id,
      profile.role,
      resident.id as resident_id,
      registration.id as registration_id
    from public.profiles as profile
    left join public.residents as resident
      on resident.linked_profile_id = profile.id
    left join public.resident_registration_requests as registration
      on registration.profile_id = profile.id
    where profile.id = any(p_profile_ids)
  loop
    raw_blocker := null;
    safe_blocker := null;

    if target.id = p_actor_id then
      safe_blocker := 'self_account';
    elsif target.role = 'admin'::public.app_role then
      safe_blocker := 'administrator_account';
    elsif target.role not in (
      'resident'::public.app_role,
      'barangay_health_worker'::public.app_role,
      'nurse'::public.app_role,
      'midwife'::public.app_role
    ) then
      safe_blocker := 'unsupported_account';
    elsif target.role <> 'resident'::public.app_role
      and (target.resident_id is not null or target.registration_id is not null) then
      safe_blocker := 'account_link_inconsistent';
    elsif target.role <> 'resident'::public.app_role
      and exists (
        select 1
        from public.assistance_notifications as notification
        where notification.recipient_profile_id = target.id
      ) then
      safe_blocker := 'notification_history';
    else
      raw_blocker := public.resident_account_deletion_blocker(
        target.id,
        case
          when target.role = 'resident'::public.app_role then target.resident_id
          else null
        end
      );

      safe_blocker := case
        when raw_blocker is null then null
        when raw_blocker in ('profile_avatar', 'resident_photo')
          then 'retained_media'
        when raw_blocker like '%public.appointments.%'
          or raw_blocker like '%public.appointment_request_events.%'
          then 'appointment_history'
        when raw_blocker like '%public.health_encounters.%'
          or raw_blocker like '%public.vital_signs.%'
          or raw_blocker like '%public.resident_allergies.%'
          or raw_blocker like '%public.resident_medical_history.%'
          or raw_blocker like '%public.clinical_referrals.%'
          or raw_blocker like '%public.maternal_%'
          or raw_blocker like '%public.child_%'
          then 'clinical_history'
        when raw_blocker like '%public.audit_logs.%'
          then 'audit_history'
        when raw_blocker like '%public.resident_inquiries.%'
          then 'inquiry_history'
        when raw_blocker like '%public.outbound_notification_jobs.%'
          then 'notification_history'
        when raw_blocker like '%public.households.%'
          then 'household_dependency'
        when raw_blocker in (
          'profile_missing',
          'resident_link_mismatch'
        ) then 'account_state_invalid'
        when raw_blocker = 'resident_protected_lifecycle'
          then 'protected_resident_lifecycle'
        else 'protected_dependency'
      end;
    end if;

    profile_id := target.id;
    eligible := safe_blocker is null;
    deletion_kind := case
      when target.role = 'resident'::public.app_role then 'resident'
      else 'account'
    end;
    blocker_code := safe_blocker;
    return next;
  end loop;
end;
$$;

revoke all on function public.admin_account_deletion_assessment(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.admin_account_deletion_assessment(uuid, uuid[])
  to service_role;

comment on function public.admin_account_deletion_assessment(uuid, uuid[]) is
  'Returns service-role-only permanent-delete eligibility and a coarse non-sensitive retention category after active Administrator verification.';
