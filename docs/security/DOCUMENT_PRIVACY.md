# Printable document privacy

Printable documents are protected data views, not browser-authored records.
Every preview opening invokes a narrow database RPC that rechecks the active
profile, canonical role, record ownership/assignment, record state, and current
masking rules.

## Controls

- No browser role or resident ID is trusted.
- No service-role or secret key exists in frontend code.
- Direct access to `clinical_referrals` is revoked from browser roles.
- Clinical documents use only signed/amended or finalized source records.
- Document payloads omit raw UUIDs, audit fields, operational notes, and
  unrelated history.
- Referral mutation is RPC-only, idempotent, versioned, and immutable after
  finalization.
- Payloads and generated PDFs are not stored in web storage, uploaded, logged,
  analyzed, or sent to Gemini.
- React renders text normally; no `dangerouslySetInnerHTML` is used.
- Filenames are locally generated from database identifiers and sanitized.

Clinical documents display: “Confidential healthcare document. Handle
according to approved health-center privacy and records policies.” Appointment
slips use a scheduling-specific private-document notice.

For a defense demonstration, sign in as each role, attempt an authorized own or
assigned document, then tamper with the RPC UUID in browser tools. The database
must return not-found or permission-denied. Repeat as another resident and with
draft/cancelled records. Inspect storage and network activity to confirm that no
document payload is persisted or sent to an AI/PDF service.
