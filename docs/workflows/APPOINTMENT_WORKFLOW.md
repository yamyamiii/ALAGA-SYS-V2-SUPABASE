# Appointment workflow

## Create or register a walk-in

Administrators and Barangay Health Workers can create appointments. Select an
active resident, appointment type, allowlisted service, date, time range,
operational priority, and optional eligible staff member. A reason is required
for scheduled, follow-up, and home-visit appointments. Operational notes must
not contain diagnoses, prescriptions, or clinical encounter content.

The database generates an immutable `APT-YYYY-NNNNNN` number. A repeated request
with the same request key returns the original result rather than creating a
duplicate.

## Resident online request

A linked active resident submits only service, preferred Manila date/time, and
reason. The database derives resident ownership and forces a scheduled,
pending, normal-priority, unassigned appointment. Pending means awaiting
health-center confirmation; the preferred time is not a reserved slot.

Administrators and BHWs review incoming requests, adjust the schedule through
the existing controlled edit/reschedule workflow, assign eligible staff, and
confirm or reject. Nurses and midwives retain only their existing assigned,
service-scoped operations.

A resident-originated request cannot be confirmed while unassigned.

A resident can cancel only an own resident-originated pending request and must
provide a reason. Confirmation ends resident cancellation access. See
[Resident online appointment request](RESIDENT_APPOINTMENT_REQUEST.md).

## State machine

```text
pending ── confirm ──> confirmed ── check in ──> checked_in
   │                      │                            │
   ├─ cancel              ├─ cancel                    ├─ cancel
   │                      └─ no show                  └─ start
   │                                                     │
   └─ reschedule*                                      in_progress
                                                         │
                                         admin cancel ───┤
                                                         └─ complete

* Reschedule is available from pending or confirmed.
```

The only valid direct transitions are:

- `pending` → `confirmed` or `cancelled`
- `confirmed` → `checked_in`, `cancelled`, or `no_show`
- `checked_in` → `in_progress` or `cancelled`
- `in_progress` → `completed` or `cancelled`

Rescheduling atomically creates a linked pending replacement and changes the
original to `rescheduled`. Terminal states cannot be reopened through a status
update. Administrators may archive terminal records and restore archived
records without physical deletion.

## Role actions

- Administrator: all appointment operations, including terminal archival and
  in-progress cancellation.
- Barangay Health Worker: schedule, edit pending/confirmed visits, reschedule,
  confirm, check in, cancel before in-progress, and update operational notes.
- Assigned nurse: read assigned visits and check in, mark no-show, start,
  complete, or update operational notes when the state allows.
- Assigned midwife: the same assigned-clinician operations only for Maternal
  Care and Child Health.
- Resident: read only appointments linked to their own resident record.
- Resident: request an own appointment and cancel only an own pending online
  request; no staff assignment, walk-in registration, calendar, or queue.

The database loads every role from `profiles`; frontend role values cannot grant
access.

## Conflict response

If assigned staff already has an overlapping current appointment, the save is
rolled back and the UI reports the conflicting appointment number and time
window without exposing its resident or reason. Choose a different time or
staff member and retry.

If another session changes the same appointment first, reload the record before
retrying.

## Manual checks

1. Create a future scheduled appointment and confirm its generated number.
2. Repeat a create call with one request key and verify only one row exists.
3. Attempt an overlapping assignment in another tab and verify one succeeds.
4. Exercise each allowed state transition and reject an invalid transition.
5. Reschedule and verify the original and linked replacement are both visible.
6. Verify BHW, assigned nurse, assigned midwife, unassigned clinician, and
   resident accounts each see only their authorized actions and rows.
7. Archive a terminal appointment as administrator, include it in list results,
   restore it, and verify no row was deleted.
8. Submit and retry a resident request, then confirm idempotency and duplicate
   protection.
9. Adjust and confirm a resident request and verify its original preference is
   preserved.
10. Verify resident cancellation succeeds only before confirmation.
