-- Phase 3A: add a neutral archival state for residents.
--
-- PostgreSQL does not allow a newly added enum value to be used until the
-- ALTER TYPE transaction commits. Registry functions and constraints that use
-- this value therefore live in the following migration.

alter type public.resident_status add value if not exists 'archived';
