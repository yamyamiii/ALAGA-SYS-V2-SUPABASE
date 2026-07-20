-- Phase 3A: household and resident registry query/workflow foundation.
-- Existing RLS remains authoritative. These invoker RPCs never bypass it.

-- Household display numbers are generated atomically and cannot be supplied or
-- changed by browser clients.
create sequence public.household_number_seq as bigint start with 1 increment by 1;

create or replace function public.set_household_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  if tg_op = 'INSERT' then
    loop
      candidate := format(
        'HH-%s-%s',
        to_char(clock_timestamp(), 'YYYY'),
        lpad(nextval('public.household_number_seq')::text, 6, '0')
      );
      exit when not exists (
        select 1
        from public.households as h
        where h.household_number = candidate
      );
    end loop;
    new.household_number := candidate;
  elsif new.household_number is distinct from old.household_number then
    raise exception 'household_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.set_household_number() from public;
revoke all on function public.set_household_number() from anon, authenticated;
revoke all on sequence public.household_number_seq from public, anon, authenticated;
grant usage on sequence public.household_number_seq to service_role;

create trigger households_set_number
  before insert or update on public.households
  for each row execute function public.set_household_number();

alter table public.residents
  alter column address_line drop not null,
  drop constraint residents_archive_consistency,
  add constraint residents_archive_consistency check (
    (status in ('moved_out', 'deceased', 'archived') and archived_at is not null)
    or (status in ('active', 'inactive') and archived_at is null)
  );

-- Archive timestamps are derived from lifecycle status, not trusted from form
-- payloads. This keeps direct RLS-protected updates consistent.
create or replace function public.set_registry_archive_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'households' then
    if new.status = 'archived'::public.household_status then
      new.archived_at := coalesce(
        case when tg_op = 'UPDATE' then old.archived_at end,
        statement_timestamp()
      );
    else
      new.archived_at := null;
    end if;
  else
    if new.status in (
      'moved_out'::public.resident_status,
      'deceased'::public.resident_status,
      'archived'::public.resident_status
    ) then
      new.archived_at := coalesce(
        case when tg_op = 'UPDATE' then old.archived_at end,
        statement_timestamp()
      );
    else
      new.archived_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_registry_archive_state() from public;
revoke all on function public.set_registry_archive_state() from anon, authenticated;

create trigger households_set_archive_state
  before insert or update of status, archived_at on public.households
  for each row execute function public.set_registry_archive_state();

create trigger residents_set_archive_state
  before insert or update of status, archived_at on public.residents
  for each row execute function public.set_registry_archive_state();

-- A household head must remain a current household member. A resident cannot
-- be moved out of a household or archived while still selected as its head.
create or replace function public.validate_registry_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'households' then
    if new.head_resident_id is not null
      and not exists (
        select 1
        from public.residents as r
        where r.id = new.head_resident_id
          and r.household_id = new.id
          and r.archived_at is null
      ) then
      raise exception 'household head must be a current member of the household';
    end if;
    return new;
  end if;

  if new.household_id is not null
    and (
      tg_op = 'INSERT'
      or new.household_id is distinct from old.household_id
    )
    and not exists (
      select 1
      from public.households as h
      where h.id = new.household_id
        and h.barangay_id = new.barangay_id
        and h.purok_id = new.purok_id
        and h.archived_at is null
    ) then
    raise exception 'resident household must be current and match the selected locality';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.household_id is distinct from old.household_id
      or (old.archived_at is null and new.archived_at is not null)
    )
    and exists (
      select 1
      from public.households as h
      where h.head_resident_id = old.id
    ) then
    raise exception 'reassign the household head before moving or archiving this resident';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_registry_relationships() from public;
revoke all on function public.validate_registry_relationships() from anon, authenticated;

create trigger households_validate_registry_relationships
  before insert or update of head_resident_id on public.households
  for each row execute function public.validate_registry_relationships();

create trigger residents_validate_registry_relationships
  before insert or update of household_id, barangay_id, purok_id, status, archived_at
  on public.residents
  for each row execute function public.validate_registry_relationships();

