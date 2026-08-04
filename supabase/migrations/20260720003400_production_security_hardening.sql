begin;

-- A linked resident identity is valid only while both the application account
-- and resident record are active. Keeping this check in the trusted helper
-- protects every RLS policy and RPC that consumes it, including older modules.
create or replace function public.current_resident_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.profiles as p
  join public.residents as r on r.linked_profile_id = p.id
  where p.id = auth.uid()
    and p.account_status = 'active'::public.account_status
    and p.role = 'resident'::public.app_role
    and r.status = 'active'::public.resident_status
    and r.archived_at is null
  limit 1
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.household_id
  from public.profiles as p
  join public.residents as r on r.linked_profile_id = p.id
  where p.id = auth.uid()
    and p.account_status = 'active'::public.account_status
    and p.role = 'resident'::public.app_role
    and r.status = 'active'::public.resident_status
    and r.archived_at is null
  limit 1
$$;

revoke all on function public.current_resident_id() from public, anon;
revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_resident_id() to authenticated;
grant execute on function public.current_household_id() to authenticated;

-- The own-profile SELECT policy intentionally remains self-only regardless of
-- status so the authentication layer can explain suspension or deactivation.
-- Profile mutation, resident data, and household data require an active role.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (
    id = auth.uid()
    and public.current_profile_role() is not null
  )
  with check (
    id = auth.uid()
    and public.current_profile_role() is not null
  );

drop policy if exists residents_select_own on public.residents;
create policy residents_select_own
  on public.residents for select to authenticated
  using (
    archived_at is null
    and id = public.current_resident_id()
  );

-- Notification preferences are security-definer RPCs because they read the
-- caller's verified Auth contact metadata. Explicitly reject profiles whose
-- active role lookup returns null before any preference row is read or written.
create or replace function public.notification_preferences_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  pref public.notification_preferences%rowtype;
  auth_record record;
  linked boolean;
begin
  if actor_id is null or actor_role is null then
    raise exception 'an active profile is required'
      using errcode = '42501';
  end if;
  insert into public.notification_preferences(profile_id) values (actor_id)
  on conflict(profile_id) do nothing;
  select * into pref from public.notification_preferences p
  where p.profile_id = actor_id;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at
  into auth_record from auth.users u where u.id = actor_id;
  linked := public.notification_recipient_eligible(actor_id);
  return jsonb_build_object(
    'in_app_enabled', pref.in_app_enabled,
    'email_enabled', pref.email_enabled,
    'sms_enabled', pref.sms_enabled,
    'appointment_updates_enabled', pref.appointment_updates_enabled,
    'appointment_reminders_enabled', pref.appointment_reminders_enabled,
    'announcement_enabled', pref.announcement_enabled,
    'inquiry_updates_enabled', pref.inquiry_updates_enabled,
    'maternal_child_reminders_enabled', pref.maternal_child_reminders_enabled,
    'document_updates_enabled', pref.document_updates_enabled,
    'locale', pref.locale::text,
    'version', pref.version,
    'email_contact_available', linked and auth_record.email_confirmed_at is not null
      and public.notification_normalize_email(auth_record.email) is not null,
    'email_destination', case when auth_record.email_confirmed_at is not null
      then public.notification_mask_email(auth_record.email) end,
    'sms_contact_available', linked and auth_record.phone_confirmed_at is not null
      and public.notification_normalize_ph_mobile(auth_record.phone) is not null,
    'sms_destination', case when auth_record.phone_confirmed_at is not null
      then public.notification_mask_mobile(auth_record.phone) end,
    'email_provider_configured', coalesce((select s.provider_configured
      from public.outbound_notification_channel_status s where s.channel = 'email'), false),
    'sms_provider_configured', coalesce((select s.provider_configured
      from public.outbound_notification_channel_status s where s.channel = 'sms'), false)
  );
end;
$$;

