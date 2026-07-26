# Row Level Security matrix

## Phase 3B storage and linking additions

| Resource/action                             | Admin                    | BHW                      | Nurse                    | Midwife                  | Resident        | Anonymous |
| ------------------------------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | --------------- | --------- |
| Active resident photo read                  | Yes                      | Yes                      | Yes                      | Yes                      | Own linked only | No        |
| Archived resident photo read                | Yes                      | No                       | No                       | No                       | No              | No        |
| Active resident photo upload/replace/remove | Yes                      | Yes                      | No                       | No                       | No              | No        |
| Resident profile candidate list             | Trusted Edge only        | No                       | No                       | No                       | No              | No        |
| Resident profile link/unlink                | Trusted Edge only        | No                       | No                       | No                       | No              | No        |
| Duplicate candidate search                  | RLS-visible active rows  | RLS-visible active rows  | RLS-visible active rows  | RLS-visible active rows  | No              | No        |
| Household picker search                     | RLS-visible current rows | RLS-visible current rows | RLS-visible current rows | RLS-visible current rows | Own policy only | No        |

Storage policies parse the resident UUID from a strict UUID-only object path and
re-check the active canonical profile and resident relationship. Private objects
have no anonymous policy. Nurse/midwife and linked-resident access is read-only.
The account RPCs revoke `public`, `anon`, and `authenticated` execution and grant
only `service_role`; the Edge Function independently verifies an active admin.

Duplicate and household search functions are `security invoker`, so they cannot
return table rows hidden by RLS. Client permission helpers are usability
controls only and do not replace these database/storage policies.

## Security model

RLS is enabled on every Phase 1 public table. Access is deny-by-default: a user
needs both a PostgreSQL grant and a matching policy. `anon` receives no public
schema or table access. `authenticated` receives only the table operations that
have policies, and no normal client role receives `DELETE`.

Role checks use the caller's active profile. An invited, inactive, or suspended
profile does not pass `current_profile_role()`, `is_admin()`, or `is_staff()`.
Self-profile read/update remains available so an invited user can complete safe
personal fields before the Phase 2 invitation workflow is built.

## Access matrix

Legend: **R** read, **C** create, **U** update, **—** denied.

| Table/scope                          | Admin | BHW    | Nurse          | Midwife                       | Resident               |
| ------------------------------------ | ----- | ------ | -------------- | ----------------------------- | ---------------------- |
| Own profile                          | R/U¹  | R/U¹   | R/U¹           | R/U¹                          | R/U¹                   |
| Other profiles                       | R/U²  | R      | R              | R                             | —                      |
| Active barangays/puroks              | R/C/U | R      | R              | R                             | R                      |
| Inactive barangays/puroks            | R/C/U | —      | —              | —                             | —                      |
| Non-archived households              | R/C/U | R/C/U² | R              | R                             | Own linked household R |
| Archived households                  | R/U   | —      | —              | —                             | —                      |
| Non-archived residents               | R/C/U | R/C/U² | R              | R                             | Own linked record R    |
| Archived residents                   | R/U   | —      | —              | —                             | —                      |
| Non-archived appointments            | R/RPC | R/RPC  | Assigned R/RPC | Assigned maternal/child R/RPC | Own R                  |
| Archived appointments                | R/U   | —      | —              | —                             | —                      |
| Audit logs                           | R     | —      | —              | —                             | —                      |
| Internal admin rate-limit rows       | —     | —      | —              | —                             | —                      |
| Physical delete on any managed table | —³    | —      | —              | —                             | —                      |
| Direct audit insert/update/delete    | —     | —      | —              | —                             | —                      |

1. The profile-protection trigger restricts self-update to names, suffix, phone,
   and avatar. A user cannot change their own role, account status,
   `last_login_at`, identity, or creation timestamp.
2. Other-profile updates are available only through the verified Edge Function
   and service-role-only RPCs, not through the browser table API. A BHW may
   update a non-archived domain row into an archived state. Once archived,
   the row no longer satisfies the BHW update policy and only an admin can act.
3. No authenticated client has `DELETE`. Elevated database owners remain capable
   of emergency maintenance outside the API, subject to operational governance.

## Per-table policy inventory

### `profiles`

| Policy                  | Command | Condition                       |
| ----------------------- | ------- | ------------------------------- |
| `profiles_select_own`   | SELECT  | `id = auth.uid()`               |
| `profiles_select_staff` | SELECT  | Active staff role               |
| `profiles_update_own`   | UPDATE  | Own row before and after update |

There is no direct profile INSERT policy and no other-profile browser UPDATE
policy; the trusted `auth.users` trigger owns
creation. There is no client DELETE policy. Staff visibility contains profile
identity and scheduling contact data only—email remains in Supabase Auth, and no
clinical data exists in profiles.

### `barangays` and `puroks`

- Any signed-in user may read active reference rows.
- An active admin may read inactive rows and insert/update reference data.
- Ordinary residents and staff cannot create, update, or delete reference data.
- Purok active reads also require the parent barangay to be active.

### `households`

- Active staff read non-archived households.
- A linked resident reads only their own non-archived household.
- Admin and BHW create records.
- Admin updates any record; BHW updates only from a non-archived record.
- Only admin reads archived households. No client deletes.

