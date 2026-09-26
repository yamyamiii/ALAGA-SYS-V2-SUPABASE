begin;

create or replace function public.announcement_delete(
  p_id uuid,
  p_expected_version bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.announcements%rowtype;
begin
  perform public.assistance_require_role(
    array['admin']::public.app_role[]
  );

  if p_id is null
    or p_expected_version is null
    or p_expected_version < 1 then
    raise exception 'invalid announcement deletion request'
      using errcode = '22023';
  end if;

  select announcement.*
  into current_record
  from public.announcements as announcement
  where announcement.id = p_id
  for update;

  if not found then
    raise exception 'announcement not found' using errcode = 'P0002';
  end if;

  if current_record.archived_at is null then
    raise exception 'announcement must be archived before permanent deletion';
  end if;

  if current_record.version <> p_expected_version then
    raise exception 'announcement changed by another user';
  end if;

  -- These rows are operational notification artifacts, not the audit record.
  -- Match only trusted source metadata for the selected announcement.
  delete from public.assistance_notifications as notification
  where notification.source_type = 'announcements'
    and notification.source_id = p_id;

  perform public.assistance_audit(
    'announcement.deleted',
    'announcements',
    p_id,
    'Permanently deleted archived announcement',
    null
  );

  delete from public.announcements as announcement
  where announcement.id = p_id
    and announcement.version = p_expected_version
    and announcement.archived_at is not null;

  if not found then
    raise exception 'announcement changed by another user';
  end if;

  return true;
end;
$$;

revoke all on function public.announcement_delete(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.announcement_delete(uuid, bigint)
  to authenticated, service_role;

commit;
