# Backup and Restore Architecture

Phase 12 provides application-aware disaster recovery. It is intentionally not a PostgreSQL dump: a database-owned export RPC reads one MVCC snapshot of an explicit table allowlist, a scheduler-authenticated Edge worker writes a signed ZIP to the private `alaga-backups` bucket, and the administrator UI reads minimized job history through RPCs.

## Trust boundaries

- Browser: enqueue, view history, upload for validation, explicitly confirm, and request a 60-second signed download URL. It never receives a service key or direct table/Storage access.
- `backup-admin`: revalidates the JWT, active profile, and administrator role; validates archive limits, manifest, SHA-256 hashes, HMAC signature, versions, and payload shapes.
- `process-backups`: accepts only `BACKUP_SCHEDULER_TOKEN`, uses the service role server-side, creates packages, and enforces retention.
- Database: owns queue state, authorization, snapshot export, conflict handling, and the single-transaction restore.

## Approved data

The package includes profiles without Auth email/password data, locality metadata, households, residents, appointments, clinical encounters and vitals, allergies/history, maternal and child care, referrals, announcements, FAQ, health-center configuration, resident inquiries, notification preferences, and a versioned empty report-configuration document (reports currently have no persistent configuration).

It excludes Auth and Storage internals, audit rows, appointment-request event history, in-app/outbound delivery logs, AI rate limits/conversations, secrets, tokens, keys, environment configuration, and runtime caches. Resident photo objects are not included.

```text
ALAGA_BACKUP_YYYYMMDD_HHMMSS.zip
├── metadata.json
├── application_metadata.json
├── households.json
├── residents.json
├── appointments.json
├── health_records.json
├── maternal.json
├── children.json
├── announcements.json
├── faq.json
├── health_center.json
├── notification_preferences.json
├── referrals.json
├── reports_configuration.json
├── inquiries.json
└── checksums.json
```

Every data/metadata file is listed in `checksums.json` with SHA-256. The checksum manifest cannot recursively hash itself; its complete hash map is HMAC-SHA-256 signed, and the ZIP-level SHA-256 is retained in protected backup history.

## Restore model

Restore is merge-missing, not destructive replacement. Missing primary-key rows are inserted; identical rows are skipped; a differing row with the same key is a conflict and aborts the transaction. Household heads, appointment reschedule links, and encounter amendment links use an insert-then-link pass. User triggers are disabled only within the trusted transaction; foreign-key/system constraint triggers remain enabled. A failure rolls back imported rows, link updates, trigger state, sequence alignment, and restore status together.

Supabase Auth users must be independently recovered before profiles that reference them can be restored. This foundation does not delete target-only records.

## Limits

Archives are limited to 25 MiB compressed and 100 MiB expanded. Storage allows up to 100 MiB so future reviewed streaming work can raise the application limit. Very large deployments require a chunked/streaming Phase 12 follow-up.
