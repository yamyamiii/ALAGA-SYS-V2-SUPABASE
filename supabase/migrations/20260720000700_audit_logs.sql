-- Append-only audit storage. Automatic triggers are installed later after the
-- safe-snapshot helper exists. Raw secrets and broad row payloads are excluded.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  old_values jsonb,
  new_values jsonb,
  request_metadata jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_format check (
    action ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  constraint audit_logs_entity_type_format check (
    entity_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint audit_logs_summary_length check (
    char_length(btrim(summary)) between 1 and 500
  ),
  constraint audit_logs_old_values_object check (
    old_values is null or jsonb_typeof(old_values) = 'object'
  ),
  constraint audit_logs_new_values_object check (
    new_values is null or jsonb_typeof(new_values) = 'object'
  ),
  constraint audit_logs_request_metadata_object check (
    request_metadata is null or jsonb_typeof(request_metadata) = 'object'
  )
);

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only; updates and deletes are prohibited';
end;
$$;

revoke all on function public.prevent_audit_log_mutation() from public;
revoke all on function public.prevent_audit_log_mutation() from anon, authenticated;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_log_mutation();
