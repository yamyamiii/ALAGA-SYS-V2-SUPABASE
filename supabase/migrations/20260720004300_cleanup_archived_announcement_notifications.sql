begin;

-- Existing in-app notification rows are operational delivery artifacts.
-- Audit history remains in public.audit_logs and archived announcements remain
-- in public.announcements.
delete from public.assistance_notifications as notification
using public.announcements as announcement
where notification.source_type = 'announcements'
  and notification.source_id = announcement.id
  and announcement.archived_at is not null;

create or replace function public.announcement_archive(
  p_id uuid,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.announcements%rowtype;
  new_version bigint;
begin
  perform public.assistance_require_role(
    array['admin','barangay_health_worker']::public.app_role[]
  );

  select * into current_record
  from public.announcements
  where id = p_id
  for update;

  if not found then
    raise exception 'announcement not found' using errcode = 'P0002';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'announcement changed by another user';
  end if;

  if current_record.archived_at is null then
    update public.announcements
    set archived_at = pg_catalog.statement_timestamp(),
      updated_by = auth.uid(),
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
    where id = p_id
    returning version into new_version;

    perform public.assistance_audit(
      'announcement.archived',
      'announcements',
      p_id,
      'Archived announcement',
      null
    );
  end if;

  -- Remove only in-app rows linked through trusted announcement source
  -- metadata. Appointment, inquiry, document, and notifications for other
  -- announcements are unaffected.
  delete from public.assistance_notifications as notification
  where notification.source_type = 'announcements'
    and notification.source_id = p_id;

  return coalesce(new_version, current_record.version);
end;
$$;

revoke all on function public.announcement_archive(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.announcement_archive(uuid, bigint)
  to authenticated, service_role;

commit;