create index households_registry_filter_idx
  on public.households (status, barangay_id, purok_id, created_at desc);

create index residents_registry_filter_idx
  on public.residents (status, barangay_id, purok_id, created_at desc);

create index residents_registry_classification_idx
  on public.residents (is_senior_citizen, is_pwd)
  where archived_at is null;

-- Paginated household search. The function runs with caller privileges, so the
-- existing table grants and RLS policies filter every household/head/member row.
create or replace function public.registry_list_households(
  p_search text default null,
  p_barangay_id uuid default null,
  p_purok_id uuid default null,
  p_status public.household_status default null,
  p_include_archived boolean default false,
  p_sort text default 'household_number',
  p_direction text default 'asc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  household_number text,
  barangay_id uuid,
  barangay_name text,
  purok_id uuid,
  purok_name text,
  address_line text,
  latitude numeric,
  longitude numeric,
  head_resident_id uuid,
  head_name text,
  status public.household_status,
  member_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid registry pagination';
  end if;
  if p_sort not in ('household_number', 'created_at', 'address_line')
    or p_direction not in ('asc', 'desc') then
    raise exception 'invalid household sort';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'household search is too long';
  end if;

  search_pattern := '%' || normalized_search || '%';

  return query
  select
    h.id,
    h.household_number,
    h.barangay_id,
    b.name,
    h.purok_id,
    p.name,
    h.address_line,
    h.latitude,
    h.longitude,
    h.head_resident_id,
    nullif(
      concat_ws(' ', hr.first_name, hr.middle_name, hr.last_name, hr.suffix),
      ''
    ),
    h.status,
    (
      select count(*)
      from public.residents as member
      where member.household_id = h.id
        and member.archived_at is null
    ),
    h.created_at,
    h.updated_at,
    h.archived_at,
    count(*) over ()
  from public.households as h
  join public.barangays as b on b.id = h.barangay_id
  join public.puroks as p on p.id = h.purok_id
  left join public.residents as hr on hr.id = h.head_resident_id
  where (p_include_archived or h.archived_at is null)
    and (p_barangay_id is null or h.barangay_id = p_barangay_id)
    and (p_purok_id is null or h.purok_id = p_purok_id)
    and (p_status is null or h.status = p_status)
    and (
      normalized_search is null
      or h.household_number ilike search_pattern
      or h.address_line ilike search_pattern
      or concat_ws(' ', hr.first_name, hr.middle_name, hr.last_name, hr.suffix)
        ilike search_pattern
    )
  order by
    case when p_sort = 'household_number' and p_direction = 'asc' then h.household_number end asc,
    case when p_sort = 'household_number' and p_direction = 'desc' then h.household_number end desc,
    case when p_sort = 'created_at' and p_direction = 'asc' then h.created_at end asc,
    case when p_sort = 'created_at' and p_direction = 'desc' then h.created_at end desc,
    case when p_sort = 'address_line' and p_direction = 'asc' then lower(h.address_line) end asc,
    case when p_sort = 'address_line' and p_direction = 'desc' then lower(h.address_line) end desc,
    h.id asc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.registry_list_households(text, uuid, uuid, public.household_status, boolean, text, text, integer, integer) from public;
revoke all on function public.registry_list_households(text, uuid, uuid, public.household_status, boolean, text, text, integer, integer) from anon;
grant execute on function public.registry_list_households(text, uuid, uuid, public.household_status, boolean, text, text, integer, integer) to authenticated, service_role;

-- Paginated resident search. No personal values are copied outside the selected
-- result rows, and RLS continues to decide which residents the caller can see.
create or replace function public.registry_list_residents(
  p_search text default null,
  p_barangay_id uuid default null,
  p_purok_id uuid default null,
  p_sex public.sex_type default null,
  p_status public.resident_status default null,
  p_is_senior_citizen boolean default null,
  p_is_pwd boolean default null,
  p_household_filter text default 'all',
  p_archive_filter text default 'current',
  p_sort text default 'resident_number',
  p_direction text default 'asc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  resident_number text,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  date_of_birth date,
  age_years integer,
  sex public.sex_type,
  barangay_id uuid,
  barangay_name text,
  purok_id uuid,
  purok_name text,
  household_id uuid,
  household_number text,
  phone_number text,
  address_line text,
  is_senior_citizen boolean,
  is_pwd boolean,
  pregnancy_status public.pregnancy_status_type,
  status public.resident_status,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  search_pattern text;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid registry pagination';
  end if;
  if p_household_filter not in ('all', 'assigned', 'unassigned')
    or p_archive_filter not in ('current', 'archived', 'all') then
    raise exception 'invalid resident filter';
  end if;
  if p_sort not in ('resident_number', 'name', 'age', 'created_at')
    or p_direction not in ('asc', 'desc') then
    raise exception 'invalid resident sort';
  end if;
  if normalized_search is not null and char_length(normalized_search) > 100 then
    raise exception 'resident search is too long';
  end if;

  search_pattern := '%' || normalized_search || '%';

  return query
  select
    r.id,
    r.resident_number,
    r.first_name,
    r.middle_name,
    r.last_name,
    r.suffix,
    r.date_of_birth,
    extract(year from age(current_date, r.date_of_birth))::integer,
    r.sex,
    r.barangay_id,
    b.name,
    r.purok_id,
    p.name,
    r.household_id,
    h.household_number,
    r.phone_number,
    r.address_line,
    r.is_senior_citizen,
    r.is_pwd,
    r.pregnancy_status,
    r.status,
    r.created_at,
    r.updated_at,
    r.archived_at,
    count(*) over ()
  from public.residents as r
  join public.barangays as b on b.id = r.barangay_id
  join public.puroks as p on p.id = r.purok_id
  left join public.households as h on h.id = r.household_id
  where (
      p_archive_filter = 'all'
      or (p_archive_filter = 'current' and r.archived_at is null)
      or (p_archive_filter = 'archived' and r.archived_at is not null)
    )
    and (p_barangay_id is null or r.barangay_id = p_barangay_id)
    and (p_purok_id is null or r.purok_id = p_purok_id)
    and (p_sex is null or r.sex = p_sex)
    and (p_status is null or r.status = p_status)
    and (p_is_senior_citizen is null or r.is_senior_citizen = p_is_senior_citizen)
    and (p_is_pwd is null or r.is_pwd = p_is_pwd)
    and (
      p_household_filter = 'all'
      or (p_household_filter = 'assigned' and r.household_id is not null)
      or (p_household_filter = 'unassigned' and r.household_id is null)
    )
    and (
      normalized_search is null
      or r.resident_number ilike search_pattern
      or concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)
        ilike search_pattern
      or r.phone_number ilike search_pattern
      or r.address_line ilike search_pattern
      or h.household_number ilike search_pattern
    )
  order by
    case when p_sort = 'resident_number' and p_direction = 'asc' then r.resident_number end asc,
    case when p_sort = 'resident_number' and p_direction = 'desc' then r.resident_number end desc,
    case when p_sort = 'name' and p_direction = 'asc' then lower(r.last_name) end asc,
    case when p_sort = 'name' and p_direction = 'desc' then lower(r.last_name) end desc,
    case when p_sort = 'age' and p_direction = 'asc' then r.date_of_birth end desc,
    case when p_sort = 'age' and p_direction = 'desc' then r.date_of_birth end asc,
    case when p_sort = 'created_at' and p_direction = 'asc' then r.created_at end asc,
    case when p_sort = 'created_at' and p_direction = 'desc' then r.created_at end desc,
    lower(r.first_name) asc,
    r.id asc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.registry_list_residents(text, uuid, uuid, public.sex_type, public.resident_status, boolean, boolean, text, text, text, text, integer, integer) from public;
revoke all on function public.registry_list_residents(text, uuid, uuid, public.sex_type, public.resident_status, boolean, boolean, text, text, text, text, integer, integer) from anon;
grant execute on function public.registry_list_residents(text, uuid, uuid, public.sex_type, public.resident_status, boolean, boolean, text, text, text, text, integer, integer) to authenticated, service_role;

-- Audit metadata contains only changed column names. Values continue to use the
-- Phase 1 safe snapshots, which exclude addresses, contact details, PhilHealth
-- numbers, emergency contacts, and clinical/classification values.
create or replace function public.registry_changed_fields(
  table_name text,
  old_row jsonb,
  new_row jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  allowed_fields text[];
  changed jsonb;
begin
  if old_row is null or new_row is null then
    return null;
  end if;

  case table_name
    when 'households' then
      allowed_fields := array[
        'barangay_id', 'purok_id', 'address_line', 'latitude', 'longitude',
        'head_resident_id', 'status', 'archived_at'
      ];
    when 'residents' then
      allowed_fields := array[
        'household_id', 'barangay_id', 'purok_id', 'first_name', 'middle_name',
        'last_name', 'suffix', 'date_of_birth', 'sex', 'civil_status',
        'blood_type', 'nationality', 'religion', 'phone_number', 'email',
        'occupation', 'address_line', 'philhealth_number',
        'emergency_contact_name', 'emergency_contact_number',
        'emergency_contact_relationship', 'is_senior_citizen', 'is_pwd',
        'pregnancy_status', 'status', 'photo_path', 'archived_at'
      ];
    else
      return null;
  end case;

  select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
  into changed
  from unnest(allowed_fields) as field_name
  where old_row -> field_name is distinct from new_row -> field_name;

  return changed;
end;
$$;

revoke all on function public.registry_changed_fields(text, jsonb, jsonb) from public;
revoke all on function public.registry_changed_fields(text, jsonb, jsonb) from anon, authenticated;

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
  audit_action text := lower(tg_op);
  audit_summary text := format('%s %s record', initcap(lower(tg_op)), tg_table_name);
  audit_metadata jsonb;
begin
  select p.id
  into actor_uuid
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  if tg_table_name = 'households' then
    if tg_op = 'INSERT' then
      audit_action := 'household.created';
      audit_summary := 'Created household record';
    elsif tg_op = 'UPDATE' then
      if old.status <> 'archived'::public.household_status
        and new.status = 'archived'::public.household_status then
        audit_action := 'household.archived';
        audit_summary := 'Archived household record';
      elsif old.status = 'archived'::public.household_status
        and new.status <> 'archived'::public.household_status then
        audit_action := 'household.restored';
        audit_summary := 'Restored household record';
      elsif new.head_resident_id is distinct from old.head_resident_id then
        audit_action := 'household.head_changed';
        audit_summary := 'Changed household head';
      else
        audit_action := 'household.updated';
        audit_summary := 'Updated household record';
      end if;
    end if;
  elsif tg_table_name = 'residents' then
    if tg_op = 'INSERT' then
      audit_action := 'resident.created';
      audit_summary := 'Created resident record';
    elsif tg_op = 'UPDATE' then
      if old.archived_at is null and new.archived_at is not null then
        audit_action := 'resident.archived';
        audit_summary := 'Archived resident record';
      elsif old.archived_at is not null and new.archived_at is null then
        audit_action := 'resident.restored';
        audit_summary := 'Restored resident record';
      elsif new.household_id is distinct from old.household_id then
        audit_action := 'resident.household_changed';
        audit_summary := 'Changed resident household assignment';
      else
        audit_action := 'resident.updated';
        audit_summary := 'Updated resident record';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and tg_table_name in ('households', 'residents') then
    audit_metadata := jsonb_build_object(
      'changed_fields',
      public.registry_changed_fields(tg_table_name, old_row, new_row)
    );
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
    actor_uuid,
    audit_action,
    tg_table_name,
    entity_uuid,
    audit_summary,
    public.audit_safe_snapshot(tg_table_name, old_row),
    public.audit_safe_snapshot(tg_table_name, new_row),
    audit_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_row_change() from public;
revoke all on function public.audit_row_change() from anon, authenticated;