### `residents`

- Active admin, BHW, nurse, and midwife profiles read non-archived demographics.
- A resident profile reads only its uniquely linked non-archived resident row.
- Admin and BHW create records.
- Admin updates any record; BHW updates only from a non-archived record.
- Nurse, midwife, and resident roles have no update or delete access.

### `appointments`

- Admin reads all and may call every trusted appointment workflow.
- BHW reads non-archived appointments and may schedule, edit
  pending/confirmed appointments, reschedule, confirm, check in, cancel before
  in-progress, and update operational notes.
- Nurses read assigned non-archived appointments and may perform state-valid
  check-in, no-show, start, complete, and operational-note actions.
- Midwives have the same assigned-clinician access only for Maternal Care and
  Child Health services.
- Residents read only appointments belonging to their linked resident row.
- Direct authenticated INSERT/UPDATE grants and policies are retired. Every
  browser mutation uses an independently authorized security-definer RPC.
- Resident self-booking and physical deletion remain disabled.

Appointment list, daily queue, calendar, resident/staff search, resident
history, and dashboard aggregation run with caller RLS. Full reasons and
operational notes are excluded from overview RPCs. Mutations require an expected
row version; staff overlap checks use a transaction advisory lock by staff/date.

### `audit_logs`

Only active admins may read. There are no authenticated INSERT, UPDATE, or DELETE
policies. Automatic security-definer triggers perform controlled inserts, and an
append-only trigger rejects all updates/deletes.

## Helper functions

| Function                 | Security                                    | Result/purpose                         |
| ------------------------ | ------------------------------------------- | -------------------------------------- |
| `current_profile_role()` | Stable, security definer, empty search path | Active caller role or null             |
| `is_admin()`             | Stable, security definer, empty search path | Active admin boolean                   |
| `is_staff()`             | Stable, security definer, empty search path | Active admin/BHW/nurse/midwife boolean |
| `current_resident_id()`  | Stable, security definer, empty search path | Resident linked to caller or null      |
| `current_household_id()` | Stable, security definer, empty search path | Linked resident household or null      |

The helpers are security definer so their lookup of RLS-protected tables does not
recursively invoke those same policies. They are schema-qualified, expose only
an enum/UUID/boolean, use `search_path = ''`, and are executable only by
`authenticated` plus database-owner roles.

## Retained restrictions

Phase 4 keeps these deny-by-default boundaries:

- New Auth users are invited residents, never staff.
- There is no browser role-assignment or account-activation endpoint.
- Direct nurse/midwife table updates remain denied; narrowly scoped assigned
  lifecycle RPCs authorize each action.
- Appointment assignment does not itself prove eligibility. Trusted scheduling
  validates an active BHW/nurse/midwife profile and restricts midwives to
  Maternal Care or Child Health.
- BHW demographic writes cannot create or change a resident/profile link.
- Direct authenticated appointment updates cannot replace the resident owner.
- Appointment state transitions are exposed only as bounded RPC operations.
- Resident self-booking is denied.
- Archived data is admin-only.

## Safe live verification

Use a disposable development project with synthetic Auth users. Verify each role
through the normal publishable-key client, not the SQL owner and never a browser
service-role key. Test at least:

1. An invited user can read/update safe own profile data but cannot promote or activate self.
2. A resident cannot read another profile, household, resident, or appointment.
3. A nurse sees an assigned appointment but cannot update it.
4. A BHW can create a resident and receives a database-generated number.
5. A BHW can archive a resident but cannot subsequently update the archived row.
6. An admin can read audit logs but cannot update/delete them.
7. `anon` receives no Phase 1 table data.

Use fictional records only. Database-owner or service-role success does not prove
RLS works because those roles can bypass policies.

## Phase 2B trusted user management

The `admin_action_rate_limits` table has RLS enabled and no `anon` or
`authenticated` policy or grant. Only the non-browser rate-limit RPC touches it.
All `admin_*` account-management functions are revoked from browser roles and
granted only to `service_role`.

The Edge Function must still verify an active administrator. The RPCs repeat
that check, reject self role/status changes, and write semantic audit events.
`profiles_protect_last_active_admin_update` and
`profiles_protect_last_active_admin_delete` prevent removing the final active
administrator independently of the UI and Edge Function.

## Phase 3A registry queries

`registry_list_households` and `registry_list_residents` are explicitly
`security invoker`. They retain the caller's table grants and RLS visibility;
they do not provide broader access than direct table reads. Execute is revoked
from `anon` and granted to `authenticated` only for parameterized listing.

Application route permissions mirror, but never replace, these policies:
administrator/BHW users manage current registry rows, nurse/midwife users read
current resident demographics, and resident users cannot browse either
registry. Archived visibility/restoration remains administrator-only. Existing
policies were not broadened in Phase 3A.

`registry_get_deployment_context()` is a narrowly scoped security-definer RPC.
It returns only the canonical Bagongpook UUID/name and Purok 1–7 reference rows,
requires an active staff caller, and fails on missing, inactive, duplicated, or
unexpected deployment reference data. Registry write triggers derive
`barangay_id` from the selected purok before the existing RLS and relationship
checks complete; browser-supplied barangay values are not authoritative.
