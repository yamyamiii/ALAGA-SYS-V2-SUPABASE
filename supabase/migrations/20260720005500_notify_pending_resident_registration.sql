-- Notify every active Administrator once a Resident self-registration is both
-- pending and email-confirmed. The browser never chooses recipients or writes
-- notification rows.

begin;

create or replace function public.resident_registration_notify_administrators(
  p_registration_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  if not exists (
    select 1
    from public.resident_registration_requests as registration
    join auth.users as auth_user
      on auth_user.id = registration.profile_id
    join public.profiles as applicant
      on applicant.id = registration.profile_id
    where registration.id = p_registration_id
      and registration.status = 'pending'::public.resident_registration_status
      and auth_user.email_confirmed_at is not null
      and applicant.role = 'resident'::public.app_role
      and applicant.account_status = 'invited'::public.account_status
      and applicant.retired_at is null
  ) then
    return 0;
  end if;

  insert into public.assistance_notifications (
    recipient_profile_id,
    notification_type,
    title,
    summary,
    source_type,
    source_id,
    action_path,
    dedup_key,
    available_at
  )
  select
    administrator.id,
    'resident_registration_pending'::public.assistance_notification_type,
    'New Resident registration',
    'A new Resident registration is awaiting review.',
    'resident_registration',
    p_registration_id,
    '/user-management',
    'resident-registration:' || p_registration_id::text || ':pending-review',
    statement_timestamp()
  from public.profiles as administrator
  where administrator.role = 'admin'::public.app_role
    and administrator.account_status = 'active'::public.account_status
    and administrator.retired_at is null
  on conflict (recipient_profile_id, dedup_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.resident_registration_notify_administrators(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.resident_registration_notify_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.resident_registration_notify_administrators(new.id);
  return new;
end;
$$;

revoke all on function public.resident_registration_notify_after_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists resident_registration_notify_after_insert
  on public.resident_registration_requests;
create trigger resident_registration_notify_after_insert
  after insert on public.resident_registration_requests
  for each row execute function public.resident_registration_notify_after_insert();

create or replace function public.resident_registration_notify_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_id uuid;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select registration.id
    into registration_id
    from public.resident_registration_requests as registration
    where registration.profile_id = new.id
      and registration.status = 'pending'::public.resident_registration_status;

    if found then
      perform public.resident_registration_notify_administrators(registration_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.resident_registration_notify_after_confirmation()
  from public, anon, authenticated, service_role;

drop trigger if exists resident_registration_notify_after_confirmation
  on auth.users;
create trigger resident_registration_notify_after_confirmation
  after update of email_confirmed_at on auth.users
  for each row execute function public.resident_registration_notify_after_confirmation();

-- Backfill only registrations that are already actionable at deployment time.
-- The recipient/dedup unique constraint makes this safe to rerun.
do $$
declare
  registration record;
begin
  for registration in
    select request.id
    from public.resident_registration_requests as request
    join auth.users as auth_user on auth_user.id = request.profile_id
    where request.status = 'pending'::public.resident_registration_status
      and auth_user.email_confirmed_at is not null
  loop
    perform public.resident_registration_notify_administrators(registration.id);
  end loop;
end;
$$;

commit;