create or replace function public.notification_preferences_update(
  p_in_app_enabled boolean,
  p_email_enabled boolean,
  p_sms_enabled boolean,
  p_appointment_updates_enabled boolean,
  p_appointment_reminders_enabled boolean,
  p_announcement_enabled boolean,
  p_inquiry_updates_enabled boolean,
  p_maternal_child_reminders_enabled boolean,
  p_document_updates_enabled boolean,
  p_locale public.notification_locale,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  pref public.notification_preferences%rowtype;
  auth_record record;
  new_version bigint;
begin
  if actor_id is null or actor_role is null then
    raise exception 'an active profile is required'
      using errcode = '42501';
  end if;
  if p_in_app_enabled is null or p_email_enabled is null or p_sms_enabled is null
    or p_appointment_updates_enabled is null or p_appointment_reminders_enabled is null
    or p_announcement_enabled is null or p_inquiry_updates_enabled is null
    or p_maternal_child_reminders_enabled is null or p_document_updates_enabled is null
    or p_locale is null then raise exception 'invalid notification preferences'; end if;
  insert into public.notification_preferences(profile_id) values (actor_id)
  on conflict(profile_id) do nothing;
  select * into pref from public.notification_preferences p
  where p.profile_id = actor_id for update;
  if pref.version is distinct from p_expected_version then
    raise exception 'notification preferences changed in another session'
      using errcode = '40001';
  end if;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at
  into auth_record from auth.users u where u.id = actor_id;
  if p_email_enabled and (
    not public.notification_recipient_eligible(actor_id)
    or auth_record.email_confirmed_at is null
    or public.notification_normalize_email(auth_record.email) is null
  ) then raise exception 'verified email is unavailable' using errcode = '23514'; end if;
  if p_sms_enabled and (
    not public.notification_recipient_eligible(actor_id)
    or auth_record.phone_confirmed_at is null
    or public.notification_normalize_ph_mobile(auth_record.phone) is null
  ) then raise exception 'verified mobile number is unavailable' using errcode = '23514'; end if;
  update public.notification_preferences p set
    in_app_enabled = p_in_app_enabled, email_enabled = p_email_enabled,
    sms_enabled = p_sms_enabled,
    appointment_updates_enabled = p_appointment_updates_enabled,
    appointment_reminders_enabled = p_appointment_reminders_enabled,
    announcement_enabled = p_announcement_enabled,
    inquiry_updates_enabled = p_inquiry_updates_enabled,
    maternal_child_reminders_enabled = p_maternal_child_reminders_enabled,
    document_updates_enabled = p_document_updates_enabled,
    locale = p_locale, version = p.version + 1,
    updated_at = statement_timestamp()
  where p.profile_id = actor_id returning p.version into new_version;
  insert into public.audit_logs(
    actor_profile_id, action, entity_type, entity_id, summary, request_metadata
  ) values (
    actor_id, 'notification.preferences_updated', 'notification_preferences',
    actor_id, 'Updated own notification preferences',
    jsonb_build_object('channels_changed', true, 'content_included', false)
  );
  return new_version;
end;
$$;

revoke all on function public.notification_preferences_get() from public, anon;
revoke all on function public.notification_preferences_update(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  public.notification_locale,bigint
) from public, anon;
grant execute on function public.notification_preferences_get() to authenticated, service_role;
grant execute on function public.notification_preferences_update(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  public.notification_locale,bigint
) to authenticated, service_role;

-- Align declared volatility with actual behavior. The report validator is
-- read-only and is called by STABLE report functions. The two trusted account
-- lookups call assert_active_administrator(), which sets transaction-local
-- trusted context and therefore must remain VOLATILE.
alter function public.report_validate_scope(
  text,date,date,uuid,text,uuid
) stable;
alter function public.admin_list_resident_link_candidates(
  uuid,text,integer,integer
) volatile;
alter function public.admin_get_resident_account(uuid,uuid) volatile;

commit;
