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

## Cross-device validation

Test the administrator workflow at 360x800, 390x844, 430x932, 768x1024 portrait, 1024x768 landscape, 1366x768, and 1920x1080. At each viewport, verify the mobile drawer where applicable, manual backup, history actions, ZIP selection, restore preview scrolling, confirmation, Cancel, and signed download. Repeat an open restore preview through a brief app switch and an orientation change; the preview and typed confirmation must remain in memory.

The shared dialog uses `100dvh` with a `100vh` fallback, safe-area insets, contained scrolling, and a safe-area-aware action footer. The application shell constrains route width, long backup filenames wrap, reports wrap or scroll within their card, and actions expand on narrow phones. Dialog overlays are above the AI launcher, so the launcher cannot cover confirmation controls. All actions are available through click/touch and keyboard focus; no backup action depends on hover.

### Browser-specific limitations

- Current Chrome/Edge/Firefox on Windows, Chrome/Firefox/Safari on macOS, Chrome on Android, and Safari on current iOS/iPadOS are the supported targets. Older embedded WebViews may use the static `100vh` fallback and provide less precise keyboard resizing.
- iOS Safari may ignore the HTML `download` filename for a cross-origin signed URL and show its native preview or share/download sheet. The server-provided ZIP remains downloadable; keep the ALAGA-SYS tab open until the browser confirms the transfer.
- Mobile ZIP selection uses the operating system file picker. The package is still subject to the 25 MiB compressed limit, and low-memory devices may need the restore performed from a desktop.
- Backup creation is queued on every device. Closing the tab does not cancel server work; reopen Backup & Restore to see history.
- Browser printing is platform-dependent. Printable ALAGA-SYS dialogs keep **Download PDF** available when direct printing is unavailable or dismissed; the Backup & Restore workflow itself does not require printing.
