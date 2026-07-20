# Database schema through Phase 3B

## Scope

Phase 1 adds the normalized PostgreSQL foundation for ALAGA-SYS V2. It creates
only `profiles`, `barangays`, `puroks`, `households`, `residents`,
`appointments`, and `audit_logs`. It does not add encounters, clinical notes,
diagnoses, prescriptions, medicines, immunizations, maternal records,
notifications, reports, or healthcare database queries. Phase 2B adds only
trusted account-management support and one internal abuse-control table.

The schema uses UUID primary keys, real foreign keys, validated database values,
soft archival for resident/household/appointment records, explicit grants, and
deny-by-default Row Level Security (RLS).

## Ordered migrations

Apply every file in lexical order:

1. `20260720000100_extensions_and_enums.sql` — extension and enum types
2. `20260720000200_profiles_and_auth_trigger.sql` — Auth-linked profiles
3. `20260720000300_locations_and_households.sql` — locations and households
4. `20260720000400_residents.sql` — residents and resident-number trigger
5. `20260720000500_household_head_relationship.sql` — safe circular relationship
6. `20260720000600_appointments.sql` — appointments and number trigger
7. `20260720000700_audit_logs.sql` — append-only audit storage
8. `20260720000800_helper_functions_and_triggers.sql` — RLS helpers, timestamps,
   profile protection, and automatic auditing
9. `20260720000900_indexes.sql` — foreign-key, lookup, and queue indexes
10. `20260720001000_rls_policies.sql` — RLS enablement and policies
11. `20260720001100_grants_and_privilege_hardening.sql` — API-role privileges
12. `20260720001200_trusted_user_management.sql` — trusted account lifecycle,
    abuse control, and final-administrator safeguards
13. `20260720001300_resident_archived_status.sql` — neutral resident archive enum
14. `20260720001400_registry_workflows.sql` — generated household numbers,
    archive/locality guards, invoker list RPCs, indexes, and semantic auditing
15. `20260720001500_bagongpook_deployment.sql` — canonical single-barangay
    resolver, seven-purok guard, derived write locality, and safe Purok 8
    deactivation
16. `20260720001600_registry_hardening.sql` — private resident photos, scalable
    household selection, duplicate review, archive integrity, and trusted profile
    linking
17. `20260720001700_reconcile_bagongpook_reference.sql` — forward-only legacy
    seed reconciliation that preserves registry references, normalizes the
    deployment locality, and keeps only Purok 1 through Purok 7 active

Migrations are forward-only and intended to be applied once by Supabase
migration tooling. They contain no database reset or destructive database-level
operation.

The Phase 2B migration follows the eleven Phase 1 migrations and adds trusted
account lifecycle metadata, abuse control, service-role-only RPCs, and
final-active-administrator protection.

## Key design decisions

### Profiles and registration

`profiles.id` is a one-to-one foreign key to `auth.users.id`. Email stays in
Supabase Auth. The `on_auth_user_created` trigger creates a minimal profile for a
new Auth user and deliberately ignores any role or account-status value in user
metadata. Every new profile starts with role `resident` and status `invited`.

RLS permits self-updates, while `profiles_protect_privileged_fields` prevents a
user—including an admin—from changing their own role, account status, or
`last_login_at`. Phase 2B retires direct browser-admin updates of other profiles
in favor of the trusted server-side workflow described below.

Phase 2B removes direct authenticated-admin updates of other profiles.
Privileged changes use the verified Edge Function and service-role-only RPCs;
safe self-profile updates retain their existing RLS path. Profiles also record
`invited_by`, `invitation_sent_at`, and `status_changed_at`. A serialized
database trigger protects the final active administrator during role/status
updates and exceptional deletes.

### Location consistency

Barangay names are unique case-insensitively within province and municipality.
Purok names and codes are unique case-insensitively within a barangay. Composite
foreign keys ensure a household or resident cannot claim a purok from a
different barangay. A resident assigned to a household must use that household's
barangay and purok.

For the Bagongpook deployment, users select only Purok 1–7. The database derives
`barangay_id` from the selected purok and rejects any noncanonical or inactive
locality. The canonical UUID remains reference data rather than application code.
Migration 17 converts the original `Barangay Masigla (Fictional)` row in place
when it is the sole seed, preserving its UUID. If a Bagongpook row already
exists, registry references are merged transactionally and legacy barangay UUIDs
remain as inactive aliases. The canonical locality is Lipa City, Batangas.
The direct fictional-seed conversion fails and rolls back unless Masigla is the
sole barangay and contains exactly one each of P01 through P08, with P01 through
P07 active.
During reconciliation, candidate puroks receive deterministic temporary codes
formed from `M` and a 19-digit row number ordered by barangay UUID and purok
UUID. Migration 17 transactionally recreates the case-insensitive name/code
indexes after canonical labels are finalized, preventing collisions from the
shared prefixes of deterministic development UUIDs.

### Household head relationship

`households.head_resident_id` is created nullable before `residents`, then its
foreign key is added in migration 5. The composite relationship
`(head_resident_id, household.id) -> (resident.id, resident.household_id)`
guarantees that a household head is actually a member. Clear or reassign the
head before moving that resident to a different household.

