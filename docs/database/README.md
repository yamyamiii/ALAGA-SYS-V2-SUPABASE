# Database documentation

Phase 1 defines the normalized PostgreSQL and Row Level Security foundation.
Phase 2B adds trusted account management. Phase 3A adds forward-only household
and resident registry workflows without adding clinical records.
Phase 3B adds private resident-photo policies, trusted profile linking,
paginated household selection, duplicate review, and archive safeguards.
The next forward-only migration reconciles the original fictional barangay seed
with the canonical Bagongpook deployment while preserving registry references.

- [Schema and application guide](SCHEMA.md)
- [Relationships and textual ERD](RELATIONSHIPS.md)
- [Row Level Security matrix](RLS_MATRIX.md)
- [Complete data dictionary and indexes](DATA_DICTIONARY.md)
- [Registry architecture](../architecture/RESIDENT_REGISTRY.md)

Seventeen migrations are under `supabase/migrations`, and the optional synthetic
development reference seed is `supabase/seed.sql`. Any pending migration must be
reviewed in a linked-project dry run and explicitly approved before a live
apply. See the schema guide for exact CLI and SQL Editor instructions.
