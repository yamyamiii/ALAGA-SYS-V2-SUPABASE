# Supabase foundation

This directory reserves version-controlled locations for future Supabase work:

- `migrations/` for ordered PostgreSQL schema migrations
- `policies/` for reviewed Row Level Security documentation or source fragments
- `seed/` for safe synthetic development fixtures only

Phase 0 contains no schema, database table, policy, storage bucket, query, or seed
data. Do not add real resident or healthcare records here.

## Security rules

The browser application may use only the project URL and Supabase publishable
key. Never place a secret key or service-role key in the frontend, a `VITE_`
variable, this directory, Git history, logs, or documentation.

Row Level Security will be deny-by-default and reviewed alongside the schema in
Phase 1. Frontend route visibility and role metadata are not authorization.
