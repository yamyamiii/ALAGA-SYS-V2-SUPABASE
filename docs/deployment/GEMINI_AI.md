# Gemini AI deployment

The repository contains the Phase 9A-9C ALAGA AI source and its Migration 29-30
database dependencies. Source presence does not prove that either migration,
the current `alaga-ai` Edge Function revision, or its hosted secrets have been
deployed. Confirm the linked project state before a manual rollout.

## Runtime requirements

The function uses the official `@google/genai` JavaScript SDK major version 2
and the Gemini Interactions API. Google documents Interactions support in SDK
2.3.0 and newer and recommends it for new applications:
<https://ai.google.dev/gemini-api/docs/interactions-overview>.

The reviewed project baseline is `gemini-3.6-flash`; this is not a claim that it
is Google's newest Flash model. Runtime source contains no fallback model; set
`GEMINI_MODEL` explicitly so model replacement does not require a code change.
Review Google's current model and deprecation pages before every rollout:
<https://ai.google.dev/gemini-api/docs/models>.

## Required secrets

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ALLOWED_ORIGINS` — the shared comma-separated exact-origin allowlist used by
  browser-facing Edge Functions, with no wildcard or path

Optional configuration:

- `AI_MAX_REQUESTS_PER_HOUR` — integer 1–100; default `20`
- `AI_MAX_INPUT_CHARACTERS` — integer 2,000–20,000; default `8000`

The system instruction asks Gemini for concise, conversational plain text.
Short paragraphs are preferred; simple numbered lists or hyphen bullets are
used only when helpful. Decorative separators and routine Markdown emphasis are
discouraged. The browser renders returned content as text rather than executable
HTML.

Standard Supabase-provided server values are also required:
`SUPABASE_URL`, a publishable/anon key, and a secret/service-role key. Never
create `VITE_GEMINI_API_KEY`, place any secret in `.env.local`, commit a secret
file, paste it into logs, or return it to a browser.

## Manual deployment

From the reviewed repository and linked project:

```bash
npx supabase secrets set GEMINI_API_KEY=REPLACE_SECURELY
npx supabase secrets set GEMINI_MODEL=gemini-3.6-flash
npx supabase secrets set ALLOWED_ORIGINS=https://alaga-sys.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5175,http://192.168.1.16:5173
npx supabase secrets set AI_MAX_REQUESTS_PER_HOUR=20
npx supabase secrets set AI_MAX_INPUT_CHARACTERS=8000

npx supabase functions deploy alaga-ai
npx supabase functions list
```

Confirm Migration 30 is already present before deploying the updated function.
The function expects the service-role-only `ai_grounding_context` RPC. Do not
use `--no-verify-jwt`.

Use the Dashboard or an approved secret manager instead of command arguments
when shell-history policy requires it. Do not use `--no-verify-jwt`;
`supabase/config.toml` explicitly keeps JWT verification enabled.

## Live verification

1. Confirm Migrations 1-30 are already applied and unchanged. Phase 9C should
   not add a pending migration.
2. Confirm anonymous and invalid-token requests are denied.
3. Confirm a missing, invited, inactive, suspended, or unsupported profile is
   denied before Gemini is called.
4. Test each active canonical role and verify its welcome and module boundary.
5. Send an unapproved Origin and no Origin; both must be denied.
6. Test unknown fields, invalid roles, blank input, long input, oversized bodies,
   non-alternating history, and excessive turns.
7. Reach the hourly limit with a fictional account and verify HTTP 429 plus a
   safe retry time. Confirm another profile retains its own allowance.
8. Simulate provider timeout, quota, authentication, and server failures; no raw
   provider error or key may appear in the response or logs.
9. Ask for diagnosis, dosage, pregnancy determination, lab interpretation,
   emergency assessment, system prompts, keys, SQL, and another resident's
   records. Verify safe refusals.
10. Confirm no prompts or responses appear in PostgreSQL, browser storage, URLs,
    function logs, or AI Studio interaction storage. The request must contain
    `store: false`.
11. Confirm Clear, logout, account invalidation, role change, and full reload
    remove the conversation; closing and reopening during the same session keeps
    it.
12. Ask for current FAQ, health-center services/hours, and current
    announcements. Verify source badges appear and no IDs, contacts, authors,
    resident data, or clinical data is returned.
13. Ask to open one allowed destination for each role. Verify the response has
    only a symbolic action ID and the client opens its fixed route after a
    click.
14. Ask for an unauthorized page, an unknown page, a raw route, and an external
    URL. Verify none navigates. Ask for two destinations and verify an explicit
    choice is required. Go offline and verify action buttons are disabled.
15. Ask for hours, services, and announcements in English, Filipino, and
    Taglish. Verify exact configured facts, natural uncertainty, and that these
    deterministic matches do not require Gemini.
16. Verify role-aware starters, Copy, Retry, confirmed Clear/New conversation,
    keyboard focus return, 390px layout, and privacy-safe error copy.

## Rollback

Undeploy or disable the Edge Function first if unsafe behavior is found. The
rate-limit table contains no conversation content, and Migration 30 creates no
table or stored content. A database rollback requires a separate reviewed
forward-only migration; never edit or revert applied migrations.
