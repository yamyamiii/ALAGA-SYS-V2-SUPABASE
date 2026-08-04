# Restore Workflow

1. Prepare an isolated or approved recovery Supabase project at schema version 33.
2. Recover required Supabase Auth users separately. Auth data is not in the package.
3. Sign in as an active Administrator, open **Backup & Restore**, and select **Validate backup**.
4. Review version, timestamp, file manifest, resident/appointment/clinical/maternal/child counts, and warnings. This is the dry run.
5. Resolve incompatibility or custody concerns. Never bypass a checksum, HMAC, or version error.
6. Type `RESTORE` and confirm within 10 minutes.
7. The Edge function revalidates the staged bytes and digest, then calls one transactional restore RPC.
8. Review the restore report: duration, per-table restored/skipped counts, warnings, integrity status, and rollback mode.
9. Manually test authentication links, registry, appointments, clinical timelines, maternal/child records, referrals, public information, and notification preferences.

Any primary-key row that differs from the package is a conflict. No partial import is committed. Target-only rows are retained. Explicit Cancel, token expiry, failed validation, or failed confirmation performs no restore.

Validated staging objects expire after 10 minutes. The backup worker deletes expired, cancelled, failed, and completed staging objects and records the minimized cleanup timestamp.

Resident photos, Auth credentials, audit history, delivery history, and AI/runtime state require their own approved recovery procedures or deliberate reconstruction.
