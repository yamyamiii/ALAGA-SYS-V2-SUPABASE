# ALAGA AI Assistant architecture

Phase 9C polishes the authenticated assistant with narrowly approved,
read-only grounding, deterministic fact responses, and deterministic navigation. It does not give Gemini a
database connection, route control, mutation tool, or access to resident and
clinical data.

## Request path

```text
Authenticated AppShell
  -> in-memory FloatingAiAssistant
  -> aiAssistantService
  -> authenticated alaga-ai Edge Function
  -> exact-origin CORS, getUser, active profile, canonical role
  -> strict payload and deterministic medical/security checks
  -> deterministic navigation parser (before Gemini)
     -> symbolic action IDs only
  -> service-role ai_grounding_context RPC
     -> active FAQ, health-center, and announcement text only
  -> server sanitization and character/source limits
  -> deterministic hours/services/current-announcement synthesis when matched
  -> Gemini Interactions API with store=false
  -> { message, sources, actions }
  -> frontend schema and role/action allowlist
  -> fixed local route, after user confirmation when ambiguous
```

Pages and visual components never call Gemini or query grounding tables. The
browser knows no Gemini key, service-role key, system instruction, database
rate-limit table, or provider response object.

## Approved grounding

Migration 30 adds `ai_grounding_context`, a service-role-only, read-only RPC.
It may return only bounded fields from:

- non-archived FAQ entries;
- health-center name, address, hours, and services; and
- non-archived announcements inside their publish and expiry window.

The Edge Function adds role-specific workflow descriptions from static server
code. It never supplies profile IDs, resident or household data, names,
contacts, appointments, appointment reasons, encounters, vital signs,
diagnoses, allergies, pregnancy/child records, reports, inquiries, audit logs,
authors, or clinical narratives. Grounding is loaded live for each eligible
request, sanitized again at the Edge boundary, capped by source count and total
characters, and placed in a section separate from the untrusted transcript.

Operating-hours, service-list, and current-announcement questions are answered
directly from the sanitized live values without calling Gemini. This prevents
the model from paraphrasing or inventing these high-confidence operational
facts. English, Filipino, and common Taglish intents share this path. FAQ and
workflow questions continue through the bounded provider path when no
deterministic response applies.

Grounding rows are data, never instructions. Gemini is instructed to ignore
commands embedded in source text and to say that verified information is
unavailable when the supplied sources do not establish an answer. Source
cards identify the approved record used for the answer and may show its Manila
updated date. They are source-level provenance, not sentence-level or quoted
citations. Source content and database identifiers are not returned to the
browser.

## Safe navigation

Navigation is deterministic and runs before Gemini. The server maps supported
phrases to symbolic action IDs, checks each ID against the canonical role, and
never accepts or emits a raw route or URL. Unknown, unauthorized, or URL-like
requests are rejected. Ambiguous requests return confirmation-required action
choices rather than navigating immediately.

The frontend validates the structured response, discards malformed actions,
rechecks the action against its own role allowlist, and maps it to a fixed local
route. Gemini cannot create a new route, URL, action ID, or permission. See
[AI navigation](../workflows/AI_NAVIGATION.md).

The final-scope registry includes appointment requests, Appointments,
Appointment Calendar, Daily Queue, Residents for Administrator/BHW, basic
Health Records, Announcements, basic Reports for Administrator/BHW, and
Administrator-only User Management. FAQ, health-center information, and
inquiries remain safe secondary assistance destinations. Maternal/child,
household, referral, audit, backup, settings, and advanced-report actions are
not registered on either side of the boundary.

## Stateless conversation

Messages remain only in React memory. Role-aware starters submit ordinary
bounded user messages. The client sends a bounded alternating
text transcript on each request. No interaction ID is accepted or returned,
and provider requests use `store: false`.

Clear and New conversation require confirmation. Conversation state is cleared
by either confirmed action, component unmount on logout
or account invalidation, a full reload, and profile/role changes. Closing the
panel preserves the draft only for the current authenticated page session. No
application code writes chat or grounding content to localStorage,
sessionStorage, IndexedDB, URLs, PostgreSQL, logs, or analytics.

## Role context

Only the canonical database role and approved high-level module descriptions
are used. Administrator, BHW, Nurse, Midwife, and Resident each receive a
separate server navigation allowlist. Frontend role values are never sent or
trusted.

## Reliability and limits

- JWT verification remains enabled at the gateway and `getUser()` validates
  the token again.
- Active profile and canonical role are established before grounding or model
  access.
- The existing atomic fixed-UTC-hour per-profile rate limit remains in place.
- Input, transcript, grounding, provider output, and response arrays are
  bounded.
- Provider calls retain the Phase 9A timeout and error normalization.
- Responses are rendered as plain React text; no HTML is executed.
- A synchronous client guard prevents duplicate in-flight submissions.
- Provider errors are mapped from known codes to local privacy-safe copy; raw
  server, provider, and database messages are never displayed.
- Copy response uses the browser clipboard and does not persist the message.
- Navigation is disabled while offline and never performs a mutation.

## Deliberately absent

There is no resident/clinical/report grounding, semantic search over protected
data, SQL execution, report generation, appointment mutation, record mutation,
external knowledge retrieval, clinical decision support, diagnosis,
prescription/dosage guidance, or autonomous action.

Maternal and Child Care navigation, Referral Management, advanced reports, and
hidden administrator infrastructure are preserved as inactive future
extensions and excluded from the approved final thesis scope.
