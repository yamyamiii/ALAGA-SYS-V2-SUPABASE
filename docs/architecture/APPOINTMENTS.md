# Appointment scheduling architecture

Phase 4 adds operational appointment scheduling, a daily queue, and a monthly
calendar. Phase 5.5 adds resident-originated appointment requests that remain
pending until staff review. It does not add notification delivery, diagnoses,
prescriptions, or automated triage.

## Boundaries

- Route pages and dialogs call appointment hooks only.
- Hooks use TanStack React Query and the reusable `appointmentService`.
- List, queue, calendar, search, history, and dashboard RPCs run as the caller
  and preserve Row Level Security.
- Browser mutations cannot write the `appointments` table directly. Trusted
  security-definer RPCs independently load the active database profile,
  authorize the action, validate the state transition, and write the audit
  event.
- The frontend permission map controls discoverability only. It is never the
  authority for role or ownership.
- Resident request RPCs derive ownership from `auth.uid()` and never accept a
  resident, staff, priority, status, or appointment type from the browser.

## Time model

`scheduled_date`, `start_time`, and `end_time` represent Brgy. Bagongpook
business time in `Asia/Manila`. Operational event timestamps remain
`timestamptz` and are formatted in `Asia/Manila` in the UI. Date-only helpers
avoid browser-timezone conversion.

Walk-ins must use the current Manila date. Other same-day appointments must
start in the future. The database enforces these rules independently of form
validation.

## Concurrency and idempotency

Every appointment has a monotonically increasing `version`. Mutation RPCs lock
the row and require the version last read by the client. A stale client receives
a retryable concurrency error rather than silently overwriting another tab.

Staff schedule validation takes a transaction-scoped PostgreSQL advisory lock
derived from the staff UUID and scheduled date, then checks interval overlap:

```text
existing.start < proposed.end AND existing.end > proposed.start
```

Only current, non-archived `pending`, `confirmed`, `checked_in`, and
`in_progress` appointments block a slot. This serializes concurrent attempts
for one staff member and day without preventing unrelated schedules.

Create and reschedule requests include random request UUIDs. A unique database
index makes retries idempotent. Rescheduling also has a unique
`rescheduled_from_id`, so one original can have only one replacement.

Resident submissions use the same request-key uniqueness plus advisory locks
for request-key and duplicate schedule serialization. They force a pending,
normal-priority, scheduled, unassigned appointment. An unassigned resident
request is a preferred schedule, not a reserved slot; staff-specific overlap
protection begins when authorized staff assign a person.

The original preferred date/time fields remain on resident-originated
appointments and are copied through atomic rescheduling.

## Data minimization

Appointment list, queue, calendar, staff search, resident search, history, and
dashboard responses omit appointment reasons, cancellation reasons, and
operational notes. Full text is loaded only in an authorized details request.
Audit snapshots use the existing safe appointment projection and omit these
free-text values; request metadata records changed field names only.

Resident-safe detail reads use a dedicated RPC that omits operational notes,
priority, other resident identities, and internal fields. The private
`appointment_request_events` table is an event boundary for future delivery;
it contains no reason, contact information, message body, or delivery status.

## Frontend routes

- `/appointments` — paginated list, filters, create, walk-in, details, and
  authorized lifecycle actions
- `/appointments/calendar` — 42-day month grid and mobile day agenda
- `/appointments/queue` — daily operational queue with 30-second polling while
  the page is open

Resident details include paginated scheduling history. The dashboard shows
RLS-filtered appointment totals and a five-row queue preview.

Residents receive only `/appointments`, rendered as their own appointment
cards with request and pending-cancellation actions. Calendar and queue routes
require separate staff permissions; the queue RPC also rejects residents.

## Deployment

Migration `20260720001800_appointment_workflows.sql` installs Phase 4. The
forward-only `20260720001900_fix_appointment_rpc_contracts.sql` explicitly casts
the database `varchar(100)` service label to the stable public `text` contract
and keeps staff-search validation inside its RLS-preserving RPC. Migration 19
must be reviewed and applied after Migration 18. No Edge Function is required.

Forward-only Migration
`20260720002200_resident_appointment_requests.sql` adds the resident request
RPCs, preferred-schedule metadata, staff review read model, request audit
semantics, and private event boundary. No Edge Function is required.
