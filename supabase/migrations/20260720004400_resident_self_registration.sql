-- Safe public Resident self-registration. Public Auth signup can create only
-- an invited Resident profile; an active linked Resident record is created or
-- selected only through the Administrator review workflow below.

create type public.resident_registration_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.resident_registration_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date not null,
  sex public.sex_type not null,
  purok_id uuid not null references public.puroks (id) on delete restrict,
  address_line text,
  phone_number text,
  status public.resident_registration_status not null default 'pending',
  resident_id uuid references public.residents (id) on delete restrict,
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  constraint resident_registration_name_lengths check (
    char_length(btrim(first_name)) between 1 and 100
    and char_length(btrim(last_name)) between 1 and 100
    and (middle_name is null or char_length(btrim(middle_name)) between 1 and 100)
  ),
  constraint resident_registration_birth_date_valid check (
    date_of_birth >= date '1900-01-01'
    and date_of_birth <= (current_timestamp at time zone 'Asia/Manila')::date
  ),
  constraint resident_registration_address_length check (
    address_line is null or char_length(btrim(address_line)) between 1 and 500
  ),
  constraint resident_registration_phone_length check (
    phone_number is null
    or (
      char_length(btrim(phone_number)) between 7 and 30
      and phone_number ~ '^[+0-9().[:space:]-]+$'
    )
  ),
  constraint resident_registration_review_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and resident_id is null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and resident_id is null)
    or (status = 'approved' and reviewed_by is not null and reviewed_at is not null and resident_id is not null)
  ),
  constraint resident_registration_version_positive check (version > 0)
);

create index resident_registration_status_submitted_idx
  on public.resident_registration_requests (status, submitted_at asc);

alter table public.resident_registration_requests enable row level security;

create policy resident_registration_select_own
  on public.resident_registration_requests for select to authenticated
  using (profile_id = auth.uid());

revoke all on table public.resident_registration_requests
  from public, anon, authenticated;
grant select on table public.resident_registration_requests to authenticated;
grant select on table public.resident_registration_requests to service_role;

