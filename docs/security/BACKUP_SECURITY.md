# Backup Security

Backup archives contain protected resident and clinical information. Treat every downloaded ZIP as highly sensitive.

## Controls

- Only an active `admin` profile can use browser-facing RPCs and `backup-admin`; authorization is repeated server-side.
- Backup tables have RLS enabled, no browser table grants, and no permissive policies.
- The private Storage bucket has no browser object policies. Signed download URLs expire after 60 seconds.
- Worker and restore RPCs are executable only by `service_role`; the key remains an Edge secret.
- `BACKUP_SCHEDULER_TOKEN` and `BACKUP_SIGNING_KEY` must be independent random values of at least 32 characters.
- Every exported file has SHA-256 integrity. `checksums.json` is authenticated with HMAC-SHA-256, preventing an altered archive from being accepted merely by recomputing hashes.
- Uploads use an exact manifest, safe filename, compressed/expanded bounds, fatal UTF-8 decoding, JSON shape checks, forbidden-field checks, and version validation.
- Confirmation tokens are returned once, kept in browser memory, hashed in the database, and expire after 10 minutes.
- Operational errors expose only categories, never record contents, secrets, or query payloads.

## Custody

Download only to an approved encrypted device or encrypted offline store. Restrict access, record custody outside the archive, verify restoration in an isolated project, and securely destroy expired offline copies according to barangay policy. Do not email backup packages or place them in consumer cloud drives.

## Exclusions

Auth passwords/sessions/tokens, Storage objects, JWTs, API/service keys, environment variables, AI conversation content, audit payloads, notification delivery attempts, destinations, provider references, and runtime caches are never selected by the export RPC.
