# Supabase database and trusted-function foundation

This directory contains the reviewable PostgreSQL and Edge Function source for
ALAGA-SYS through the current 56-migration foundation.

```text
supabase/
  bootstrap/   Reviewed manual first-administrator transaction
  functions/   Trusted Auth Admin, ALAGA AI, and notification Edge Functions
  migrations/  Fifty-six ordered forward-only migrations
  policies/     Reserved for supplementary reviewed policy notes/fragments
  seed.sql      Optional fictional development reference data
```

## Scope

The Phase 1 migrations create seven domain tables: `profiles`, `barangays`,
`puroks`, `households`, `residents`, `appointments`, and `audit_logs`. They also
create validated enums, number sequences, security helpers, timestamp/audit
triggers, indexes, restrictive RLS policies, and explicit API-role grants.

Those Phase 1 files contain no clinical encounters, diagnoses, prescriptions,
medicines, immunizations, maternal records, reports, or healthcare frontend
queries; later migrations add the reviewed foundations described below.

Migration 12 adds profile invitation/status metadata, an internal rate-limit
table, service-role-only administrator RPCs, and final-active-administrator
protection. It removes direct browser-admin updates of other profiles. The
`manage-user` Edge Function owns privileged Auth Admin calls.

Migrations 13 and 14 add neutral resident archival, database-generated
household numbers, registry workflow guards, RLS-preserving list RPCs, indexes,
and semantic household/resident audit events. They add no clinical tables.

Migration 15 adds the Brgy. Bagongpook deployment resolver, requires exactly
Purok 1 through Purok 7, derives registry `barangay_id` from the selected purok,
and deactivates legacy Purok 8 rows only when unreferenced.

Migration 16 configures the private resident-photo bucket and resident-aware
storage policies, adds paginated household selection and RLS-safe duplicate
review, hardens archive/head relationships, and restricts resident/profile
linking to service-role-only administrator RPCs. The updated `manage-user` Edge
Function provides the narrow candidate, invite, link, status, and unlink path.

Migration 17 reconciles databases that still contain the original fictional
barangay seed. It preserves the sole legacy UUID, safely merges references when
Bagongpook already exists, normalizes the locality to Lipa City, Batangas, and
keeps only Purok 1 through Purok 7 active. Purok 8 remains inactive without
deleting historical registry rows. A direct Masigla conversion is rejected
unless the database has the expected sole-barangay P01-P08 seed shape.
Temporary purok codes use an ordered row number within a transaction; the
per-barangay name/code uniqueness indexes are recreated before commit so the
deterministic UUIDs cannot collide while labels are being evacuated.

Migrations 18 through 28 add the reviewed appointment, clinical,
resident-request, maternal/child, reporting, and general-assistance foundations.
Migration 29 adds a metadata-only, service-role AI rate-limit table and atomic
consume function. Migration 30 adds a service-role-only, read-only grounding
RPC whose explicit output is limited to approved public operational text. It
creates no content store and returns no database identifiers or author/contact
fields. Migration 31 adds printable healthcare documents. These are repository
source facts only; determine the hosted project's applied migration state from
an authenticated linked dry run rather than this document.

The `alaga-ai` Edge Function revalidates the Supabase user and active profile,
derives role context from the database, enforces the server rate limit, loads
only approved grounding through Migration 30, and calls Gemini with provider
storage disabled. Deterministic symbolic navigation is role checked before the
provider. It does not query application healthcare data and must be deployed
separately after Migration 30.

Migration 32 adds opt-in notification preferences, an RLS-protected
outbound job queue, minimized delivery attempts, best-effort workflow triggers,
Manila-aware appointment reminders, and service-role claim/completion RPCs.
The `process-notification-jobs` Edge Function resolves confirmed Auth contacts
server-side and uses provider-neutral email/SMS adapters. SMS is disabled by
default. Migration, function, scheduler, and provider activation remain manual;
see [`docs/deployment/EMAIL_SMS.md`](../docs/deployment/EMAIL_SMS.md).

