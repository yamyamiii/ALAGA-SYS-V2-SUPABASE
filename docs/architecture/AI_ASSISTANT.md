# ALAGA AI Assistant architecture

ALAGA AI uses Gemini as the primary natural-language reasoning and response
engine for ordinary conversation. It is a read-only assistant, not a clinician,
a database agent, or an autonomous appointment operator.

## Production response pipeline

Previously, most requests returned before Gemini: greetings, product questions,
workflows, navigation, static knowledge, service schedules, announcement events,
and several contextual handlers each selected scripted text. Only the remaining
grounded questions reached the provider.

The current entrypoint is:

1. Validate exact-origin CORS; handle OPTIONS before authentication/configuration.
2. Verify the Auth user, active profile and canonical role. Consume the existing
   atomic per-profile hourly rate limit.
3. Validate the alternating, bounded conversation payload. Reject browser identity,
   role, tool arguments, URLs-as-actions, and unsupported request fields.
4. Run deterministic emergency, clinical-decision, privacy and injection checks.
   Blocked requests do not retrieve grounding or call Gemini.
5. Read the existing approved public grounding RPC and add the centralized static
   product/service knowledge. No ordinary keyword match is required.
6. Redact safety-sensitive history; send the bounded, separately labeled
   reference facts and untrusted transcript to Gemini Interactions with
   `store: false`, a server-configured model, structured JSON output, a
   50-second provider timeout and a 500-output-token limit.
7. Validate Gemini's proposed message, symbolic action IDs, source indexes and
   optional no-argument own-status read. Unknown tools/fields fail closed.
8. If an own-status read is requested, authenticate its scope outside the model,
   invoke the existing narrowly scoped RPC, and render the minimized result
   deterministically. Its private rows are never sent to Gemini.
9. Otherwise return Gemini's bounded conversational answer with validated actions
   and source metadata only. Reject unsupported contacts, URLs/record numbers,
   mutation-success claims, and recognized unsafe clinical output.
10. The frontend revalidates the response and action role allowlist, renders plain
    React text, and waits for deliberate user activation.

`conversation.ts` owns orchestration and the model response contract.
`index.ts` owns authentication, privileged client creation, approved RPC access,
provider IO, rate limiting, CORS, minimized logging and safe errors.
`domain.ts` retains shared safety/validation and compatibility-tested legacy
resolvers, but ordinary scripted response resolvers are no longer called by
the production entrypoint. There is no provider API key in the browser.

## Verified facts and bounded context

`knowledge.ts` centralizes verified role/workflow facts, including Resident
registration, automatic appointments, fixed health events/FIFO waitlists,
notifications, inquiries, Reports, Registry, Health Records, User Management,
account lifecycle, navigation, and Bagongpook service schedules.

Gemini receives the same bounded catalog for ordinary questions, including
paraphrases and short yes/no follow-ups. It reasons over conversation history
rather than selecting a prewritten answer by regex. It should answer the
current question concisely in English, Filipino or Taglish, switch topics when
asked, and ask a clarification when context is insufficient. Agreeing to an
explanation never authorizes booking/cancellation. Non-ALAGA-SYS questions receive
a conversational scope-aware response rather than invented local facts.

Static catalog JSON is capped at 20,000 characters. Public grounding retains the
6,000-character and 12-source limits; the combined packet has at most 12 sources.
Public rows are interleaved across health-center, announcement and FAQ types
before truncation (at most 1,500 content characters per public row), so a long FAQ
list cannot crowd all announcements out. These are bounded snapshots, not a
complete search result. Source cards indicate supplied supporting records, not
independently verified sentence-level citations.

## Read tools and trusted boundaries

- `ai_grounding_context`: existing service-role-only, read-only RPC. The actor
  is always the profile established from the verified session. Approved public
  health-center fields, non-archived FAQ entries and currently published,
  unexpired, non-archived announcements only. No private clinical/report rows.
- `ai_resident_appointment_status`: existing service-role-only RPC. Requires
  an active linked Resident and returns at most five minimized own-appointment
  rows: service, status, current date/start time and schedule-changed boolean.
  No IDs, numbers, names, staff identities, reasons, notes or clinical data.
  Gemini can propose only the tool name, never a Resident/profile ID or filters.
  Staff roles cannot use it for arbitrary record searches.
- Symbolic navigation/form actions: model suggestions only. The server constructs
  canonical types/labels from allowlisted IDs and role. The frontend repeats
  authorization and maps IDs to fixed routes. Opening an empty booking form
  does not book anything. All operational writes remain in existing,
  user-confirmed forms and trusted appointment/event RPCs.

The existing Resident availability/catalog RPCs and health-event list/booking
RPCs are auth.uid()-scoped application boundaries, not generic service-role AI
tools. They are deliberately not invoked with a privileged identity on behalf
of a user. Live slots, staff availability, event seats, waitlist position and
personal event bookings are not provided to Gemini. The assistant directs
users to the authorized booking/event screen to verify them.

No migration or new database grant is needed. Applied migrations through 107,
RLS, appointment automation, notifications and realtime behavior are unchanged.

