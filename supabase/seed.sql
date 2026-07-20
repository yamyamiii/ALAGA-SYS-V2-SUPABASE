-- DEVELOPMENT ONLY: synthetic Bagongpook-shaped reference data for verification.
-- No Auth users, residents, households, contact details, or healthcare data.

begin;

insert into public.barangays (
  id,
  name,
  city_or_municipality,
  province,
  is_active
)
select
  '10000000-0000-4000-8000-000000000001',
  'Brgy. Bagongpook',
  'Lipa City',
  'Batangas',
  true
where not exists (
  select 1
  from public.barangays as existing
  where regexp_replace(
    regexp_replace(
      lower(btrim(existing.name)),
      '^(brgy\.?|barangay)\s+',
      ''
    ),
    '\s+',
    '',
    'g'
  ) = 'bagongpook'
)
on conflict (id) do update
set
  name = excluded.name,
  city_or_municipality = excluded.city_or_municipality,
  province = excluded.province,
  is_active = excluded.is_active;

with deployment as (
  select public.deployment_barangay_id() as barangay_id
), desired (id, name, code, is_active) as (
  values
  (
    '20000000-0000-4000-8000-000000000001',
    'Purok 1',
    'P01',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Purok 2',
    'P02',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Purok 3',
    'P03',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'Purok 4',
    'P04',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'Purok 5',
    'P05',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    'Purok 6',
    'P06',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    'Purok 7',
    'P07',
    true
  )
)
insert into public.puroks (id, barangay_id, name, code, is_active)
select
  desired.id::uuid,
  deployment.barangay_id,
  desired.name,
  desired.code,
  desired.is_active
from desired
cross join deployment
where not exists (
  select 1
  from public.puroks as existing
  where existing.barangay_id = deployment.barangay_id
    and (
      lower(existing.name) = lower(desired.name)
      or lower(existing.code) = lower(desired.code)
    )
)
on conflict (id) do update
set
  barangay_id = excluded.barangay_id,
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active;

-- Purok 8 remains a valid historical reference but is never selectable.
update public.puroks as p
set is_active = false
where p.barangay_id = public.deployment_barangay_id()
  and (
    regexp_replace(lower(btrim(p.name)), '^purok\s*', '') = '8'
    or upper(btrim(p.code)) in ('P08', 'P8')
  );

commit;
