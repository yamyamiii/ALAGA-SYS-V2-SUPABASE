# ALAGA-SYS production security checklist

Status: release gate for Phase 13. Complete this checklist in the production Supabase and hosting projects; repository defaults do not change hosted settings automatically.

## Release gates

- [ ] Review and apply the linked project's pending Migrations 32, 33, and 34, in order, with `npx supabase db push` during an approved maintenance window.
- [ ] Redeploy `alaga-ai`, `manage-user`, `backup-admin`, `process-backups`, and `process-notification-jobs` after setting and independently reviewing their secrets.
- [ ] Confirm migrations 1–33 remain byte-identical. The 2026-08-04 linked dry-run reported Migrations 32, 33, and 34 pending; investigate any different list before deployment.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run db:verify`, `npm audit --omit=dev --audit-level=high`, and `git diff --check` from a clean release checkout.
- [ ] Record the release commit, migration output, Edge Function versions, approver, operator, and rollback owner.

## Supabase Auth and sessions

- [ ] Disable public and anonymous sign-up. Create staff only through the trusted administrator workflow.
- [ ] Set JWT expiry to 900 seconds, enable refresh-token rotation, and keep the reuse interval at 10 seconds or less.
- [ ] Enable secure password changes and require lower/upper-case letters plus digits with at least eight characters. Apply a stronger organizational password policy if required.
- [ ] Configure CAPTCHA or an upstream bot/WAF control for public login abuse. Keep the Supabase sign-in rate limit at 30 per five minutes per IP or lower.
- [ ] Use exact HTTPS site and redirect URLs; remove localhost URLs from the hosted Auth allowlist.
- [ ] Verify suspended, inactive, deleted, missing-profile, unsupported-role, and unlinked-resident sessions are rejected on login, refresh, direct REST/RPC calls, and Edge Functions.
- [ ] Document the residual stateless access-token window. For urgent compromise, suspend the profile immediately and revoke Auth sessions; application RLS checks account status independently of token refresh.
- [ ] Enable MFA for administrators when the selected Supabase plan and operational process support it.

## Database, RLS, and RPCs

- [ ] Confirm RLS is enabled on every managed public table and no policy uses unconditional `USING (true)` or `WITH CHECK (true)`.
- [ ] Test each role with direct REST/RPC calls, not only through hidden UI controls.
- [ ] Confirm a resident receives zero rows for another resident, household, appointment, encounter, vital sign, pregnancy, child record, notification, inquiry, referral, and printable document.
- [ ] Confirm inactive/suspended resident helpers return null and notification preference RPCs return SQLSTATE 42501.
- [ ] Confirm privileged mutation functions are revoked from `anon` and `authenticated` unless the function is an intentionally narrow user workflow.
- [ ] Confirm every security-definer function uses an empty fixed `search_path`, validates the active role, and returns a minimal data contract.
- [ ] Keep physical DELETE unavailable to browser roles. Use reviewed archive/restore workflows and semantic, minimized audit records.
- [ ] Run linked database lint and review warnings before release: `npx supabase db lint --linked --level warning`.

## Edge Functions, CORS, and secrets

- [ ] Set `ALLOWED_ORIGINS` and `AI_ALLOWED_ORIGINS` to comma-separated exact HTTPS origins only: no wildcard, path, query, credentials, or trailing slash.
- [ ] Verify browser-facing functions reject a missing or unapproved Origin and scheduler functions reject browser Origin headers.
- [ ] Keep `verify_jwt = true` for `alaga-ai`, `manage-user`, and `backup-admin`. Scheduler functions must additionally require their independent 32+ character secret tokens.
- [ ] Store service-role, Gemini, provider, signing, and scheduler keys only as Supabase secrets. Never use a `VITE_` prefix for a secret.
- [ ] Rotate service-role and provider keys after any suspected leak. Keep separate development, staging, and production values.
- [ ] Confirm responses carry `Cache-Control: no-store`, CSP `default-src 'none'`, `nosniff`, `no-referrer`, and a restrictive permissions policy.
- [ ] Verify request size, content-type, timeout, idempotency, and database rate-limit enforcement for every privileged action.

## Hosting and browser headers

- [ ] Serve only over HTTPS. Configure HSTS at the hosting layer after confirming all production subdomains support HTTPS.
- [ ] Configure the repository CSP as an HTTP response header. Keep `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and exact Supabase `connect-src`/`img-src` hosts.
- [ ] Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `X-Frame-Options: DENY` (or CSP `frame-ancestors`).
- [ ] Do not add `'unsafe-eval'`. The current `'unsafe-inline'` allowance is limited to styles; replace it with nonces/hashes if the hosting pipeline can do so safely.
- [ ] Confirm the production bundle has no source maps containing application secrets and no development diagnostics.

## PHI, files, documents, and exports

- [ ] Keep resident photos and backup packages in private buckets. Verify signed URLs are short-lived and object paths cannot be chosen by the browser.
- [ ] Verify JPEG/PNG/WebP photo MIME type, five-megabyte limit, magic bytes, generated UUID paths, and photo access by every role.
- [ ] Verify backup ZIP size, safe filename, manifest schema, checksums, signature, allowed entry paths, one-time restore confirmation token, and staging cleanup.
- [ ] Confirm CSV formula protection, PDF text rendering, and report/export field allowlists. Exports must not broaden the query's RLS scope.
- [ ] Test printable documents for own-record resident access and assigned/authorized clinical staff access. Confirm direct ID substitution returns permission denied or no data.
- [ ] Never place clinical narratives in URL parameters, localStorage, sessionStorage, client logs, provider logs, notification templates, or AI grounding.
- [ ] Define download retention, workstation storage, printing, secure disposal, and breach-response procedures for exported PHI.

## AI and outbound notifications

- [ ] Confirm deterministic refusals for prompt override, secret/database/SQL requests, impersonation, cross-resident access, identifiers, vital signs, diagnosis, pregnancy details, and clinical/document contents.
- [ ] Confirm Gemini receives only untrusted chat text plus allowlisted non-PHI grounding, uses `store: false`, and has no database or navigation tools.
- [ ] Confirm action IDs are server- and frontend-allowlisted by role; never accept arbitrary URLs from the model.
- [ ] Confirm AI logs contain request ID, role, category, latency, and timestamp only. Do not log actor IDs or content.
- [ ] Confirm notification content comes from fixed templates, HTML is escaped, recipient contact is revalidated immediately before delivery, provider requests are idempotent, and logs contain no recipient identifier or destination.
- [ ] Keep provider failure responses generic and review dead-letter/manual retry access as an administrator.

## Backup, monitoring, and operations

- [ ] Configure encrypted external backup retention separately from Supabase platform backups. Test restore in an isolated project before any production restore.
- [ ] Require two-person approval for production restore, verify the confirmation phrase/token out of band, and retain a change ticket.
- [ ] Alert on repeated 401/403/429 responses, administrator lifecycle failures, backup/restore failures, notification delivery spikes, and AI rate-limit anomalies without recording PHI.
- [ ] Set log retention and access controls. Operators should see request/job IDs and safe categories, not clinical content or raw recipient data.
- [ ] Maintain an incident contact tree, key-rotation procedure, breach assessment workflow, and recovery-time/recovery-point objectives.
- [ ] Run the role penetration matrix and a restore drill before go-live and after material authorization/schema changes.

## Sign-off

Production approval requires: application owner, security reviewer, database operator, clinical/privacy owner, and deployment operator. Any unchecked release gate needs a documented risk acceptance, owner, and due date.
