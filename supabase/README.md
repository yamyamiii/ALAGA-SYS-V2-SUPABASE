# Supabase Phase 1 database foundation

This directory contains the reviewable PostgreSQL source for ALAGA-SYS V2 Phase 1.

```text
supabase/
  migrations/  Eleven ordered schema, function, index, RLS, and grant migrations
  policies/     Reserved for supplementary reviewed policy notes/fragments
  seed.sql      Optional fictional development reference data
```

## Scope

The migrations create exactly seven public tables: `profiles`, `barangays`,
`puroks`, `households`, `residents`, `appointments`, and `audit_logs`. They also
create validated enums, number sequences, security helpers, timestamp/audit
triggers, indexes, restrictive RLS policies, and explicit API-role grants.

There are no clinical encounters, diagnoses, prescriptions, medicines,
immunizations, maternal records, reports, Auth UI, or frontend queries in this
phase.

## Applying migrations

The Supabase CLI was not installed during implementation, and the public project
URL/publishable key cannot apply DDL. Nothing in this directory has been claimed
as live-applied.

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

`seed.sql` contains one explicitly fictional barangay and eight fictional
puroks. It creates no Auth users, households, residents, contact information, or
healthcare data. It is idempotent by deterministic development UUID.

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
