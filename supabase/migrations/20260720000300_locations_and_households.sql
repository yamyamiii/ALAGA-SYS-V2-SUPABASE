-- Location reference data and households. The head-resident foreign key is
-- intentionally deferred until residents exists.

create table public.barangays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city_or_municipality text not null,
  province text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barangays_name_length check (char_length(btrim(name)) between 1 and 150),
  constraint barangays_locality_length check (
    char_length(btrim(city_or_municipality)) between 1 and 150
  ),
  constraint barangays_province_length check (
    char_length(btrim(province)) between 1 and 150
  )
);

create unique index barangays_locality_name_unique
  on public.barangays (
    lower(province),
    lower(city_or_municipality),
    lower(name)
  );

create table public.puroks (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays (id) on delete restrict,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint puroks_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint puroks_code_format check (
    code = upper(code)
    and code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'
  ),
  constraint puroks_id_barangay_unique unique (id, barangay_id)
);

create unique index puroks_barangay_name_unique
  on public.puroks (barangay_id, lower(name));
create unique index puroks_barangay_code_unique
  on public.puroks (barangay_id, lower(code));

create table public.households (
  id uuid primary key default gen_random_uuid(),
  household_number text not null,
  barangay_id uuid not null references public.barangays (id) on delete restrict,
  purok_id uuid not null,
  address_line text not null,
  latitude numeric(9, 6),
  longitude numeric(10, 6),
  head_resident_id uuid,
  status public.household_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint households_household_number_unique unique (household_number),
  constraint households_household_number_format check (
    household_number = upper(household_number)
    and household_number ~ '^HH-[A-Z0-9][A-Z0-9-]{2,29}$'
  ),
  constraint households_address_length check (
    char_length(btrim(address_line)) between 1 and 500
  ),
  constraint households_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint households_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  constraint households_archive_consistency check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  ),
  constraint households_purok_belongs_to_barangay foreign key (purok_id, barangay_id)
    references public.puroks (id, barangay_id) on delete restrict,
  constraint households_id_location_unique unique (id, barangay_id, purok_id)
);