## Appointment, event and announcement semantics

Valid AUTO_SLOT self-bookings are automatically assigned and Confirmed after
trusted capacity/schedule checks; routine Admin approval is not required.
Postpartum Home Visit requires health-center coordination. Staff retain
exception/legacy-pending handling, walk-ins, rescheduling and cancellation.
Rescheduling preserves the appointment row and APT number.

Fixed health events have a common date/time window, published booking window
and capacity. Residents deliberately Book or Join waitlist. Joining the FIFO
waitlist is not a confirmed seat; the trusted workflow promotes eligible
bookings when capacity becomes available. The assistant never claims a seat.

Canonical schedules: General Consultation on regular service days/every day;
Buntis/Prenatal on Tuesday; Maternal Care on the first Tuesday; Immunization on
the first Wednesday; Family Planning on Thursday; postpartum coordinated home
visit after childbirth. These do not establish clinic opening/closing hours.
The 08:00–16:00 appointment-start window is a booking rule, not official hours.

Announcements are revalidated against the server time and ordered by
`publish_at DESC`, not edit time. Publication, event start/end and expiration
are kept distinct. Future/expired announcements do not enter the current
packet. A still-current announcement may describe an already-ended event;
publication is not evidence of live booking capacity. Dates are explained in
Asia/Manila. Official contacts/hours must be present in approved public facts;
missing values must not be invented.

## Privacy, safety and session handling

Emergency guidance, medical/security refusals, authentication, role checks,
rate limits, tool validation and private-summary rendering stay deterministic.
Clinical diagnosis, prescribing/dosage advice, interpretation of personal
measurements and arbitrary private-record retrieval remain prohibited.
The provider has no database credentials, SQL tool or mutation tool.

Transcript/source content is untrusted data. Content is JSON-escaped within
labeled sections and the system instruction is separately supplied. Historical
messages matching safety/privacy checks are omitted. Ordinary assistant text
can never prove that a tool was run or grant permissions.

Private summaries are displayed locally but carry a fixed neutral
`contextMessage`. The frontend preserves that marker and sends it instead of
the private answer on later turns. The server also redacts recognized historical
private replies. This marker is only a privacy aid, never authorization.
Raw free-text cannot be perfectly classified; the UI warns against entering
personal information and recognized identifiers/clinical narratives are blocked.

Conversation and drafts remain in React memory only, never localStorage,
sessionStorage, IndexedDB, URLs or database chat tables. Clear/New conversation,
logout, account invalidation, profile changes and full refresh clear session
state. Closing the panel retains only the current in-memory draft.

Logs contain request ID, canonical role, category, latency and timestamp, not
prompts, answers, record contents, tokens or keys. Browser errors use safe known
copy and retain validated CORS headers. Provider failures, timeouts, malformed
JSON and unsupported output fail safely, without a false success or automatic
email/booking retry. Existing synchronous UI submission guards remain intact.

## Verification and production UAT

### Request deadlines and timeout diagnosis

The Edge request has a 70-second abort budget including Auth, profile, rate-limit,
grounding and generation work. Generation has its own 50-second abort deadline;
the SDK receives that signal and timeout explicitly. SDK retries and automatic
continuation are disabled: one generation attempt per deliberate chat request,
with manual user retry after a safe error rather than speculative duplicate
billable calls. The browser has an 80-second deadline and aborts its invocation.
The previous 20-second Promise race did not cancel upstream generation, and the
previous browser deadline was 25 seconds. Increasing the budget accommodates
slower responses but does not prove why a production model was slow.

Operational logs additionally record auth/profile/rate/grounding/provider timings,
validated model identifier, upstream status category, timeout category and zero
retry count. No prompts, responses or secret values are recorded. Secret names
can be checked with the read-only CLI; a secret-name/digest listing cannot verify
the configured model value or its accessibility. Model identity/access and real
latency require production UAT after deployment. HTTP 401/403/404 are configuration
errors, 429/5xx are upstream unavailability, and application aborts are deadlines.

Unit tests mock the provider to verify routing, context packets, tool isolation,
role/action filtering, errors and privacy. They do not prove real Gemini answer
quality. The actual Edge entrypoint is executed with external Auth/database/
provider IO replaced in handler tests. Deno checks the real SDK types; domain
tests and existing database-safety/integration tests preserve trusted boundaries.

Before production acceptance, deploy the Edge and frontend together, then use
test accounts for real multi-turn English/Tagalog/Taglish conversations. Verify
greetings and short replies, auto-confirmation versus exceptional pending
requests, service days versus missing official hours, event booking/waitlists,
current announcement date distinctions, role-specific actions, own-status
privacy on later turns, and provider/rate-limit recovery. Confirm through
content-free function logs that ordinary requests reach the provider.

Generative answers may still be inaccurate despite grounding and output checks.
Do not describe mocked tests as live Gemini UAT. More ordinary requests now call
Gemini, increasing provider usage/latency while the existing request limit
remains unchanged. The 500-token response budget can cause a safe malformed-output
error on an overly long response. No online search or unrestricted operational/
clinical access has been added.
