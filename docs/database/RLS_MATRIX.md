# Row Level Security matrix

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

| Table/scope                          | Admin | BHW    | Nurse      | Midwife    | Resident               |
| ------------------------------------ | ----- | ------ | ---------- | ---------- | ---------------------- |
| Own profile                          | R/U¹  | R/U¹   | R/U¹       | R/U¹       | R/U¹                   |
| Other profiles                       | R/U²  | R      | R          | R          | —                      |
| Active barangays/puroks              | R/C/U | R      | R          | R          | R                      |
| Inactive barangays/puroks            | R/C/U | —      | —          | —          | —                      |
| Non-archived households              | R/C/U | R/C/U² | R          | R          | Own linked household R |
| Archived households                  | R/U   | —      | —          | —          | —                      |
| Non-archived residents               | R/C/U | R/C/U² | R          | R          | Own linked record R    |
| Archived residents                   | R/U   | —      | —          | —          | —                      |
| Non-archived appointments            | R/C/U | R/C/U² | Assigned R | Assigned R | Own R                  |
| Archived appointments                | R/U   | —      | —          | —          | —                      |
| Audit logs                           | R     | —      | —          | —          | —                      |
| Internal admin rate-limit rows       | —     | —      | —          | —          | —                      |
| Physical delete on any managed table | —³    | —      | —          | —          | —                      |
| Direct audit insert/update/delete    | —     | —      | —          | —          | —                      |

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

- Admin reads all and creates/updates.
- BHW reads non-archived appointments and creates/updates from active rows.
- Nurse and midwife read only non-archived appointments assigned to their own
  profile and cannot update status in Phase 1.
- Residents read only appointments belonging to their linked resident row.
- Resident self-booking and physical deletion are disabled.

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

## Restrictive Phase 2 placeholders

Phase 1 deliberately chooses stricter behavior where workflow rules are not yet
implemented:

- New Auth users are invited residents, never staff.
- There is no browser role-assignment or account-activation endpoint.
- Nurse/midwife appointment updates are denied, even for assigned appointments.
- Appointment assignment does not itself prove the profile has a clinical role;
  the database requires active staff, while a future trusted scheduling action
  must validate service-specific eligibility.
- BHW demographic writes cannot create or change a resident/profile link.
- Direct authenticated appointment updates cannot replace the resident owner.
- Appointment state transitions are not exposed as broad client updates.
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
