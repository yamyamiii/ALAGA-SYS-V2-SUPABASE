-- Supabase exposes public-schema objects through API roles. Remove defaults,
-- then grant only operations that also have an explicit RLS policy.

revoke all on schema public from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.barangays to authenticated;
grant select, insert, update on table public.puroks to authenticated;
grant select, insert, update on table public.households to authenticated;
grant select, insert, update on table public.residents to authenticated;
grant select, insert, update on table public.appointments to authenticated;
grant select on table public.audit_logs to authenticated;

-- Policy helper functions are the only functions callable by normal clients.
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.current_resident_id() to authenticated;
grant execute on function public.current_household_id() to authenticated;

-- Trigger functions and number sequences remain inaccessible to browser roles.
-- service_role is server-side only and receives normal table privileges while
-- retaining its Supabase-managed RLS bypass capability.
grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.barangays to service_role;
grant select, insert, update on table public.puroks to service_role;
grant select, insert, update on table public.households to service_role;
grant select, insert, update on table public.residents to service_role;
grant select, insert, update on table public.appointments to service_role;
grant select, insert on table public.audit_logs to service_role;
grant usage on sequence public.resident_number_seq to service_role;
grant usage on sequence public.appointment_number_seq to service_role;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
