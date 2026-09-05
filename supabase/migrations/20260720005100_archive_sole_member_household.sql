-- Resolve the sole-active-member household-head archive case atomically.
-- This narrowly scoped workflow is Administrator-only and preserves the
-- existing replacement-head requirement whenever another active member exists.

create or replace function public.registry_archive_sole_member_household(
  p_resident_id uuid,
  p_household_id uuid,
  p_expected_resident_updated_at timestamptz,
  p_expected_household_updated_at timestamptz
)
returns table (
  resident_id uuid,
  resident_status public.resident_status,
  resident_archived_at timestamptz,
  household_id uuid,
  household_status public.household_status,
  household_archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_resident public.residents%rowtype;
  v_household public.households%rowtype;
  v_active_member_count bigint;
begin
  select administrator.id
  into v_actor_id
  from public.profiles as administrator
  where administrator.id = auth.uid()
    and administrator.role = 'admin'::public.app_role
    and administrator.account_status = 'active'::public.account_status
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'active administrator permission is required';
  end if;

  if p_resident_id is null
    or p_household_id is null
    or p_expected_resident_updated_at is null
    or p_expected_household_updated_at is null then
    raise exception 'resident, household, and expected timestamps are required';
  end if;

  -- This is a rare administrative lifecycle operation. Serializing registry
  -- writes prevents a member from being added/activated between the sole-member
  -- check and household archival. The lock is released automatically at commit
  -- or rollback.
  lock table public.households, public.residents
    in share row exclusive mode;

  select r.*
  into v_resident
  from public.residents as r
  where r.id = p_resident_id
  for update;

  if not found then
    raise exception 'resident not found';
  end if;
  if v_resident.updated_at is distinct from p_expected_resident_updated_at then
    raise exception 'resident changed while you were editing it';
  end if;
  if v_resident.status <> 'active'::public.resident_status
    or v_resident.archived_at is not null then
    raise exception 'only an active resident can use the sole-member archive workflow';
  end if;
  if v_resident.household_id is distinct from p_household_id then
    raise exception 'resident household changed while you were editing it';
  end if;

  select h.*
  into v_household
  from public.households as h
  where h.id = p_household_id
  for update;

  if not found then
    raise exception 'household not found';
  end if;
  if v_household.updated_at is distinct from p_expected_household_updated_at then
    raise exception 'household changed while you were editing it';
  end if;
  if v_household.status <> 'active'::public.household_status
    or v_household.archived_at is not null then
    raise exception 'only an active household can use the sole-member archive workflow';
  end if;
  if v_household.head_resident_id is distinct from p_resident_id then
    raise exception 'resident is no longer the household head';
  end if;

  select count(*)
  into v_active_member_count
  from public.residents as member
  where member.household_id = p_household_id
    and member.status = 'active'::public.resident_status
    and member.archived_at is null;

  if v_active_member_count <> 1 then
    raise exception 'another active household member requires an explicit replacement head';
  end if;

  update public.households as target_household
  set
    head_resident_id = null,
    status = 'archived'::public.household_status
  where target_household.id = p_household_id
    and target_household.head_resident_id = p_resident_id
    and target_household.status = 'active'::public.household_status
    and target_household.archived_at is null
    and target_household.updated_at = p_expected_household_updated_at
  returning target_household.* into v_household;

  if not found then
    raise exception 'household changed while you were editing it';
  end if;

  update public.residents as target_resident
  set
    household_id = null,
    status = 'archived'::public.resident_status,
    updated_by = v_actor_id
  where target_resident.id = p_resident_id
    and target_resident.household_id = p_household_id
    and target_resident.status = 'active'::public.resident_status
    and target_resident.archived_at is null
    and target_resident.updated_at = p_expected_resident_updated_at
  returning target_resident.* into v_resident;

  if not found then
    raise exception 'resident changed while you were editing it';
  end if;

  if v_household.head_resident_id is not null
    or v_household.status <> 'archived'::public.household_status
    or v_household.archived_at is null
    or v_resident.household_id is not null
    or v_resident.status <> 'archived'::public.resident_status
    or v_resident.archived_at is null
    or exists (
      select 1
      from public.residents as remaining_member
      where remaining_member.household_id = p_household_id
        and remaining_member.status = 'active'::public.resident_status
        and remaining_member.archived_at is null
    ) then
    raise exception 'sole-member household archive did not reach a valid final state';
  end if;

  return query
  select
    v_resident.id,
    v_resident.status,
    v_resident.archived_at,
    v_household.id,
    v_household.status,
    v_household.archived_at;
end;
$$;

revoke all on function public.registry_archive_sole_member_household(
  uuid, uuid, timestamptz, timestamptz
) from public, anon;
grant execute on function public.registry_archive_sole_member_household(
  uuid, uuid, timestamptz, timestamptz
) to authenticated;

comment on function public.registry_archive_sole_member_household(
  uuid, uuid, timestamptz, timestamptz
) is
  'Atomically archives an active Administrator-verified sole-member household head and household; normal triggers retain audit and integrity enforcement.';
