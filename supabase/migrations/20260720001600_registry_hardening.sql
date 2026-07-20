-- Phase 3B: resident photo storage, duplicate review, scalable household
-- selection, and trusted resident/profile linking.
--
-- This migration is forward-only. Existing registry RLS remains authoritative.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resident-photos',
  'resident-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.resident_photo_object_resident_id(
  object_name text
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  path_parts text[];
begin
  path_parts := string_to_array(object_name, '/');
  if cardinality(path_parts) <> 2
    or path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or path_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$' then
    return null;
  end if;
  return path_parts[1]::uuid;
end;
$$;

revoke all on function public.resident_photo_object_resident_id(text) from public;
revoke all on function public.resident_photo_object_resident_id(text)
  from anon, authenticated;
grant execute on function public.resident_photo_object_resident_id(text)
  to service_role;

create or replace function public.can_view_resident_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.residents as r
    join public.profiles as p on p.id = auth.uid()
    where r.id = public.resident_photo_object_resident_id(object_name)
      and p.account_status = 'active'::public.account_status
      and (
        p.role = 'admin'::public.app_role
        or (
          p.role in (
            'barangay_health_worker'::public.app_role,
            'nurse'::public.app_role,
            'midwife'::public.app_role
          )
          and r.archived_at is null
        )
        or (
          p.role = 'resident'::public.app_role
          and r.linked_profile_id = p.id
          and r.archived_at is null
        )
      )
  );
$$;

revoke all on function public.can_view_resident_photo(text) from public;
revoke all on function public.can_view_resident_photo(text) from anon;
grant execute on function public.can_view_resident_photo(text)
  to authenticated, service_role;

create or replace function public.can_manage_resident_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.residents as r
    join public.profiles as p on p.id = auth.uid()
    where r.id = public.resident_photo_object_resident_id(object_name)
      and p.account_status = 'active'::public.account_status
      and (
        p.role = 'admin'::public.app_role
        or (
          p.role = 'barangay_health_worker'::public.app_role
          and r.archived_at is null
        )
      )
  );
$$;

revoke all on function public.can_manage_resident_photo(text) from public;
revoke all on function public.can_manage_resident_photo(text) from anon;
grant execute on function public.can_manage_resident_photo(text)
  to authenticated, service_role;

drop policy if exists resident_photos_select_authorized on storage.objects;
create policy resident_photos_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resident-photos'
  and public.can_view_resident_photo(name)
);

drop policy if exists resident_photos_insert_admin_bhw on storage.objects;
create policy resident_photos_insert_admin_bhw
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resident-photos'
  and public.can_manage_resident_photo(name)
  and lower(coalesce(metadata ->> 'mimetype', '')) in (
    'image/jpeg', 'image/png', 'image/webp'
  )
);

drop policy if exists resident_photos_update_admin_bhw on storage.objects;
create policy resident_photos_update_admin_bhw
on storage.objects
for update
to authenticated
using (
  bucket_id = 'resident-photos'
  and public.can_manage_resident_photo(name)
)
with check (
  bucket_id = 'resident-photos'
  and public.can_manage_resident_photo(name)
  and lower(coalesce(metadata ->> 'mimetype', '')) in (
    'image/jpeg', 'image/png', 'image/webp'
  )
);

drop policy if exists resident_photos_delete_admin_bhw on storage.objects;
create policy resident_photos_delete_admin_bhw
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resident-photos'
  and public.can_manage_resident_photo(name)
);

-- Emit a semantic audit record in addition to the existing safe row-change
-- audit. Object paths and signed URLs are deliberately excluded.
create or replace function public.audit_resident_photo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_uuid uuid;
  audit_action text;
  audit_summary text;
begin
  if new.photo_path is not distinct from old.photo_path then
    return new;
  end if;

  select p.id into actor_uuid
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  if old.photo_path is null then
    audit_action := 'resident.photo_uploaded';
    audit_summary := 'Uploaded resident photo';
  elsif new.photo_path is null then
    audit_action := 'resident.photo_removed';
    audit_summary := 'Removed resident photo';
  else
    audit_action := 'resident.photo_replaced';
    audit_summary := 'Replaced resident photo';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    summary,
    request_metadata
  ) values (
    actor_uuid,
    audit_action,
    'residents',
    new.id,
    audit_summary,
    jsonb_build_object('changed_fields', jsonb_build_array('photo_path'))
  );

  return new;
