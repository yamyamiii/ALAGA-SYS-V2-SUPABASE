-- Extend the already-deployed account deletion guard to dependency-free linked
-- Resident accounts. Cross-service deletion cannot be one PostgreSQL
-- transaction, so rows removed before the Auth Admin API call are staged in a
-- browser-inaccessible table and restored atomically if Auth deletion fails.

create table public.resident_account_deletion_staging (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  resident_snapshot jsonb,
  registration_snapshot jsonb,
  notification_preferences_snapshot jsonb,
  previous_account_status public.account_status not null,
  prepared_by uuid not null references public.profiles (id) on delete restrict,
  prepared_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint resident_account_deletion_resident_snapshot_object check (
    resident_snapshot is null
    or pg_catalog.jsonb_typeof(resident_snapshot) = 'object'
  ),
  constraint resident_account_deletion_registration_snapshot_object check (
    registration_snapshot is null
    or pg_catalog.jsonb_typeof(registration_snapshot) = 'object'
  ),
  constraint resident_account_deletion_preferences_snapshot_object check (
    notification_preferences_snapshot is null
    or pg_catalog.jsonb_typeof(notification_preferences_snapshot) = 'object'
  )
);

alter table public.resident_account_deletion_staging enable row level security;
revoke all on table public.resident_account_deletion_staging
  from public, anon, authenticated, service_role;

-- Preserve the immutable Resident number only during the private compensation
-- path. Normal inserts continue to receive a fresh database-generated number.
create or replace function public.set_resident_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_restore boolean := coalesce(
    pg_catalog.current_setting('app.trusted_resident_account_restore', true) = 'on',
    false
  );
begin
  if tg_op = 'INSERT' then
    if trusted_restore then
      if new.resident_number is null
        or new.resident_number !~ '^RES-[0-9]{4}-[0-9]{6,}$' then
        raise exception 'invalid trusted Resident number restoration';
      end if;
    else
      new.resident_number := pg_catalog.format(
        'RES-%s-%s',
        pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYY'),
        pg_catalog.lpad(
          pg_catalog.nextval('public.resident_number_seq')::text,
          6,
          '0'
        )
      );
    end if;
  elsif new.resident_number is distinct from old.resident_number then
    raise exception 'resident_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.set_resident_number()
  from public, anon, authenticated;

-- Trusted restoration also preserves original creator/updater attribution.
-- No browser-executable RPC can set the scoped restore flag.
create or replace function public.set_actor_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  trusted_resident_restore boolean := coalesce(
    pg_catalog.current_setting('app.trusted_resident_account_restore', true) = 'on',
    false
  );
begin
  if tg_table_name = 'residents'
    and tg_op = 'INSERT'
    and trusted_resident_restore then
    return new;
  end if;

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

revoke all on function public.set_actor_attribution()
  from public, anon, authenticated;

-- Return a non-sensitive blocker code. Every inbound foreign key that points
-- at profiles.id or residents.id is inspected dynamically, including future
-- composite foreign keys. Only explicitly staged or cascade-disposable state
-- is excluded.
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
  select * into target_profile
  from public.profiles as profile
  where profile.id = p_profile_id;

  if not found then return 'profile_missing'; end if;
  if target_profile.avatar_path is not null then return 'profile_avatar'; end if;

  if p_resident_id is not null then
    select * into target_resident
    from public.residents as resident
    where resident.id = p_resident_id
      and resident.linked_profile_id = p_profile_id;

    if not found then return 'resident_link_mismatch'; end if;
    if target_resident.photo_path is not null then return 'resident_photo'; end if;
    if target_resident.status not in (
      'active'::public.resident_status,
      'inactive'::public.resident_status
    ) then
      return 'resident_archived';
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

create or replace function public.admin_resident_account_deletion_eligibility(
  p_actor_id uuid,
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  eligible boolean,
  deletion_kind text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_profile_ids is null
    or pg_catalog.cardinality(p_profile_ids) not between 1 and 100 then
    raise exception 'invalid account deletion eligibility scope';
  end if;

  return query
  select
    profile.id,
    profile.id <> p_actor_id
      and profile.role = 'resident'::public.app_role
      and public.resident_account_deletion_blocker(
        profile.id,
        resident.id
      ) is null as eligible,
    case
      when resident.id is not null or staged_resident.resident_id is not null
        then 'resident'
      else 'registration'
    end as deletion_kind
  from public.profiles as profile
  left join public.residents as resident
    on resident.linked_profile_id = profile.id
  left join public.resident_account_deletion_staging as staging
    on staging.profile_id = profile.id
  left join lateral (
    select (staging.resident_snapshot ->> 'id')::uuid as resident_id
  ) as staged_resident on staging.resident_snapshot is not null
  where profile.id = any(p_profile_ids);
end;
$$;

revoke all on function public.admin_resident_account_deletion_eligibility(
  uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.admin_resident_account_deletion_eligibility(
  uuid, uuid[]
) to service_role;

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

  select * into target_profile
  from public.profiles as profile
  where profile.id = p_target_profile_id
  for update;

  if not found then raise exception 'profile not found'; end if;
  if target_profile.role <> 'resident'::public.app_role then
    raise exception 'permanent deletion is limited to Resident accounts'
      using errcode = '42501';
  end if;

  select * into staged_record
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

  select * into resident_record
  from public.residents as resident
  where resident.linked_profile_id = p_target_profile_id
  for update;
  has_resident := found;

  select * into registration_record
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

  select * into preferences_record
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

  update public.profiles
  set account_status = 'suspended'::public.account_status,
      status_changed_at = pg_catalog.statement_timestamp()
  where id = target_profile.id;

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

  delete from public.notification_preferences
  where profile_id = target_profile.id;

  delete from public.resident_registration_requests
  where profile_id = target_profile.id;

  if has_resident then
    delete from public.residents where id = resident_record.id;
  end if;

  return query
  select
    target_profile.id,
    case when has_registration then registration_record.id else null end,
    target_profile.account_status;
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

  select * into staged_record
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

  update public.profiles
  set account_status = staged_record.previous_account_status,
      status_changed_at = pg_catalog.statement_timestamp()
  where id = p_target_profile_id;

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

  delete from public.resident_account_deletion_staging
  where profile_id = p_target_profile_id;
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