-- This public RPC returns only the seven safe deployment reference options.
-- It fails closed if the canonical locality is missing, duplicated, or invalid.
create or replace function public.resident_registration_localities()
returns table (
  purok_id uuid,
  purok_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  deployment_barangay_id uuid;
  deployment_count integer;
  valid_purok_count integer;
begin
  select count(*)::integer, (array_agg(b.id order by b.id))[1]
  into deployment_count, deployment_barangay_id
  from public.barangays as b
  where lower(btrim(b.name)) = lower('Brgy. Bagongpook')
    and lower(btrim(b.city_or_municipality)) = lower('Lipa City')
    and lower(btrim(b.province)) = lower('Batangas')
    and b.is_active;

  if deployment_count <> 1 then
    raise exception 'Brgy. Bagongpook deployment reference is unavailable'
      using errcode = 'P0001';
  end if;

  select count(*)::integer into valid_purok_count
  from public.puroks as p
  where p.barangay_id = deployment_barangay_id
    and p.is_active
    and p.name in (
      'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4',
      'Purok 5', 'Purok 6', 'Purok 7'
    );

  if valid_purok_count <> 7
    or exists (
      select 1
      from public.puroks as p
      where p.barangay_id = deployment_barangay_id
        and p.is_active
        and p.name not in (
          'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4',
          'Purok 5', 'Purok 6', 'Purok 7'
        )
    ) then
    raise exception 'Brgy. Bagongpook must have exactly seven active puroks'
      using errcode = 'P0001';
  end if;

  return query
  select p.id, p.name::text
  from public.puroks as p
  where p.barangay_id = deployment_barangay_id
    and p.is_active
  order by p.code;
end;
$$;

revoke all on function public.resident_registration_localities() from public;
grant usage on schema public to anon;
grant execute on function public.resident_registration_localities()
  to anon, authenticated, service_role;

-- Only Auth users explicitly created through the Resident registration form
-- are captured. Role, account status, barangay, and resident number are never
-- accepted from browser metadata.
create or replace function public.capture_resident_self_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_first_name text;
  requested_middle_name text;
  requested_last_name text;
  requested_address text;
  requested_phone text;
  requested_birth_date date;
  requested_sex public.sex_type;
  requested_purok_id uuid;
  deployment_barangay_id uuid;
  deployment_count integer;
begin
  if coalesce(new.raw_user_meta_data ->> 'registration_kind', '')
    <> 'resident_self_registration' then
    return new;
  end if;

  requested_first_name := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  requested_middle_name := nullif(btrim(new.raw_user_meta_data ->> 'middle_name'), '');
  requested_last_name := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  requested_address := nullif(btrim(new.raw_user_meta_data ->> 'address_line'), '');
  requested_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '');

  if requested_first_name is null or char_length(requested_first_name) > 100
    or requested_last_name is null or char_length(requested_last_name) > 100
    or char_length(requested_middle_name) > 100
    or char_length(requested_address) > 500
    or (
      requested_phone is not null
      and (
        char_length(requested_phone) not between 7 and 30
        or requested_phone !~ '^[+0-9().[:space:]-]+$'
      )
    ) then
    raise exception 'Resident registration contains invalid profile data'
      using errcode = '22023';
  end if;

  begin
    requested_birth_date := (new.raw_user_meta_data ->> 'date_of_birth')::date;
    requested_sex := (new.raw_user_meta_data ->> 'sex')::public.sex_type;
    requested_purok_id := (new.raw_user_meta_data ->> 'purok_id')::uuid;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'Resident registration contains invalid demographic data'
        using errcode = '22023';
  end;

  if requested_birth_date < date '1900-01-01'
    or requested_birth_date > (current_timestamp at time zone 'Asia/Manila')::date then
    raise exception 'Resident registration birth date is invalid'
      using errcode = '22023';
  end if;

  select count(*)::integer, (array_agg(b.id order by b.id))[1]
  into deployment_count, deployment_barangay_id
  from public.barangays as b
  where lower(btrim(b.name)) = lower('Brgy. Bagongpook')
    and lower(btrim(b.city_or_municipality)) = lower('Lipa City')
    and lower(btrim(b.province)) = lower('Batangas')
    and b.is_active;

  if deployment_count <> 1 or not exists (
    select 1
    from public.puroks as p
    where p.id = requested_purok_id
      and p.barangay_id = deployment_barangay_id
      and p.is_active
      and p.name in (
        'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4',
        'Purok 5', 'Purok 6', 'Purok 7'
      )
  ) then
    raise exception 'Resident registration locality is invalid'
      using errcode = '22023';
  end if;

  insert into public.resident_registration_requests (
    profile_id,
    first_name,
    middle_name,
    last_name,
    date_of_birth,
    sex,
    purok_id,
    address_line,
    phone_number
  )
  values (
    new.id,
    requested_first_name,
    requested_middle_name,
    requested_last_name,
    requested_birth_date,
    requested_sex,
    requested_purok_id,
    requested_address,
    requested_phone
  );

  return new;
end;
$$;

revoke all on function public.capture_resident_self_registration()
  from public, anon, authenticated;

create trigger zz_auth_capture_resident_registration
  after insert on auth.users
  for each row execute function public.capture_resident_self_registration();

-- A self-registered profile can never be promoted into a staff role. It also
-- cannot become active until the trusted approval RPC marks its request as
-- approved in the same transaction.
create or replace function public.protect_self_registered_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  registration_status public.resident_registration_status;
begin
  select rr.status into registration_status
  from public.resident_registration_requests as rr
  where rr.profile_id = new.id;

  if not found then return new; end if;

  if new.role <> 'resident'::public.app_role then
    raise exception 'self-registered accounts must retain the Resident role'
      using errcode = '42501';
  end if;

  if new.account_status = 'active'::public.account_status
    and registration_status <> 'approved'::public.resident_registration_status then
    raise exception 'resident registration approval is required before activation'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_self_registered_profile()
  from public, anon, authenticated;

create trigger profiles_protect_self_registration
  before update of role, account_status on public.profiles
  for each row execute function public.protect_self_registered_profile();

