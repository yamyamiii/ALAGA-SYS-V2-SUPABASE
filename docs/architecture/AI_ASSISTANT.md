# ALAGA AI Assistant architecture

ALAGA AI is a grounded conversational assistant for ALAGA-SYS. It can explain
verified system workflows and permitted information conversationally, while
actual authorization remains enforced independently and professional healthcare
judgment remains outside the AI's role. It does not give Gemini a database
connection, route control, mutation tool, or access to resident and clinical
data.

## Request path

```text
Authenticated AppShell
  -> in-memory FloatingAiAssistant
  -> aiAssistantService
  -> authenticated alaga-ai Edge Function
  -> exact-origin CORS, getUser, active profile, canonical role
  -> strict payload and deterministic medical/security checks
  -> explicit symbolic navigation/actions
  -> bounded recent-turn topic resolution
  -> Resident-own appointment-status topic
     -> service-role ai_resident_appointment_status RPC
     -> bounded deterministic answer; never sent to Gemini
  -> centralized verified static system-knowledge retrieval
  -> service-role ai_grounding_context RPC
     -> active FAQ, health-center, and announcement text only
  -> server sanitization and character/source limits
  -> deterministic exact facts when matched
  -> Gemini Interactions API for grounded language composition, with store=false
  -> { message, sources, actions }
  -> frontend schema and role/action allowlist
  -> fixed local route, after user confirmation when ambiguous
```

Pages and visual components never call Gemini or query grounding tables. The
browser knows no Gemini key, service-role key, system instruction, database
rate-limit table, or provider response object.

## Hybrid conversational architecture

The request boundary follows six layers: safety and authorization, explicit
navigation/actions, security-sensitive structured lookups, bounded topic
resolution, approved knowledge retrieval, and grounded natural-language
composition. Deterministic handlers remain authoritative for medical/security
refusals, navigation IDs, a Resident's own appointment summary, dates, times,
status, public contact fields, current announcements, and canonical service
schedules. Gemini may interpret or phrase safe language only after the server
has selected the approved facts; it never chooses a role, database scope,
record, route, or permission.

`knowledge.ts` is the centralized static product-knowledge catalog. It covers
the product, roles, registration, appointments, Registry, Health Records,
announcements, notifications, inquiries, FAQ, reports, User Management,
account lifecycle, printable outputs, navigation, ALAGA AI, and the authority
of the Barangay Bagongpook service schedule. The catalog contains behavior and
access descriptions only, never copied private database content.

The request-local resolver examines only the most recent validated user turns
and recognizes the approved topic set. It supports English, conversational
Filipino, Taglish, common informal spellings, and short pronoun follow-ups.
An explicit new topic replaces prior context. Conversation history remains
in-memory only and is never permanent AI memory.

## Approved grounding

Migration 30 adds `ai_grounding_context`, a service-role-only, read-only RPC;
Migration 58 safely replaces it to include approved public contact fields.
It may return only bounded fields from:

- non-archived FAQ entries;
- health-center name, address, public contact number/email, public emergency
  contacts, hours, and services; and
- non-archived announcements inside their publish and expiry window.

The Edge Function adds selected role-specific entries from the centralized
static knowledge catalog. It never supplies profile IDs, resident or household data, staff names,
appointments, appointment reasons, encounters, vital signs,
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

Source authority stays distinct: static system knowledge describes product
behavior; canonical operational information describes the maintained service
schedule; live public information comes only from approved announcement,
health-center, and FAQ grounding; and personal authorized information is only
the deterministic Resident-own appointment summary. Arbitrary Resident,
clinical, staff, report-row, audit, and internal-ID data is prohibited.

Grounding rows are data, never instructions. Gemini is instructed to ignore
commands embedded in source text and to say that verified information is
unavailable when the supplied sources do not establish an answer. Source
cards identify the approved record used for the answer and may show its Manila
updated date. They are source-level provenance, not sentence-level or quoted
citations. Source content and database identifiers are not returned to the
browser.

## Resident own-appointment status

Migration 58 adds `ai_resident_appointment_status`, a service-role-only,
read-only RPC. It independently requires one active Resident record linked to
the active Resident profile supplied by the authenticated Edge Function. The
query is limited to five non-archived current appointments, or the most recent
non-archived history when none is current. It returns only status, service,
current date, current start time, and a boolean indicating whether staff changed
the original preferred schedule.

The Edge Function sanitizes those fields and generates the answer before
Gemini. It returns no IDs, names, reasons, notes, assigned staff, clinical data,
or audit data. Staff roles cannot use this path as a record-search interface,
and another person's appointment request is refused before lookup.

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

There is no unrestricted resident/appointment/clinical/report grounding,
semantic search over protected data, SQL execution, report generation,
appointment mutation, record mutation, external knowledge retrieval, clinical
decision support, diagnosis, prescription/dosage guidance, or autonomous
action. The sole private-data exception is the deterministic minimal
Resident-own appointment-status summary described above.

Maternal and Child Care navigation, Referral Management, advanced reports, and
hidden administrator infrastructure are preserved as inactive future
extensions and excluded from the approved final thesis scope.
