-- DEVELOPMENT ONLY: fictional reference data for local/staging verification.
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
  'Barangay Masigla (Fictional)',
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
    'Purok Sampaguita',
    'P01',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Purok Narra',
    'P02',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Purok Anahaw',
    'P03',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Purok Banaba',
    'P04',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Purok Ilang-Ilang',
    'P05',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    'Purok Molave',
    'P06',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    'Purok Kamagong',
    'P07',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000001',
    'Purok Rosal',
    'P08',
    true
  )
on conflict (id) do update
set
  barangay_id = excluded.barangay_id,
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active;

commit;