create or replace function public.admin_list_resident_registrations(
  p_actor_id uuid,
  p_status public.resident_registration_status default 'pending',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  profile_id uuid,
  email text,
  first_name text,
  middle_name text,
  last_name text,
  date_of_birth date,
  sex public.sex_type,
  purok_id uuid,
  purok_name text,
  address_line text,
  phone_number text,
  registration_status public.resident_registration_status,
  resident_id uuid,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  version integer,
  possible_matches jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_administrator(p_actor_id);

  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid registration pagination' using errcode = '22023';
  end if;

  return query
  select
    rr.id,
    rr.profile_id,
    u.email::text,
    rr.first_name,
    rr.middle_name,
    rr.last_name,
    rr.date_of_birth,
    rr.sex,
    rr.purok_id,
    p.name::text,
    rr.address_line,
    rr.phone_number,
    rr.status,
    rr.resident_id,
    rr.submitted_at,
    rr.reviewed_at,
    rr.version,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'resident_number', candidate.resident_number,
            'first_name', candidate.first_name,
            'middle_name', candidate.middle_name,
            'last_name', candidate.last_name,
            'date_of_birth', candidate.date_of_birth,
            'sex', candidate.sex,
            'status', candidate.status,
            'archived_at', candidate.archived_at,
            'linked_profile_id', candidate.linked_profile_id,
            'purok_name', candidate_purok.name
          )
          order by candidate.resident_number
        )
        from public.residents as candidate
        join public.puroks as candidate_purok on candidate_purok.id = candidate.purok_id
        where lower(btrim(candidate.first_name)) = lower(btrim(rr.first_name))
          and lower(btrim(candidate.last_name)) = lower(btrim(rr.last_name))
          and candidate.date_of_birth = rr.date_of_birth
      ),
      '[]'::jsonb
    ),
    count(*) over ()
  from public.resident_registration_requests as rr
  join auth.users as u on u.id = rr.profile_id
  join public.puroks as p on p.id = rr.purok_id
  where p_status is null or rr.status = p_status
  order by rr.submitted_at asc, rr.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_list_resident_registrations(
  uuid, public.resident_registration_status, integer, integer
) from public, anon, authenticated;

create or replace function public.admin_approve_resident_registration(
  p_actor_id uuid,
  p_registration_id uuid,
  p_existing_resident_id uuid default null,
  p_expected_version integer default 1
)
returns table (
  resident_id uuid,
  resident_number text,
  linked_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.resident_registration_requests%rowtype;
  selected_resident public.residents%rowtype;
  auth_email text;
  deployment_barangay_id uuid;
begin
  perform public.assert_active_administrator(p_actor_id);

  select * into request_record
  from public.resident_registration_requests as rr
  where rr.id = p_registration_id
  for update;

  if not found then raise exception 'resident registration was not found'; end if;
  if request_record.status <> 'pending'::public.resident_registration_status then
    raise exception 'resident registration is no longer pending';
  end if;
  if request_record.version <> p_expected_version then
    raise exception 'resident registration was changed by another administrator';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = request_record.profile_id
      and profile.role = 'resident'::public.app_role
      and profile.account_status = 'invited'::public.account_status
  ) then
    raise exception 'resident registration profile is not eligible for approval';
  end if;

  if exists (
    select 1 from public.residents as linked
    where linked.linked_profile_id = request_record.profile_id
  ) then
    raise exception 'resident registration profile is already linked';
  end if;

  select u.email::text into auth_email
  from auth.users as u
  where u.id = request_record.profile_id;

  select p.barangay_id into deployment_barangay_id
  from public.puroks as p
  join public.barangays as b on b.id = p.barangay_id
  where p.id = request_record.purok_id
    and p.is_active
    and b.is_active
    and lower(btrim(b.name)) = lower('Brgy. Bagongpook')
    and lower(btrim(b.city_or_municipality)) = lower('Lipa City')
    and lower(btrim(b.province)) = lower('Batangas');

  if deployment_barangay_id is null then
    raise exception 'resident registration locality is no longer active';
  end if;

  if p_existing_resident_id is not null then
    select * into selected_resident
    from public.residents as resident
    where resident.id = p_existing_resident_id
    for update;

    if not found then raise exception 'selected resident was not found'; end if;
    if selected_resident.status <> 'active'::public.resident_status
      or selected_resident.archived_at is not null then
      raise exception 'selected resident is not active';
    end if;
    if selected_resident.linked_profile_id is not null then
      raise exception 'selected resident already has a portal account';
    end if;
    if lower(btrim(selected_resident.first_name)) <> lower(btrim(request_record.first_name))
      or lower(btrim(selected_resident.last_name)) <> lower(btrim(request_record.last_name))
      or selected_resident.date_of_birth <> request_record.date_of_birth
      or selected_resident.sex <> request_record.sex then
      raise exception 'selected resident does not match the registration identity';
    end if;

    update public.residents
    set linked_profile_id = request_record.profile_id,
        updated_by = p_actor_id
    where id = selected_resident.id
    returning * into selected_resident;
  else
    if exists (
      select 1
      from public.residents as candidate
      where lower(btrim(candidate.first_name)) = lower(btrim(request_record.first_name))
        and lower(btrim(candidate.last_name)) = lower(btrim(request_record.last_name))
        and candidate.date_of_birth = request_record.date_of_birth
    ) then
      raise exception 'possible resident match requires explicit linkage review'
        using errcode = '23505';
    end if;

    insert into public.residents (
      linked_profile_id,
      household_id,
      barangay_id,
      purok_id,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      sex,
      phone_number,
      email,
      address_line,
      status,
      created_by,
      updated_by
    )
    values (
      request_record.profile_id,
      null,
      deployment_barangay_id,
      request_record.purok_id,
      request_record.first_name,
      request_record.middle_name,
      request_record.last_name,
      request_record.date_of_birth,
      request_record.sex,
      request_record.phone_number,
      auth_email,
      request_record.address_line,
      'active'::public.resident_status,
      p_actor_id,
      p_actor_id
    )
    returning * into selected_resident;
  end if;

  update public.resident_registration_requests
  set status = 'approved'::public.resident_registration_status,
      resident_id = selected_resident.id,
      reviewed_by = p_actor_id,
      reviewed_at = statement_timestamp(),
      updated_at = statement_timestamp(),
      version = version + 1
  where id = request_record.id;

  update public.profiles
  set role = 'resident'::public.app_role,
      account_status = 'active'::public.account_status,
      first_name = request_record.first_name,
      middle_name = request_record.middle_name,
      last_name = request_record.last_name,
      phone_number = request_record.phone_number,
      status_changed_at = statement_timestamp()
  where id = request_record.profile_id;

  perform public.record_user_management_audit(
    p_actor_id,
    request_record.profile_id,
    'resident.registration_approved',
    'Administrator approved a Resident self-registration',
    jsonb_build_object('registration_status', 'pending'),
    jsonb_build_object(
      'registration_status', 'approved',
      'resident_id', selected_resident.id,
      'linked_existing', p_existing_resident_id is not null
    )
  );

  return query
  select selected_resident.id, selected_resident.resident_number::text,
    p_existing_resident_id is not null;
