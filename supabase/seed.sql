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
values (
  '10000000-0000-4000-8000-000000000001',
  'Brgy. Bagongpook',
  'Sample Municipality',
  'Sample Province',
  true
)
on conflict (id) do update
set
  name = excluded.name,
  city_or_municipality = excluded.city_or_municipality,
  province = excluded.province,
  is_active = excluded.is_active;

insert into public.puroks (id, barangay_id, name, code, is_active)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Purok 1',
    'P01',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Purok 2',
    'P02',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Purok 3',
    'P03',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Purok 4',
    'P04',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Purok 5',
    'P05',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    'Purok 6',
    'P06',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    'Purok 7',
    'P07',
    true
  )
on conflict (id) do update
set
  barangay_id = excluded.barangay_id,
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active;

-- A Purok 8 row from an older development seed is retained but deactivated
-- only when no registry record references it.
update public.puroks as p
set is_active = false
where p.id = '20000000-0000-4000-8000-000000000008'
  and not exists (
    select 1 from public.households as h where h.purok_id = p.id
  )
  and not exists (
    select 1 from public.residents as r where r.purok_id = p.id
  );

commit;
