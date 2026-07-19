-- Every public table is private by default. Policies are intentionally
-- restrictive until Phase 2 implements authenticated role workflows.

alter table public.profiles enable row level security;
alter table public.barangays enable row level security;
alter table public.puroks enable row level security;
alter table public.households enable row level security;
alter table public.residents enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users see and edit their own row; active staff can resolve staff
-- identities for scheduling; admins can read/update other profiles. The profile
-- protection trigger prevents self-promotion and self-status changes.
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_select_staff
  on public.profiles for select to authenticated
  using (public.is_staff());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Active reference data is readable to signed-in users. Only active admins may
-- insert or update. There are deliberately no client delete policies.
create policy barangays_select_active
  on public.barangays for select to authenticated
  using (is_active);

create policy barangays_select_admin
  on public.barangays for select to authenticated
  using (public.is_admin());

create policy barangays_insert_admin
  on public.barangays for insert to authenticated
  with check (public.is_admin());

create policy barangays_update_admin
  on public.barangays for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy puroks_select_active
  on public.puroks for select to authenticated
  using (
    is_active
    and exists (
      select 1
      from public.barangays as b
      where b.id = puroks.barangay_id and b.is_active
    )
  );

create policy puroks_select_admin
  on public.puroks for select to authenticated
  using (public.is_admin());

create policy puroks_insert_admin
  on public.puroks for insert to authenticated
  with check (public.is_admin());

create policy puroks_update_admin
  on public.puroks for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Households: active staff may read non-archived rows. Admins have full read and
-- update access; BHWs may create/update active rows and archive once. Residents
-- see only the non-archived household linked through their resident record.
create policy households_select_staff_active
  on public.households for select to authenticated
  using (public.is_staff() and archived_at is null);

create policy households_select_admin
  on public.households for select to authenticated
  using (public.is_admin());

create policy households_select_own
  on public.households for select to authenticated
  using (
    archived_at is null
    and id = public.current_household_id()
  );

create policy households_insert_admin_bhw
  on public.households for insert to authenticated
  with check (
    public.current_profile_role() in ('admin', 'barangay_health_worker')
  );

create policy households_update_admin
  on public.households for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy households_update_bhw_active
  on public.households for update to authenticated
  using (
    public.current_profile_role() = 'barangay_health_worker'
    and archived_at is null
  )
  with check (public.current_profile_role() = 'barangay_health_worker');

-- Residents: staff read non-archived demographics; only admins see archives.
-- Admins and BHWs create/update, with BHW access ending after archival. A linked
-- resident account sees only its own non-archived row. No physical delete policy.
create policy residents_select_staff_active
  on public.residents for select to authenticated
  using (public.is_staff() and archived_at is null);

create policy residents_select_admin
  on public.residents for select to authenticated
  using (public.is_admin());

create policy residents_select_own
  on public.residents for select to authenticated
  using (
    archived_at is null
    and linked_profile_id = auth.uid()
  );

create policy residents_insert_admin_bhw
  on public.residents for insert to authenticated
  with check (
    public.current_profile_role() in ('admin', 'barangay_health_worker')
  );

create policy residents_update_admin
  on public.residents for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy residents_update_bhw_active
  on public.residents for update to authenticated
  using (
    public.current_profile_role() = 'barangay_health_worker'
    and archived_at is null
  )
  with check (public.current_profile_role() = 'barangay_health_worker');

-- Appointments: admins and BHWs schedule and manage records. Nurses and
-- midwives have read-only access only when assigned. Residents read their own.
-- Operational status transitions remain a Phase 2+ server workflow.
create policy appointments_select_admin
  on public.appointments for select to authenticated
  using (public.is_admin());

create policy appointments_select_bhw_active
  on public.appointments for select to authenticated
  using (
    public.current_profile_role() = 'barangay_health_worker'
    and archived_at is null
  );

create policy appointments_select_assigned_clinician
  on public.appointments for select to authenticated
  using (
    public.current_profile_role() in ('nurse', 'midwife')
    and assigned_staff_id = auth.uid()
    and archived_at is null
  );

create policy appointments_select_own
  on public.appointments for select to authenticated
  using (
    resident_id = public.current_resident_id()
    and archived_at is null
  );

create policy appointments_insert_admin_bhw
  on public.appointments for insert to authenticated
  with check (
    public.current_profile_role() in ('admin', 'barangay_health_worker')
  );

create policy appointments_update_admin
  on public.appointments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy appointments_update_bhw_active
  on public.appointments for update to authenticated
  using (
    public.current_profile_role() = 'barangay_health_worker'
    and archived_at is null
  )
  with check (public.current_profile_role() = 'barangay_health_worker');

-- Audit logs are admin-readable and otherwise append-only. There is no direct
-- authenticated insert, update, or delete policy.
create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using (public.is_admin());