end;
$$;

revoke all on function public.admin_approve_resident_registration(
  uuid, uuid, uuid, integer
) from public, anon, authenticated;

create or replace function public.admin_reject_resident_registration(
  p_actor_id uuid,
  p_registration_id uuid,
  p_expected_version integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.resident_registration_requests%rowtype;
begin
  perform public.assert_active_administrator(p_actor_id);

  select * into request_record
  from public.resident_registration_requests as rr
  where rr.id = p_registration_id
  for update;

  if not found then raise exception 'resident registration was not found'; end if;
  if request_record.status <> 'pending'::public.resident_registration_status then
    raise exception 'resident registration is no longer pending';
  end if;
  if request_record.version <> p_expected_version then
    raise exception 'resident registration was changed by another administrator';
  end if;

  update public.resident_registration_requests
  set status = 'rejected'::public.resident_registration_status,
      reviewed_by = p_actor_id,
      reviewed_at = statement_timestamp(),
      updated_at = statement_timestamp(),
      version = version + 1
  where id = request_record.id;

  perform public.record_user_management_audit(
    p_actor_id,
    request_record.profile_id,
    'resident.registration_rejected',
    'Administrator rejected a Resident self-registration',
    jsonb_build_object('registration_status', 'pending'),
    jsonb_build_object('registration_status', 'rejected')
  );
end;
$$;

revoke all on function public.admin_reject_resident_registration(
  uuid, uuid, integer
) from public, anon, authenticated;

grant execute on function public.admin_list_resident_registrations(
  uuid, public.resident_registration_status, integer, integer
) to service_role;
grant execute on function public.admin_approve_resident_registration(
  uuid, uuid, uuid, integer
) to service_role;
grant execute on function public.admin_reject_resident_registration(
  uuid, uuid, integer
) to service_role;