end;
$$;

revoke all on function public.audit_resident_photo_change() from public;
revoke all on function public.audit_resident_photo_change()
  from anon, authenticated;

create trigger residents_audit_photo_change
  after update of photo_path on public.residents
  for each row execute function public.audit_resident_photo_change();

-- Searchable, paginated current-household picker. This function is an invoker
-- so existing household/head RLS controls every result.
create or replace function public.registry_search_households(
  p_purok_id uuid,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  household_number text,
  barangay_id uuid,
  purok_id uuid,
  purok_name text,
  address_line text,
  head_name text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  selected_barangay_id uuid;
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_purok_id is null then
    raise exception 'purok is required for household search';
  end if;
  if p_limit not between 1 and 25 or p_offset < 0 then
    raise exception 'invalid household picker pagination';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'household search is too long';
  end if;

  select p.barangay_id into selected_barangay_id
  from public.puroks as p
  where p.id = p_purok_id
    and p.is_active
    and p.barangay_id = public.deployment_barangay_id();

  if selected_barangay_id is null then
    raise exception 'selected purok is not an active Brgy. Bagongpook deployment purok';
  end if;

  search_pattern := '%' || normalized_search || '%';

  return query
  select
    h.id,
    h.household_number,
    h.barangay_id,
    h.purok_id,
    location_purok.name,
    h.address_line,
    nullif(concat_ws(' ', hr.first_name, hr.middle_name, hr.last_name, hr.suffix), ''),
    count(*) over ()
  from public.households as h
  join public.puroks as location_purok on location_purok.id = h.purok_id
  left join public.residents as hr on hr.id = h.head_resident_id
  where h.barangay_id = selected_barangay_id
    and h.purok_id = p_purok_id
    and h.archived_at is null
    and h.status <> 'archived'::public.household_status
    and (
      normalized_search is null
      or h.household_number ilike search_pattern
      or h.address_line ilike search_pattern
      or concat_ws(' ', hr.first_name, hr.middle_name, hr.last_name, hr.suffix)
        ilike search_pattern
    )
  order by h.household_number
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.registry_search_households(uuid, text, integer, integer) from public;
revoke all on function public.registry_search_households(uuid, text, integer, integer) from anon;
grant execute on function public.registry_search_households(uuid, text, integer, integer)
  to authenticated, service_role;

create or replace function public.registry_normalize_identity(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(value, ''))), '[^a-z0-9]+', '', 'g'), '');
$$;

revoke all on function public.registry_normalize_identity(text) from public;
grant execute on function public.registry_normalize_identity(text)
  to authenticated, service_role;

create index residents_duplicate_identity_idx
  on public.residents (
    public.registry_normalize_identity(first_name),
    public.registry_normalize_identity(last_name),
    date_of_birth,
    sex
  )
  where archived_at is null;

create or replace function public.registry_find_resident_duplicates(
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_date_of_birth date,
  p_sex public.sex_type,
  p_phone_number text default null,
  p_exclude_id uuid default null
)
returns table (
  id uuid,
  resident_number text,
  display_name text,
  date_of_birth date,
  purok_name text,
  household_number text,
  phone_match boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_phone text := public.registry_normalize_identity(p_phone_number);
begin
  if not public.is_staff() then
    raise exception 'active staff access is required for duplicate review';
  end if;
  if public.registry_normalize_identity(p_first_name) is null
    or public.registry_normalize_identity(p_last_name) is null
    or p_date_of_birth is null
    or p_sex is null then
    raise exception 'first name, last name, date of birth, and sex are required for duplicate review';
  end if;

  return query
  select
    r.id,
    r.resident_number,
    concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix),
    r.date_of_birth,
    p.name,
    h.household_number,
    normalized_phone is not null
      and public.registry_normalize_identity(r.phone_number) = normalized_phone
  from public.residents as r
  join public.puroks as p on p.id = r.purok_id
  left join public.households as h on h.id = r.household_id
  where r.id is distinct from p_exclude_id
    and r.archived_at is null
    and public.registry_normalize_identity(r.first_name)
      = public.registry_normalize_identity(p_first_name)
    and public.registry_normalize_identity(r.last_name)
      = public.registry_normalize_identity(p_last_name)
    and r.date_of_birth = p_date_of_birth
    and r.sex = p_sex
    and (
      public.registry_normalize_identity(r.middle_name)
        is not distinct from public.registry_normalize_identity(p_middle_name)
      or public.registry_normalize_identity(r.middle_name) is null
      or public.registry_normalize_identity(p_middle_name) is null
    )
    and (
      public.registry_normalize_identity(r.suffix)
        is not distinct from public.registry_normalize_identity(p_suffix)
      or public.registry_normalize_identity(r.suffix) is null
      or public.registry_normalize_identity(p_suffix) is null
    )
  order by (
    normalized_phone is not null
    and public.registry_normalize_identity(r.phone_number) = normalized_phone
  ) desc, r.resident_number
  limit 10;