### Soft archival

There are no normal-client `DELETE` grants or policies for important records.

- Households use status `archived` together with a non-null `archived_at`.
- Residents use `moved_out`, `deceased`, or neutral `archived` together with
  `archived_at`.
- Appointments retain `archived_at`; archival is access-controlled by policy.
- Audit logs are append-only and reject every update or delete through a trigger.

Admins can read archived rows. BHW update access starts only from non-archived
rows, allowing a one-way archive action but preventing later BHW modification.

### Number generation

`household_number_seq`, `resident_number_seq`, and `appointment_number_seq` are
PostgreSQL sequences.
Security-definer triggers always overwrite a client-supplied number during
insert and reject changes during update.

Display formats are:

- `HH-YYYY-000001`
- `RES-YYYY-000001`
- `APT-YYYY-000001`

The numeric portion is global and never resets each year. `nextval()` is atomic,
so concurrent transactions cannot receive the same value. Rolled-back
transactions may leave harmless gaps. The browser roles have no sequence or
generator-function privileges.

### Timestamps

Mutable tables receive `created_at` and `updated_at`. The shared
`set_updated_at` trigger assigns `statement_timestamp()` before every update.
Audit logs have only `created_at` because they are immutable.

Primary UUIDs and creation timestamps are immutable after insert. For resident
and appointment browser writes, attribution triggers set `created_by` and
`updated_by` from `auth.uid()` and prevent a client from spoofing those columns.
Direct BHW updates cannot create/change resident-to-profile links, because that
link controls resident self-read access. Appointment assignment accepts only an
active staff profile, and direct authenticated updates cannot replace an
appointment's resident owner.

### Pregnancy status

Age is never stored; it is calculated from `date_of_birth` when queried or
displayed. Pregnancy is a nullable validated status, not a universal checkbox.
When populated, the schema requires `sex = female`; null means not captured or
not applicable. Detailed maternal records remain outside Phase 1.

## Applying with the Supabase CLI

An authenticated CLI dry run on July 20, 2026 confirmed that the linked project
has migrations 1–11 and would apply only migration 12. The live push was not
performed because the environment requires a fresh explicit confirmation for
shared auth/RLS changes. To apply after review, run from the repository root:

```bash
supabase login
supabase init # only when supabase/config.toml does not exist
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run --include-seed
supabase db push --include-seed
```

Review a newly generated `supabase/config.toml` before linking, and review the
dry-run output before applying. Do not paste a database password,
access token, connection string, service-role key, or secret into chat, source
control, screenshots, or frontend environment variables.

The CLI recognizes `supabase/seed.sql` after migrations. The seed is optional;
omit `--include-seed` when targeting a project that should not receive the
fictional development locality. Supabase's current seeding guidance is at
<https://supabase.com/docs/guides/local-development/seeding-your-database>.

## Applying through the Supabase SQL Editor

If the CLI is unavailable:

1. Open the target project's SQL Editor while signed in to the Supabase dashboard.
2. Open each migration locally and paste one complete file at a time, in the
   exact order listed above.
3. Execute and confirm success before moving to the next migration.
4. Stop on the first error; do not skip ahead or rerun later files out of order.
5. Run the verification queries below.
6. Optionally apply the single development seed file only to a development project.

Do not use the publishable browser key to apply DDL. Do not request or share a
database password in chat.

## Safe verification queries

Confirm RLS on all eight managed public tables:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'barangays', 'puroks', 'households',
    'residents', 'appointments', 'audit_logs',
    'admin_action_rate_limits'
  )
order by c.relname;
```

Review policies and grants:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Verify security-definer search paths:

```sql
select n.nspname, p.proname, p.prosecdef, p.proconfig
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'handle_new_auth_user', 'set_resident_number',
    'set_appointment_number', 'current_profile_role', 'is_admin',
    'is_staff', 'current_resident_id', 'current_household_id',
    'validate_appointment_relationships', 'audit_row_change'
  )
order by p.proname;
```

Behavioral RLS tests should use dedicated synthetic Auth accounts in a disposable
development project. Test one account per role and verify allowed and denied
operations through the publishable-key client. Never test with real resident or
healthcare information, and never expose the service-role key to a browser.

## Known limitations through Phase 2B

- Migration 12 and the `manage-user` Edge Function are implemented and locally
  verified but are not deployed to the linked project.
- Hosted Auth, SMTP, allowed-origin, and invitation-redirect settings require
  project-owner review before production use.
- Frontend and server validation use the canonical
  `barangay_health_worker` role; the obsolete `health_worker` placeholder is
  rejected by tests.
- Nurse/midwife appointment access is assigned-only and read-only.
- Resident self-booking is disabled.
- Appointment conflict detection and state-transition enforcement are deferred.
- `assigned_staff_id` is validated against active staff by a trigger; finer
  service-specific staff eligibility remains a future workflow rule.
- Pregnancy status is demographic context only; no maternal record exists.
- Automatic auditing captures inserts, updates, and exceptional backend deletes
  on six mutable foundation tables, but not Auth events, reads, failed changes,
  storage operations, or external service activity.
- A profile referenced as an audit actor cannot be physically deleted without an
  explicit privileged retention procedure; this preserves append-only history.
