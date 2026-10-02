-- Restore a durable registry identity, never a retired portal account.
-- Existing number, audit, archive-state and realtime triggers remain intact.
create or replace function public.guard_resident_registry_restore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is null then
    if not exists (
      select 1 from public.profiles as actor
      where actor.id = auth.uid() and actor.role = 'admin'::public.app_role
        and actor.account_status = 'active'::public.account_status
        and actor.retired_at is null
    ) then
      raise exception 'Resident restoration requires an active Administrator'
        using errcode = '42501';
    end if;
    -- Fail closed for ANY remaining portal link, including a stale link.
    -- Migration 101 releases proven retired links; restoration never steals,
    -- clears or reactivates a linked profile.
    if old.linked_profile_id is not null or new.linked_profile_id is not null then
      raise exception 'Resident restoration has an existing portal link'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_resident_registry_restore()
  from public, anon, authenticated, service_role;

-- Run after residents_set_archive_state, so derived archived_at is authoritative.
create trigger residents_validate_registry_restore
  before update of status, archived_at on public.residents
  for each row execute function public.guard_resident_registry_restore();

create or replace function public.registry_restore_resident(
  p_resident_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  id uuid,
  resident_number text,
  status public.resident_status,
  archived_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_resident public.residents%rowtype;
begin
  -- Lock the actor against concurrent suspension/retirement before authorizing.
  perform actor.id from public.profiles as actor
  where actor.id = v_actor_id and actor.role = 'admin'::public.app_role
    and actor.account_status = 'active'::public.account_status
    and actor.retired_at is null
  for share;
  if not found then
    raise exception 'Resident restoration requires an active Administrator'
      using errcode = '42501';
  end if;

  select resident.* into v_resident from public.residents as resident
  where resident.id = p_resident_id for update;
  if not found then
    raise exception 'Resident restoration record not found' using errcode = 'P0002';
  end if;
  if v_resident.status <> 'archived'::public.resident_status
    or v_resident.archived_at is null then
    raise exception 'Resident restoration requires an archived record'
      using errcode = '23514';
  end if;
  if p_expected_updated_at is null
    or v_resident.updated_at is distinct from p_expected_updated_at then
    raise exception 'Resident restoration record changed; refresh and retry'
      using errcode = '40001';
  end if;
  if v_resident.linked_profile_id is not null then
    raise exception 'Resident restoration has an existing portal link'
      using errcode = '23514';
  end if;

  -- Only registry lifecycle changes. No profile/auth writes, link changes,
  -- inserts, sequence resets or dependent-history mutations.
  return query
  update public.residents as restored
  set status = 'active'::public.resident_status, updated_by = v_actor_id
  where restored.id = v_resident.id
  returning restored.id, restored.resident_number::text, restored.status,
    restored.archived_at, restored.updated_at;
end;
$$;

revoke all on function public.registry_restore_resident(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.registry_restore_resident(uuid, timestamptz)
  to authenticated;

comment on function public.registry_restore_resident(uuid, timestamptz) is
  'Active Administrator only: restore an archived, unlinked Resident identity with optimistic concurrency, without restoring portal access or changing protected history.';
