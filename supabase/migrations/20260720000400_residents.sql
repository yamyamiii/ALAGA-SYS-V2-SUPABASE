-- Resident numbers use a global sequence. The year is a display prefix; the
-- sequence never resets, so concurrent inserts cannot receive the same number.

create sequence public.resident_number_seq as bigint start with 1 increment by 1;

create or replace function public.set_resident_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.resident_number := format(
      'RES-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(nextval('public.resident_number_seq')::text, 6, '0')
    );
  elsif new.resident_number is distinct from old.resident_number then
    raise exception 'resident_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.set_resident_number() from public;
revoke all on function public.set_resident_number() from anon, authenticated;

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  resident_number text not null,
  linked_profile_id uuid references public.profiles (id) on delete set null,
  household_id uuid,
  barangay_id uuid not null references public.barangays (id) on delete restrict,
  purok_id uuid not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  date_of_birth date not null,
  sex public.sex_type not null,
  civil_status public.civil_status_type,
  blood_type text,
  nationality text,
  religion text,
  phone_number text,
  email text,
  occupation text,
  address_line text not null,
  philhealth_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  emergency_contact_relationship text,
  is_senior_citizen boolean not null default false,
  is_pwd boolean not null default false,
  pregnancy_status public.pregnancy_status_type,
  status public.resident_status not null default 'active',
  photo_path text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint residents_resident_number_unique unique (resident_number),
  constraint residents_resident_number_format check (
    resident_number ~ '^RES-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint residents_linked_profile_unique unique (linked_profile_id),
  constraint residents_name_lengths check (
    char_length(btrim(first_name)) between 1 and 100
    and char_length(btrim(last_name)) between 1 and 100
    and (middle_name is null or char_length(btrim(middle_name)) between 1 and 100)
    and (suffix is null or char_length(btrim(suffix)) between 1 and 30)
  ),
  constraint residents_date_of_birth_valid check (
    date_of_birth >= date '1900-01-01'
    and date_of_birth <= current_date
  ),
  constraint residents_blood_type_valid check (
    blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')
  ),
  constraint residents_email_length check (
    email is null or char_length(btrim(email)) between 3 and 254
  ),
  constraint residents_optional_demographic_lengths check (
    (nationality is null or char_length(btrim(nationality)) between 1 and 100)
    and (religion is null or char_length(btrim(religion)) between 1 and 100)
    and (occupation is null or char_length(btrim(occupation)) between 1 and 150)
  ),
  constraint residents_address_length check (
    char_length(btrim(address_line)) between 1 and 500
  ),
  constraint residents_phone_length check (
    phone_number is null or char_length(btrim(phone_number)) between 7 and 30
  ),
  constraint residents_philhealth_length check (
    philhealth_number is null or char_length(btrim(philhealth_number)) between 1 and 50
  ),
  constraint residents_emergency_contact_lengths check (
    (emergency_contact_name is null or char_length(btrim(emergency_contact_name)) between 1 and 200)
    and (emergency_contact_number is null or char_length(btrim(emergency_contact_number)) between 7 and 30)
    and (
      emergency_contact_relationship is null
      or char_length(btrim(emergency_contact_relationship)) between 1 and 100
    )
  ),
  constraint residents_photo_path_length check (
    photo_path is null or char_length(photo_path) <= 500
  ),
  constraint residents_pregnancy_applicability check (
    pregnancy_status is null or sex = 'female'
  ),
  constraint residents_archive_consistency check (
    (status in ('moved_out', 'deceased') and archived_at is not null)
    or (status in ('active', 'inactive') and archived_at is null)
  ),
  constraint residents_purok_belongs_to_barangay foreign key (purok_id, barangay_id)
    references public.puroks (id, barangay_id) on delete restrict,
  constraint residents_household_matches_location foreign key (
    household_id,
    barangay_id,
    purok_id
  ) references public.households (id, barangay_id, purok_id) on delete restrict,
  constraint residents_id_household_unique unique (id, household_id)
);

create trigger residents_set_number
  before insert or update on public.residents
  for each row execute function public.set_resident_number();
