# Appointment scheduling architecture

Phase 4 adds operational appointment scheduling, a daily queue, and a monthly
calendar. It does not create clinical encounters, diagnoses, prescriptions,
notifications, health records, or automated triage.

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

## Data minimization

Appointment list, queue, calendar, staff search, resident search, history, and
dashboard responses omit appointment reasons, cancellation reasons, and
operational notes. Full text is loaded only in an authorized details request.
Audit snapshots use the existing safe appointment projection and omit these
free-text values; request metadata records changed field names only.

## Frontend routes

- `/appointments` — paginated list, filters, create, walk-in, details, and
  authorized lifecycle actions
- `/appointments/calendar` — 42-day month grid and mobile day agenda
- `/appointments/queue` — daily operational queue with 30-second polling while
  the page is open

Resident details include paginated scheduling history. The dashboard shows
RLS-filtered appointment totals and a five-row queue preview.

## Deployment

Migration `20260720001800_appointment_workflows.sql` is forward-only and must be
reviewed before it is applied. The frontend can be deployed only after the
migration is present; no Edge Function is required by this phase.
