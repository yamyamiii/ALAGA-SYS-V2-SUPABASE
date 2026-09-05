-- Restore the authenticated household picker without exposing the private
-- deployment resolver. The picker remains SECURITY INVOKER, so household and
-- resident RLS continue to control every returned row.

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

  -- This trusted context function performs the private canonical-barangay
  -- lookup as its owner and independently requires an active staff profile.
  select deployment_context.barangay_id
  into selected_barangay_id
  from public.registry_get_deployment_context() as deployment_context
  where deployment_context.purok_id = p_purok_id;

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
    nullif(
      concat_ws(' ', hr.first_name, hr.middle_name, hr.last_name, hr.suffix),
      ''
    ),
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

revoke all on function public.registry_search_households(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.registry_search_households(uuid, text, integer, integer)
  to authenticated, service_role;

