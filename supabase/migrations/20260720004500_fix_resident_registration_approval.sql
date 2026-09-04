-- Migration 44's approval RPC inserts or updates a Resident with a linked
-- profile, but the existing registry hardening trigger permits that security
-- boundary only while the transaction-local trusted-link flag is enabled.
-- Keep the guard intact and enable it only inside the already Administrator-
-- authorized, service-role-only approval transaction.

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

  -- This setting is transaction-local and is reached only after the active
  -- Administrator, pending version, eligible profile, and locality checks.
  perform set_config('app.trusted_resident_linking', 'on', true);

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

grant execute on function public.admin_approve_resident_registration(
  uuid, uuid, uuid, integer
) to service_role;
