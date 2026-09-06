# Database schema through Migration 56

## Scope

The repository contains exactly 56 ordered, forward-only migrations. Migrations
1-17 establish authentication-linked profiles, Bagongpook locality, the
household/Resident registry, appointments, auditing, RLS, trusted account
management, and registry hardening. Later migrations add the reviewed
appointment, clinical, reporting, general-assistance, AI, printable-document,
outbound-notification, backup, Resident-registration, account-lifecycle, and
final workflow-hardening database boundaries. Some preserved database objects
belong to inactive future extensions and are not visible in the approved final
application scope.

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
18. `20260720001800_appointment_workflows.sql` — trusted appointment scheduling,
    state transitions, conflict handling, calendar, and daily queue
19. `20260720001900_fix_appointment_rpc_contracts.sql` — stable appointment RPC
    return types and least-privilege staff search
20. `20260720002000_health_records_foundation.sql` — encounters, vital signs,
    signing, amendments, clinical RLS, and trusted workflows
21. `20260720002100_fix_clinical_manila_dates.sql` — explicit Asia/Manila
    clinical date validation
22. `20260720002200_resident_appointment_requests.sql` — trusted own-Resident
    appointment requests and cancellation boundary
23. `20260720002300_simplify_resident_request_duration.sql` — server-derived
    provisional Resident-request duration
24. `20260720002400_maternal_child_care.sql` — preserved maternal and child-care
    schema, RLS, and trusted workflows
25. `20260720002500_fix_maternal_child_trigger_columns.sql` — table-safe immutable
    maternal/child identifiers
26. `20260720002600_reports_analytics.sql` — privacy-safe report aggregates and
    export contracts
27. `20260720002700_general_assistance.sql` — announcements, notifications,
    health-center information, FAQs, and inquiries
28. `20260720002800_final_qa_fixes.sql` — reviewed cross-role and data-safety
    corrections
29. `20260720002900_ai_assistant_rate_limit.sql` — atomic service-role AI rate
    limiting without conversation storage
30. `20260720003000_ai_grounding_context.sql` — bounded read-only AI grounding
31. `20260720003100_printable_healthcare_documents.sql` — authorized printable
    appointment and clinical document contracts
32. `20260720003200_outbound_notification_foundation.sql` — optional email/SMS
    preferences, jobs, attempts, reminders, and worker RPCs
33. `20260720003300_backup_restore_foundation.sql` — guarded application-aware
    backup and restore foundation
34. `20260720003400_production_security_hardening.sql` — production security and
    least-privilege corrections
35. `20260720003500_resident_clinical_document_safety.sql` — minimized Resident
    clinical-document access
36. `20260720003600_optional_resident_appointment_reason.sql` — optional reason
    for trusted Resident appointment requests
37. `20260720003700_preserve_optional_resident_appointment_reason.sql` — preserves
    a null Resident reason during staff schedule edits
38. `20260720003800_optional_resident_cancellation_reason.sql` — optional own-
    Resident cancellation narrative
39. `20260720003900_fix_reschedule_propagation_notifications.sql` — reschedule
    propagation and notification corrections
40. `20260720004000_enforce_single_row_appointment_lifecycle.sql` — in-place
    rescheduling with one appointment row and number
41. `20260720004100_optional_authorized_cancellation_reason.sql` — optional
    cancellation narrative without relaxing required rejection justification
42. `20260720004200_simplify_appointment_completion.sql` — trusted checked-in to
    completed transition without mandatory encounter creation
43. `20260720004300_cleanup_archived_announcement_notifications.sql` — excludes
    notifications linked to archived announcements
44. `20260720004400_resident_self_registration.sql` — Resident-only public signup
    capture and Administrator review
45. `20260720004500_fix_resident_registration_approval.sql` — corrected
    create/link approval data flow and Resident-number generation
46. `20260720004600_guard_resident_account_deletion.sql` — initial guarded
    pending/rejected Resident account cleanup
47. `20260720004700_extend_safe_resident_account_deletion.sql` — compensated
    dependency-free linked Resident cleanup
48. `20260720004800_fix_resident_delete_ambiguity.sql` — qualified deletion
    predicates that avoid PL/pgSQL output-column ambiguity
49. `20260720004900_generalize_safe_account_deletion.sql` — guarded cleanup for
    dependency-free non-Administrator accounts
50. `20260720005000_fix_resident_household_unassignment.sql` — RLS-preserving
    Bagongpook household lookup for explicit assignment/unassignment
51. `20260720005100_archive_sole_member_household.sql` — Administrator-only atomic
    sole-member Resident and household archival
52. `20260720005200_fix_account_cleanup_eligibility.sql` — archived-Resident
    cleanup assessment and coarse protected-history classification
53. `20260720005300_retire_protected_accounts.sql` — retained-history account
    retirement with guarded preparation and compensation
54. `20260720005400_resident_registration_notification_type.sql` — committed
    pending-registration notification enum value
55. `20260720005500_notify_pending_resident_registration.sql` — deduplicated
    notifications for confirmed pending registrations to active Administrators
56. `20260720005600_enforce_appointment_start_slots.sql` — 30-minute appointment
    start slots from 08:00 through 16:00 in the Asia/Manila business schedule

Migrations are forward-only and intended to be applied once by Supabase
migration tooling. Some later files perform narrowly scoped reconciliation,
archival, or transient-notification cleanup; none is a general database reset.
Review every pending file and its data predicates before application.

The migration files are the source-of-truth history and are verified in lexical
order by `npm run db:verify`. Repository presence does not prove which files are
applied to a hosted project. Obtain that state from an authenticated linked dry
run and review it before applying anything.

## Key design decisions

### Profiles and registration

`profiles.id` is a one-to-one foreign key to `auth.users.id`. Email stays in
Supabase Auth. The `on_auth_user_created` trigger creates a minimal profile for a
new Auth user and deliberately ignores any role or account-status value in user
metadata. Every new profile starts with role `resident` and status `invited`.
For self-registration, that invited profile remains blocked until an
Administrator approves the matching request. Browser metadata is never used for
role, status, barangay, Resident number, or staff authorization.

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

The repository does not establish the linked project's applied migration state.
To inspect it and apply only an explicitly reviewed pending sequence, run from
the repository root:

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

Review RLS status for every table in the public schema; do not rely on a stale
hard-coded table count:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
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

Verify every public security-definer function and review its fixed configuration:

```sql
select n.nspname, p.proname, p.prosecdef, p.proconfig
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;
```

Behavioral RLS tests should use dedicated synthetic Auth accounts in a disposable
development project. Test one account per role and verify allowed and denied
operations through the publishable-key client. Never test with real resident or
healthcare information, and never expose the service-role key to a browser.

## Repository and hosted-state boundary

- The repository contains Migrations 1-56 and verifies their canonical LF
  content, order, structural contracts, grants, and selected security invariants.
- Repository verification does not prove that a hosted database, Auth setting,
  Edge Function, scheduler, provider, storage policy, or secret matches source.
- Run and review a linked dry run, database lint, direct role/RLS tests, storage
  tests, and Edge Function checks before production approval.
- Public signup remains Resident-only and pending until Administrator review;
  staff provisioning remains trusted. Resident appointment requests and
  cancellation remain narrow own-record RPC workflows.
- Normal browser workflows archive important records. Guarded permanent account
  cleanup is limited to dependency-free non-Administrator identities, while
  protected history uses retirement and retained profile attribution.
- Maternal/child and other preserved extension schemas remain protected even
  where their user-interface routes are excluded from the final visible scope.
