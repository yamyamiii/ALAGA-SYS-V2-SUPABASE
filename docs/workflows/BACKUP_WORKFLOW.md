# Backup Workflow

## Manual backup

1. Sign in as an active Administrator and open **Backup & Restore**.
2. Select **Create Backup**. The request is queued immediately; the page remains usable.
3. Invoke the protected backup processor through the approved scheduler/operations channel.
4. Watch history move from `queued` to `processing` to `completed`.
5. Confirm checksum status is `verified`, then select **Download**.
6. Store the ZIP in approved encrypted custody and retain its history entry.

If generation fails, use **Retry**. Retry creates a new auditable job; it does not overwrite the failed entry.

## Automatic backup

Choose disabled/daily/weekly/monthly and retention 1–30 (default 7), then save. Automatic runs are anchored at 2:00 AM in `Asia/Manila`; the database stores the resulting instant as `timestamptz`. This configures database state only. A scheduler must invoke `process-backups`; Phase 12 does not deploy one automatically. Retention applies only to completed automatic backups and deletes the private object before marking its history row deleted. Manual backups are not automatically removed.

## Integrity report

Completed history records package SHA-256, file count, record counts, size, duration, checksum status, and excluded domains. The archive contains per-file hashes plus its HMAC authenticity signature.