Migrations 33 through 43 preserve the reviewed backup, hardening, appointment,
and notification UAT corrections. Migration 44 adds Resident-only public signup
capture and Administrator review. It does not expose a staff-registration path:
new public accounts remain invited Residents, review RPCs remain service-role
only, and exact existing-Resident matches require explicit linking. Migration 45
corrects the approval workflow so approved registrations create or explicitly
link the intended Resident without weakening duplicate and locality checks.
Migrations 46 and 47 add the Administrator-only permanent cleanup boundary for
dependency-free Resident accounts. Migration 47 stages linked Resident and
disposable preference state for compensation, while all appointment, clinical,
document, audit, inquiry, and notification-job dependencies remain blockers.
Migration 48 corrects the deployed Resident preparation predicates without
changing that contract. Migration 49 adds service-role-only generalized
eligibility, preparation, and compensation RPCs for dependency-free Resident,
BHW, Nurse, and Midwife accounts. It rejects every Administrator target and
reuses the fail-closed current/future foreign-key scanner; protected operational
records are never removed to make an account eligible.
Migration 50 restores the RLS-preserving Bagongpook household picker through the
trusted deployment-context boundary. Migration 51 adds the active
Administrator-only atomic workflow for archiving a sole-active-member household
head and household without weakening the normal replacement-head rule.
Migration 52 allows a dependency-free archived Resident identity to use the
existing compensated permanent-account cleanup workflow. It preserves every
real protected-history check and adds a service-role-only, non-sensitive
retention assessment used to select guarded deletion or protected-history
retirement.
Migration 53 adds protected-history account retirement. It retains the profile
and every operational foreign key, permanently marks the account inactive and
retired, excludes it from normal User Management, and exposes only guarded
service-role preparation/compensation RPCs. The Edge Function tombstones the
Auth email under the reserved `.invalid` domain and applies the supported
100-year Auth ban, allowing the original email to be reused without deleting
the historical profile identity.
Migration 54 adds the symbolic pending-Resident-registration notification enum
value in its own committed migration. Migration 55 adds idempotent trusted
triggers for auto-confirmed signup, later email confirmation, and existing
confirmed pending registrations. Only active Administrators receive the
privacy-minimized `/user-management` notification; browser roles cannot invoke
the creation functions or choose recipients. Migration 56 preserves existing
appointment history while requiring new or changed appointment start times to
use 30-minute Asia/Manila slots from 08:00 through 16:00 inclusive.

## Applying migrations

Any unapplied migration must remain pending until an authenticated
linked-project dry run is reviewed and a live apply receives explicit approval.
Source presence does not imply hosted deployment.

With an authenticated official Supabase CLI, run from the repository root:

```bash
supabase login
supabase init # only when supabase/config.toml does not exist
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run --include-seed
supabase db push --include-seed
```

Omit `--include-seed` for any environment that should not receive the fictional
reference locality. Review the dry run first. Alternatively, apply each migration
through the Supabase SQL Editor in filename order, followed optionally by
`seed.sql`. Full verification queries are in
[`docs/database/SCHEMA.md`](../docs/database/SCHEMA.md).

Do not run a destructive reset against a shared or production database. Do not
share the database password, access token, connection string, or secret key.

## Development seed

`seed.sql` contains synthetic Brgy. Bagongpook reference data for Lipa City,
Batangas, with exactly seven active puroks. It creates no Auth users, households,
residents, contact information, or healthcare data. It remains idempotent after
legacy-reference reconciliation and keeps Purok 8 inactive without deleting
historical references.

## Security rules

- The React application may contain only `VITE_SUPABASE_URL` and the Supabase
  publishable key.
- A publishable key identifies the project; RLS remains the authorization boundary.
- Never place a secret or service-role key in frontend code, a `VITE_` variable,
  source control, logs, screenshots, documentation, or support messages.
- `anon` has no table access. Its only Migration 44 database capability is the
  read-only RPC that returns the seven active Bagongpook purok IDs and names.
- `authenticated` operations require explicit grants and matching RLS policies.
- Normal client roles receive no physical delete or direct audit-insert access.
- Service-role credentials belong only in a trusted backend and are not needed
  to build or lint this frontend.
- `GEMINI_API_KEY`, `GEMINI_MODEL`, and the exact-origin allowlist are
  server-only Edge Function secrets. They must never appear in frontend code.
- The ALAGA AI rate-limit table and consume function are callable only by
  `service_role`; authenticated clients have no direct access.
- The ALAGA AI grounding RPC is callable only by `service_role`, is read-only,
  and returns only bounded active FAQ, public health-center, and current
  announcement fields.
- AI prompt and response content is not stored in PostgreSQL or application
  logs. Provider-side interaction storage is explicitly disabled per request.
- Notification job tables have no browser grants. Recipients are resolved from
  trusted relationships and confirmed Auth contacts, and logs contain only
  masked operational metadata.
- Email/SMS API keys and `NOTIFICATION_PROCESSOR_TOKEN` are server-only Edge
  Function secrets. `SMS_ENABLED` remains false until explicit approval.

## Migration authoring rules

Add future changes as new timestamped migrations. Do not edit migrations already
applied to a shared environment. Keep schema-qualified security functions,
explicit `search_path`, deny-by-default RLS, synthetic fixtures, and accompanying
documentation updates.
