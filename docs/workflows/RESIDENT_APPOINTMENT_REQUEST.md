# Resident online appointment request

## Lifecycle

An authenticated resident with an active account and one linked, active
resident record can request an appointment from `/appointments`. The browser
sends only the allowlisted service, preferred Manila date and time range,
reason for visit, and a one-use request key.

The database derives `resident_id` from `auth.uid()` and forces:

- `appointment_type = scheduled`;
- `status = pending`;
- `priority = normal`;
- `assigned_staff_id = null`;
- creator and updater attribution to the authenticated profile.

Pending means **awaiting health-center confirmation**. It does not promise a
slot. The request is visible only to its resident owner and authorized staff.

## Preferred schedule and availability

Resident requests remain unassigned until review. Existing conflict protection
is staff-specific, so the system cannot truthfully calculate capacity without
an assigned staff member. The selected date and time are therefore a preferred
schedule, not a reservation.

The original `requested_date`, `requested_start_time`, and
`requested_end_time` remain immutable request context when staff adjust or
atomically reschedule the operational appointment. Once staff assign an
eligible person, the existing serialized overlap check protects that staff
member's schedule.

## Staff review

Administrators and Barangay Health Workers see the oldest pending resident
requests in the incoming-request review section. They can:

1. open the request details;
2. use the existing edit or reschedule workflow to adjust the schedule;
3. assign eligible staff;
4. confirm the pending request after assignment; or
5. cancel it as rejected with a required reason.

Nurses and midwives do not receive general request-review capabilities. Their
existing assigned and service-scoped appointment permissions remain unchanged.

## Resident cancellation

A resident can cancel only an own, non-archived, resident-originated request
while it is still `pending`. A reason and current optimistic-concurrency
version are required. Confirmed, checked-in, in-progress, completed,
staff-created, archived, or another resident's appointments cannot be
resident-cancelled.

## Security and privacy

- There is no direct authenticated `INSERT` or `UPDATE` grant on appointments.
- Resident ownership, account status, and resident status are checked again by
  security-definer RPCs with an empty fixed search path.
- Request keys are serialized and globally unique. A second identical pending
  request is rejected under a resident/schedule advisory lock.
- Broad lists, staff review cards, calendars, queues, audits, notification
  events, and developer diagnostics exclude the reason text.
- The resident detail RPC omits priority, operational notes, other residents,
  and internal administrative fields.
- Residents have no route permission for the calendar or daily queue. The
  queue RPC also rejects resident callers.

## Audit and future notification boundary

The workflow writes these semantic audit actions:

- `appointment.resident_requested`
- `appointment.resident_cancelled`
- `appointment.request_confirmed`
- `appointment.request_schedule_adjusted`
- `appointment.request_rejected`

Audit metadata contains identifiers, state, changed-field names, timestamps,
and the original preferred schedule, never the full reason.

`appointment_request_events` is a private, RLS-enabled event outbox for future
notification delivery. It records request received, confirmed, cancelled,
rejected, and schedule-changed events without contact data, message bodies, or
delivery status. No SMS, email, push, or background delivery worker exists in
this phase.

## Live testing checklist

1. Link an active resident account and submit a future request.
2. Repeat the same request key and verify the original row is returned.
3. Submit an identical pending request with a new key and verify rejection.
4. Verify an unlinked, inactive, archived, moved-out, or deceased resident is
   denied.
5. Verify only the requesting resident can read the request.
6. Cancel an own pending request and verify a reason is required.
7. Confirm a request as administrator/BHW and verify resident cancellation is
   then denied.
8. Adjust and assign a request, then verify the original preferred schedule
   remains visible and staff conflicts still apply.
9. Verify nurse/midwife accounts do not see the incoming-review section.
10. Directly navigate as resident to calendar and queue routes and verify
    Access Denied.
11. Inspect broad API responses, audits, and event rows and verify the reason
    is absent.

## Known limitations

- A preferred time is not capacity availability while the request is
  unassigned.
- Staff review is in-app only; there is no notification delivery.
- Residents cannot edit or reschedule submitted requests. They may cancel a
  pending request and create another.
