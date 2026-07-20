# Database documentation

Phase 1 defines the normalized PostgreSQL and Row Level Security foundation.
Phase 2B adds trusted account management. Phase 3A adds forward-only household
and resident registry workflows without adding clinical records.

- [Schema and application guide](SCHEMA.md)
- [Relationships and textual ERD](RELATIONSHIPS.md)
- [Row Level Security matrix](RLS_MATRIX.md)
- [Complete data dictionary and indexes](DATA_DICTIONARY.md)
- [Registry architecture](../architecture/RESIDENT_REGISTRY.md)

Fourteen migrations are under `supabase/migrations`, and the optional fictional
development reference seed is `supabase/seed.sql`. Phase 3A migrations 13 and 14
must be reviewed in a linked-project dry run and explicitly approved before a
live apply. See the schema guide for exact CLI and SQL Editor instructions.
