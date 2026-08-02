# ALAGA AI Assistant architecture

Phase 9A adds a general-assistance chat surface without granting a model access
to ALAGA-SYS data or actions. It uses Google's current `@google/genai` SDK and
the Gemini Interactions API from the authenticated `alaga-ai` Supabase Edge
Function.

## Request path

```text
Authenticated AppShell
  -> in-memory FloatingAiAssistant
  -> aiAssistantService
  -> Supabase functions.invoke("alaga-ai") with current JWT
  -> exact-origin CORS
  -> Supabase Auth getUser verification
  -> active profiles row and canonical role
  -> service-only atomic hourly rate limit
  -> strict conversation schema and deterministic safety checks
  -> Gemini Interactions API with fixed role/safety instruction and store=false
  -> bounded plain-text response
```

Pages and visual components never call Gemini. The browser knows no Gemini key,
model credential, service-role key, system instruction, database rate-limit
table, or provider response object.

## Stateless conversation

The component holds the welcome, user messages, and assistant messages only in
React memory. It sends a bounded, alternating text transcript on each request.
The local welcome is not sent. No interaction ID is accepted or returned, and
the provider request sets `store: false`; this avoids the Interactions API's
default server-side interaction retention.

Conversation state is cleared by explicit Clear, component unmount on logout or
account invalidation, a full page reload, and the keyed remount produced by a
profile ID or role change. Closing and reopening the panel preserves the draft
during the same authenticated page session. No application code writes chat
content to localStorage, sessionStorage, IndexedDB, a URL, PostgreSQL, logs, or
analytics.

## Role context

Only the canonical database role and an allowlist of high-level module names are
added to the fixed server instruction:

| Role                   | High-level guidance scope                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Administrator          | Administration and system module workflows; never unrestricted patient summaries                                        |
| Barangay Health Worker | Resident/household workflows, appointment review, announcements, inquiries                                              |
| Nurse                  | Assigned appointments, queue, and health-record workflow explanations                                                   |
| Midwife                | Assigned maternal/child, appointment, and health-record workflow explanations                                           |
| Resident               | Appointment requests, notifications, signed-record navigation, announcements, FAQ, health-center information, inquiries |

Frontend welcomes use the same boundaries for clarity, but the Edge Function
loads and enforces the role independently. Frontend role values are never sent
or trusted.

## Data boundary

The provider receives:

- one fixed medical/security system instruction;
- the canonical role;
- allowed high-level module names;
- the current bounded, user-supplied session transcript.

The function never queries or supplies residents, household members,
appointments, reasons, encounters, vital signs, diagnoses, treatment notes,
allergies, pregnancy/child records, reports, notifications, inquiries, names,
contact data, or other PHI. Likely email, phone, UUID, and ALAGA-SYS record-number
input is rejected locally with a privacy reminder. Detection is defense in
depth, not a guarantee that arbitrary user-entered sensitive text can always be
recognized.

## Reliability and limits

- JWT verification remains enabled at the gateway and `getUser()` validates the
  token again.
- Profile status and role are loaded through the service boundary before any
  provider call.
- Requests are capped by bytes, messages, user turns, per-message length, and
  total conversation characters.
- Provider work has a 20-second response boundary and an 800-token generation
  cap; returned text is limited to 4,000 characters.
- Provider and internal errors map to stable messages without raw SDK errors.
- The database counter is atomic per profile in fixed UTC hour windows. Its
  default is 20 requests per hour and its maximum configuration is 100.
- Responses use plain React text rendering. There is no HTML execution or
  `dangerouslySetInnerHTML`.

## Deliberately absent from Phase 9A

There are no tools, function calls, SQL execution, RAG/grounding, report
generation, navigation commands, health-record retrieval, appointment actions,
clinical decision support, diagnosis, prescription, dosage guidance, lab
interpretation, pregnancy determination, emergency assessment, or autonomous
action. Phase 9B may add narrowly reviewed grounding and navigation only after
separate authorization, privacy, and clinical-safety design.
