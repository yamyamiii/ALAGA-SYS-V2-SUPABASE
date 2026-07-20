# Supabase database and trusted-function foundation

This directory contains the reviewable PostgreSQL and Edge Function source for
ALAGA-SYS through Phase 3B.

```text
supabase/
  bootstrap/   Reviewed manual first-administrator transaction
  functions/   Trusted server-only Auth Admin operations
  migrations/  Sixteen ordered forward-only migrations
  policies/     Reserved for supplementary reviewed policy notes/fragments
  seed.sql      Optional fictional development reference data
```

## Scope

The Phase 1 migrations create seven domain tables: `profiles`, `barangays`,
`puroks`, `households`, `residents`, `appointments`, and `audit_logs`. They also
create validated enums, number sequences, security helpers, timestamp/audit
triggers, indexes, restrictive RLS policies, and explicit API-role grants.

There are no clinical encounters, diagnoses, prescriptions, medicines,
immunizations, maternal records, reports, or healthcare frontend queries.

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

`seed.sql` contains synthetic Brgy. Bagongpook reference data with exactly seven
active puroks. It creates no Auth users, households, residents, contact
information, or healthcare data. It is idempotent by deterministic development
UUID and safely deactivates an unreferenced Purok 8 left by the older seed.

## Security rules

- The React application may contain only `VITE_SUPABASE_URL` and the Supabase
  publishable key.
- A publishable key identifies the project; RLS remains the authorization boundary.
- Never place a secret or service-role key in frontend code, a `VITE_` variable,
  source control, logs, screenshots, documentation, or support messages.
- `anon` has no Phase 1 table access.
- `authenticated` operations require explicit grants and matching RLS policies.
- Normal client roles receive no physical delete or direct audit-insert access.
- Service-role credentials belong only in a trusted backend and are not needed
  to build or lint this frontend.

## Migration authoring rules

Add future changes as new timestamped migrations. Do not edit migrations already
applied to a shared environment. Keep schema-qualified security functions,
explicit `search_path`, deny-by-default RLS, synthetic fixtures, and accompanying
documentation updates.
