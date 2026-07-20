# Database documentation

Phase 1 defines the normalized PostgreSQL and Row Level Security foundation.
Phase 2B adds forward-only trusted account-management support and an internal
rate-limit table without adding healthcare records.

- [Schema and application guide](SCHEMA.md)
- [Relationships and textual ERD](RELATIONSHIPS.md)
- [Row Level Security matrix](RLS_MATRIX.md)
- [Complete data dictionary and indexes](DATA_DICTIONARY.md)

The twelve migrations are under `supabase/migrations`, and the optional fictional
development reference seed is `supabase/seed.sql`. A linked-project dry run
confirmed migration 12 as the only pending migration; it was not live-applied.
See the schema guide for the exact CLI and SQL Editor instructions.