end;
$$;

revoke all on function public.registry_find_resident_duplicates(text, text, text, text, date, public.sex_type, text, uuid) from public;
revoke all on function public.registry_find_resident_duplicates(text, text, text, text, date, public.sex_type, text, uuid) from anon;
grant execute on function public.registry_find_resident_duplicates(text, text, text, text, date, public.sex_type, text, uuid)
  to authenticated, service_role;

create or replace function public.registry_record_duplicate_override(
  p_resident_id uuid,
  p_match_count integer,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_uuid uuid := auth.uid();
begin
  if public.current_profile_role() not in (
      'admin'::public.app_role,
      'barangay_health_worker'::public.app_role
    ) or not exists (
      select 1 from public.profiles as p
      where p.id = actor_uuid
        and p.account_status = 'active'::public.account_status
    ) then
    raise exception 'administrator or BHW permission is required';
  end if;
  if p_match_count not between 1 and 10 or p_operation not in ('create', 'update') then
    raise exception 'invalid duplicate override audit metadata';
  end if;
  if not exists (select 1 from public.residents as r where r.id = p_resident_id) then
    raise exception 'resident not found';
  end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    actor_uuid,
    'resident.duplicate_override',
    'residents',
    p_resident_id,
    'Saved resident after duplicate warning review',
    jsonb_build_object('match_count', p_match_count, 'operation', p_operation)
  );
end;
$$;

revoke all on function public.registry_record_duplicate_override(uuid, integer, text) from public;
revoke all on function public.registry_record_duplicate_override(uuid, integer, text) from anon;
grant execute on function public.registry_record_duplicate_override(uuid, integer, text)
  to authenticated, service_role;

create or replace function public.enforce_registry_archive_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'residents' then
    if tg_op = 'INSERT'
      and new.status in (
        'archived'::public.resident_status,
        'moved_out'::public.resident_status,
        'deceased'::public.resident_status
      )
      and new.household_id is not null then
      raise exception 'archived residents cannot be assigned to households';
    end if;
    if tg_op = 'UPDATE'
      and old.status in (
        'archived'::public.resident_status,
        'moved_out'::public.resident_status,
        'deceased'::public.resident_status
      )
      and new.household_id is distinct from old.household_id then
      raise exception 'archived residents cannot change household assignment';
    end if;
    return new;
  end if;

  if new.head_resident_id is not null and not exists (
    select 1
    from public.residents as r
    where r.id = new.head_resident_id
      and r.household_id = new.id
      and r.status = 'active'::public.resident_status
      and r.archived_at is null
  ) then
    raise exception 'household head must be an active member of the household';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_registry_archive_integrity() from public;
revoke all on function public.enforce_registry_archive_integrity()
  from anon, authenticated;

create trigger residents_enforce_archive_integrity
  before insert or update of household_id, status, archived_at on public.residents
  for each row execute function public.enforce_registry_archive_integrity();

create trigger households_enforce_archive_integrity
  before insert or update of head_resident_id on public.households
  for each row execute function public.enforce_registry_archive_integrity();

-- Trusted resident-account linking. These functions are service-role-only and
-- independently verify the administrator actor supplied by the Edge Function.
create or replace function public.protect_resident_profile_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
      (tg_op = 'INSERT' and new.linked_profile_id is not null)
      or (
        tg_op = 'UPDATE'
        and new.linked_profile_id is distinct from old.linked_profile_id
      )
    ) and coalesce(
      current_setting('app.trusted_resident_linking', true),
      'off'
    ) <> 'on' then
    raise exception 'resident profile links require the trusted administrator workflow';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_resident_profile_link() from public;
