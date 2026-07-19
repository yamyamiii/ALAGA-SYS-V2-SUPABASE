# Database documentation

Phase 1 defines the normalized PostgreSQL and Row Level Security foundation.

- [Schema and application guide](SCHEMA.md)
- [Relationships and textual ERD](RELATIONSHIPS.md)
- [Row Level Security matrix](RLS_MATRIX.md)
- [Complete data dictionary and indexes](DATA_DICTIONARY.md)

The migrations are under `supabase/migrations`, and the optional fictional
development reference seed is `supabase/seed.sql`. No migration was applied to a
live project during local implementation; see the schema guide for exact CLI and
SQL Editor instructions.
