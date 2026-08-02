-- Phase 9A: privacy-minimized, service-only rate limiting for the ALAGA AI
-- Edge Function. Conversation content and model output are never stored here.

begin;

create table public.ai_request_rate_limits (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint ai_request_rate_limits_request_count_positive
    check (request_count > 0)
);

alter table public.ai_request_rate_limits enable row level security;
revoke all on table public.ai_request_rate_limits
  from public, anon, authenticated;

create or replace function public.consume_ai_request_rate_limit(
  p_profile_id uuid,
  p_max_requests integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz := pg_catalog.date_trunc(
    'hour',
    pg_catalog.statement_timestamp() at time zone 'UTC'
  ) at time zone 'UTC';
  v_request_count integer;
begin
  if p_profile_id is null or p_max_requests not between 1 and 100 then
    raise exception 'invalid AI rate limit configuration'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles as p
    where p.id = p_profile_id
      and p.account_status = 'active'::public.account_status
      and p.role in (
        'admin'::public.app_role,
        'barangay_health_worker'::public.app_role,
        'nurse'::public.app_role,
        'midwife'::public.app_role,
        'resident'::public.app_role
      )
  ) then
    raise exception 'active supported profile required for AI rate limiting'
      using errcode = '42501';
  end if;

  insert into public.ai_request_rate_limits as rate_limit (
    profile_id,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_profile_id,
    v_window_started_at,
    1,
    pg_catalog.statement_timestamp()
  )
  on conflict (profile_id) do update
  set window_started_at = case
        when rate_limit.window_started_at < v_window_started_at
          then v_window_started_at
        else rate_limit.window_started_at
      end,
      request_count = case
        when rate_limit.window_started_at < v_window_started_at then 1
        else pg_catalog.least(rate_limit.request_count + 1, p_max_requests + 1)
      end,
      updated_at = pg_catalog.statement_timestamp()
  returning rate_limit.request_count into v_request_count;

  return query
  select
    v_request_count <= p_max_requests,
    pg_catalog.greatest(p_max_requests - v_request_count, 0),
    case
      when v_request_count <= p_max_requests then 0
      else pg_catalog.greatest(
        1,
        pg_catalog.ceil(
          pg_catalog.extract(
            epoch from (
              v_window_started_at + interval '1 hour'
              - pg_catalog.statement_timestamp()
            )
          )
        )::integer
      )
    end;
end;
$$;

revoke all on function public.consume_ai_request_rate_limit(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_request_rate_limit(uuid, integer)
  to service_role;

commit;
