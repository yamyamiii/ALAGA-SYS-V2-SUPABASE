# Backup Deployment

Phase 12 is pending until Migration 33 and both Edge Functions are manually deployed. Do not deploy a scheduler until the live validation checklist passes.

## Secrets

Generate two independent values with a cryptographically secure password generator (at least 32 random bytes) and configure server-side only:

```text
BACKUP_SIGNING_KEY=<random signing key>
BACKUP_SCHEDULER_TOKEN=<different random scheduler token>
ALLOWED_ORIGINS=https://your-approved-app.example
```

`SUPABASE_URL`, a publishable key, and the secret/service-role key are injected by Supabase. Never use a `VITE_` prefix for either backup secret.

## Manual deployment

```bash
npx supabase db push
npx supabase secrets set BACKUP_SIGNING_KEY=... BACKUP_SCHEDULER_TOKEN=... ALLOWED_ORIGINS=https://your-approved-app.example
npx supabase functions deploy backup-admin
npx supabase functions deploy process-backups --no-verify-jwt
```

After deployment, invoke the worker only from a trusted scheduler using POST and header `x-backup-scheduler-token`. A one-minute cadence is suitable; the database enqueues automatic work only when due and claims jobs with `SKIP LOCKED`. Do not put the token in a URL, browser, log, or source file.

## Live validation

- Confirm the `alaga-backups` bucket is private and has no browser object policies.
- Confirm a resident receives access denied for the route, RPCs, and Edge endpoint.
- Create a manual backup, invoke the worker, download it, and verify filename/history/report.
- Modify a byte and verify restore rejects it.
- Validate a correct backup in an isolated recovery project with matching Auth users.
- Create a deliberate row conflict and verify no partial changes commit.
- Test daily scheduling with retention 1, then restore the production retention setting (default 7).
- Rotate both backup secrets after any suspected disclosure; old archives require the old signing key for validation, so handle rotation through an approved key-custody plan.