revoke all on function public.protect_resident_profile_link()
  from anon, authenticated;

create or replace function public.admin_list_resident_link_candidates(
  p_actor_id uuid,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  account_status public.account_status,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  perform public.assert_active_administrator(p_actor_id);
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid resident profile pagination';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'resident profile search is too long';
  end if;
  search_pattern := '%' || normalized_search || '%';

  return query
  select
    p.id,
    u.email::text,
    p.first_name,
    p.middle_name,
    p.last_name,
    p.suffix,
    p.account_status,
    count(*) over ()
  from public.profiles as p
  join auth.users as u on u.id = p.id
  where p.role = 'resident'::public.app_role
    and p.account_status in (
      'invited'::public.account_status,
      'active'::public.account_status
    )
    and not exists (
      select 1 from public.residents as r where r.linked_profile_id = p.id
    )
    and (
      normalized_search is null
      or u.email ilike search_pattern
      or concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)
        ilike search_pattern
    )
  order by lower(coalesce(p.last_name, '')), lower(coalesce(p.first_name, '')), p.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_get_resident_account(
  p_actor_id uuid,
  p_resident_id uuid
)
returns table (
  id uuid,
  email text,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  account_status public.account_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);
  return query
  select p.id, u.email::text, p.first_name, p.middle_name, p.last_name,
    p.suffix, p.account_status
  from public.residents as r
  join public.profiles as p on p.id = r.linked_profile_id
  join auth.users as u on u.id = p.id
  where r.id = p_resident_id;
end;
$$;

create or replace function public.admin_link_resident_profile(
  p_actor_id uuid,
  p_resident_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status public.resident_status;
begin
  perform public.assert_active_administrator(p_actor_id);

  select r.status into target_status
  from public.residents as r
  where r.id = p_resident_id
  for update;
  if target_status is null then raise exception 'resident not found'; end if;
  if target_status in ('archived', 'moved_out', 'deceased') then
    raise exception 'archived residents cannot be linked to portal accounts';
  end if;
  if not exists (
    select 1 from public.profiles as p
    where p.id = p_profile_id
      and p.role = 'resident'::public.app_role
      and p.account_status in (
        'invited'::public.account_status,
        'active'::public.account_status
      )
  ) then
    raise exception 'select an active or invited resident-role profile';
  end if;
  if exists (
    select 1 from public.residents as r
    where r.linked_profile_id = p_profile_id and r.id <> p_resident_id
  ) then
    raise exception 'profile is already linked to another resident';
  end if;

  perform set_config('app.trusted_resident_linking', 'on', true);
  update public.residents
  set linked_profile_id = p_profile_id, updated_by = p_actor_id
  where id = p_resident_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    p_actor_id,
    'resident.account_linked',
    'residents',
    p_resident_id,
    'Linked resident portal account',
    jsonb_build_object('profile_id', p_profile_id)
  );
end;
$$;

create or replace function public.admin_unlink_resident_profile(
  p_actor_id uuid,
  p_resident_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_profile_id uuid;
begin
  perform public.assert_active_administrator(p_actor_id);
  select r.linked_profile_id into previous_profile_id
  from public.residents as r
  where r.id = p_resident_id
  for update;
  if not found then raise exception 'resident not found'; end if;
  if previous_profile_id is null then raise exception 'resident has no linked profile'; end if;

  perform set_config('app.trusted_resident_linking', 'on', true);
  update public.residents
  set linked_profile_id = null, updated_by = p_actor_id
  where id = p_resident_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    p_actor_id,
    'resident.account_unlinked',
    'residents',
    p_resident_id,
    'Unlinked resident portal account',
    jsonb_build_object('profile_id', previous_profile_id)
  );
end;
$$;

revoke all on function public.admin_list_resident_link_candidates(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_resident_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_link_resident_profile(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_unlink_resident_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_resident_link_candidates(uuid, text, integer, integer) to service_role;
grant execute on function public.admin_get_resident_account(uuid, uuid) to service_role;
grant execute on function public.admin_link_resident_profile(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_unlink_resident_profile(uuid, uuid) to service_role;
