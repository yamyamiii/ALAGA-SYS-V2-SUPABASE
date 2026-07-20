-- Single-barangay deployment guard for Brgy. Bagongpook.
-- Barangay UUIDs remain database data and are never hard-coded in the browser.

-- Deactivate any legacy Purok 8 reference only when it has no household or
-- resident references. Referenced rows are deliberately preserved unchanged.
update public.puroks as p
set is_active = false
where (
    regexp_replace(lower(btrim(p.name)), '^purok\s*', '') = '8'
    or upper(btrim(p.code)) in ('P08', 'P8')
  )
  and p.is_active
  and not exists (
    select 1 from public.households as h where h.purok_id = p.id
  )
  and not exists (
    select 1 from public.residents as r where r.purok_id = p.id
  );

create or replace function public.deployment_barangay_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matching_ids uuid[];
  selected_id uuid;
  selected_active boolean;
begin
  select array_agg(b.id order by b.id)
  into matching_ids
  from public.barangays as b
  where regexp_replace(
    lower(btrim(b.name)),
    '^(brgy\.?|barangay)\s+',
    ''
  ) = 'bagongpook';

  if coalesce(cardinality(matching_ids), 0) = 0 then
    raise exception 'Brgy. Bagongpook reference record is missing';
  end if;

  if cardinality(matching_ids) > 1 then
    raise exception 'Brgy. Bagongpook reference record is duplicated';
  end if;

  selected_id := matching_ids[1];

  select b.is_active
  into selected_active
  from public.barangays as b
  where b.id = selected_id;

  if not selected_active then
    raise exception 'Brgy. Bagongpook reference record is inactive';
  end if;

  return selected_id;
end;
$$;

revoke all on function public.deployment_barangay_id() from public;
revoke all on function public.deployment_barangay_id() from anon, authenticated;

create or replace function public.registry_get_deployment_context()
returns table (
  barangay_id uuid,
  barangay_name text,
  purok_id uuid,
  purok_name text,
  purok_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_barangay_id uuid;
  expected_count integer;
  expected_distinct_count integer;
  active_count integer;
begin
  if not public.is_staff() then
    raise exception 'active staff access is required for registry deployment context';
  end if;

  selected_barangay_id := public.deployment_barangay_id();

  select
    count(*) filter (
      where regexp_replace(lower(btrim(p.name)), '^purok\s*', '')
        in ('1', '2', '3', '4', '5', '6', '7')
    ),
    count(distinct regexp_replace(lower(btrim(p.name)), '^purok\s*', ''))
      filter (
        where regexp_replace(lower(btrim(p.name)), '^purok\s*', '')
          in ('1', '2', '3', '4', '5', '6', '7')
      ),
    count(*) filter (where p.is_active)
  into expected_count, expected_distinct_count, active_count
  from public.puroks as p
  where p.barangay_id = selected_barangay_id;

  if expected_count <> 7
    or expected_distinct_count <> 7
    or active_count <> 7
    or exists (
    select 1
    from public.puroks as p
    where p.barangay_id = selected_barangay_id
      and p.is_active
      and regexp_replace(lower(btrim(p.name)), '^purok\s*', '')
        not in ('1', '2', '3', '4', '5', '6', '7')
  ) or exists (
    select 1
    from public.puroks as p
    where p.barangay_id = selected_barangay_id
      and not p.is_active
      and regexp_replace(lower(btrim(p.name)), '^purok\s*', '')
        in ('1', '2', '3', '4', '5', '6', '7')
  ) then
    raise exception 'Brgy. Bagongpook must have exactly seven active puroks named Purok 1 through Purok 7';
  end if;

  return query
  select
    b.id,
    b.name,
    p.id,
    p.name,
    p.code
  from public.barangays as b
  join public.puroks as p on p.barangay_id = b.id
  where b.id = selected_barangay_id
    and p.is_active
    and regexp_replace(lower(btrim(p.name)), '^purok\s*', '')
      in ('1', '2', '3', '4', '5', '6', '7')
  order by regexp_replace(lower(btrim(p.name)), '^purok\s*', '')::integer;
end;
$$;

revoke all on function public.registry_get_deployment_context() from public;
revoke all on function public.registry_get_deployment_context() from anon;
grant execute on function public.registry_get_deployment_context()
  to authenticated, service_role;

-- The database derives barangay_id from the selected canonical purok. A client
-- cannot redirect a registry write by supplying a different barangay UUID.
create or replace function public.apply_deployment_registry_locality()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_barangay_id uuid;
  selected_purok_active boolean;
  expected_barangay_id uuid;
  selected_purok_name text;
begin
  select p.barangay_id, p.is_active, p.name
  into selected_barangay_id, selected_purok_active, selected_purok_name
  from public.puroks as p
  where p.id = new.purok_id;

  if selected_barangay_id is null then
    raise exception 'selected purok does not exist';
  end if;

  expected_barangay_id := public.deployment_barangay_id();

  if not selected_purok_active
    or selected_barangay_id <> expected_barangay_id
    or regexp_replace(lower(btrim(selected_purok_name)), '^purok\s*', '')
      not in ('1', '2', '3', '4', '5', '6', '7') then
    raise exception 'selected purok is not an active Brgy. Bagongpook deployment purok';
  end if;

  new.barangay_id := selected_barangay_id;
  return new;
end;
$$;

revoke all on function public.apply_deployment_registry_locality() from public;
revoke all on function public.apply_deployment_registry_locality()
  from anon, authenticated;

create trigger households_apply_deployment_locality
  before insert or update of barangay_id, purok_id on public.households
  for each row execute function public.apply_deployment_registry_locality();

create trigger residents_apply_deployment_locality
  before insert or update of barangay_id, purok_id on public.residents
  for each row execute function public.apply_deployment_registry_locality();
