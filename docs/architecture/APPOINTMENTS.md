# Appointment scheduling architecture

Phase 4 adds operational appointment scheduling, a daily queue, and a monthly
calendar. Phase 5.5 added the original staff-reviewed Resident request flow.
The redefense Phase 1 migration replaces the standard Resident path with
trusted automatic slot booking while retaining Pending for historical and
exception workflows. It does not add diagnoses, prescriptions, or automated
triage.

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
- Resident availability responses expose only service booking mode, date,
  start time, end time, and duration. Staff identities, staffing counts, other
  Residents, reasons, and clinical data are not exposed.

## Time model

`scheduled_date`, `start_time`, and `end_time` represent Brgy. Bagongpook
business time in `Asia/Manila`. Operational event timestamps remain
`timestamptz` and are formatted in `Asia/Manila` in the UI. Date-only helpers
avoid browser-timezone conversion.

Walk-ins must use the current Manila date. Other same-day appointments must
start in the future. The database enforces these rules independently of form
validation.

The current appointment booking window uses 30-minute slots beginning at
08:00 through 16:00, inclusive. This is a scheduling rule and must not be
represented as verified health-center opening or closing hours.

## Automated Resident booking

Old standard flow:

```text
Resident request -> Pending -> human review -> staff assignment -> Confirmed
```

New standard `AUTO_SLOT` flow:

```text
Resident selects a database-available slot
-> trusted database revalidates the service date, time, Resident, and capacity
-> system assigns eligible available staff
-> appointment is inserted as Confirmed
-> notification and realtime invalidation events propagate
```

Administrator/BHW intervention is no longer required for routine valid
self-bookings. Staff retain exception, rescheduling, cancellation, walk-in,
staff-assisted scheduling, and operational management responsibilities.

`appointment_service_schedules` is the authoritative recurring schedule model.
It stores an explicit booking mode, active state, ISO weekday, optional
occurrence within a month, duration, interval, and first/last appointment start
time. It contains no executable expressions. Current rules are:

- General Consultation: daily `AUTO_SLOT`
- Buntis / Prenatal Care: Tuesday `AUTO_SLOT`
- Maternal Care: first Tuesday `AUTO_SLOT`
- Immunization: first Wednesday `AUTO_SLOT`
- Family Planning: Thursday `AUTO_SLOT`
- Postpartum Home Visit: `COORDINATION_REQUIRED`

The Resident service catalog and availability RPCs read this table. A
coordination-required service never returns an instant-booking slot and the UI
directs the Resident to Inquiries or the Barangay Health Center.

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
for request-key, the Resident/date, and each candidate staff/date. The booking
RPC rejects overlapping Resident appointments, revalidates the recurring
service date and slot window, and scans active eligible staff in ascending
selected-day workload order with profile UUID as a stable tie-break. It locks
and rechecks each candidate using the same staff/date lock as staff scheduling.
If capacity remains, it inserts one normal-priority, assigned, Confirmed row.
If capacity was consumed concurrently, it returns a clean slot-unavailable
conflict and never double-books staff.

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
- `/appointments/queue` — daily operational queue synchronized by targeted
  appointment events and reconnect/focus reconciliation

Resident details include paginated scheduling history. The dashboard shows
RLS-filtered appointment totals and a five-row queue preview.

Appointment views are transactional: the primary identity is the appointment
reference, followed by Resident, current service schedule, assigned staff,
source, and lifecycle status. They do not duplicate portal-account or Resident
Registry administration.

Appointment inserts and updates emit audience-targeted invalidation events for
Admin/BHW, the linked Resident account, and current/previous assigned staff.
Lists, details, calendar, dashboard, and queue then refetch through the existing
RLS-preserving APIs. Check-in, schedule, status, assignment, and completion
changes therefore reconcile without relying on a polling loop.

Residents receive only `/appointments`, rendered as their own appointment
cards and automated booking dialog. Calendar and queue routes require separate
staff permissions; the queue RPC also rejects residents.

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

Forward-only Migration
`20260720002300_simplify_resident_request_duration.sql` retires the
resident-supplied end-time RPC overload. Residents submit only a preferred
start time; a private immutable helper supplies the centralized 30-minute
provisional duration, the trusted RPC rejects cross-date ranges, and the
existing schedule validator applies Manila-date and time rules. Staff-created
and staff-adjusted appointments continue accepting explicit start and end
times.

Forward-only Migration
`20260720010300_automated_resident_appointments.sql` adds the authoritative
service schedule model, Resident-safe service/availability RPCs, centralized
staff eligibility, fair atomic assignment, automatic confirmation,
data-minimized audit semantics, and confirmed-insert notifications. Existing
list, calendar, dashboard, queue, report, and workload reads require no special
case because the new row is an ordinary assigned Confirmed appointment. The
`alaga-ai` Edge Function must be redeployed after its verified static workflow
knowledge is updated; no automatic deployment is performed by this change.
