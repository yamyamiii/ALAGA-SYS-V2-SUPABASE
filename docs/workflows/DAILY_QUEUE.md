# Daily appointment queue

The daily queue is an operational ordering aid, not a medical triage tool.
`normal`, `priority`, and `urgent` values describe workflow order only.

## Ordering

The database calculates one stable queue position using:

1. checked-in appointments before other statuses;
2. urgent, then priority, then normal;
3. check-in timestamp when available;
4. scheduled start time;
5. creation time and UUID as deterministic tie-breakers.

Rescheduled and archived records are excluded. Date, status, and priority
filters are server-side. Row Level Security is applied before positions and
counts are returned, so each user receives a queue over only their visible
appointments.

The queue page refreshes every 30 seconds while open and provides a manual
refresh action. It uses appointment `version` values for quick actions so
another browser tab cannot be silently overwritten.

## Privacy

Queue rows contain the appointment number, resident display identity, service,
time, priority, status, assigned staff, and check-in timestamp. Reasons,
cancellation reasons, operational notes, diagnoses, and clinical content are
not returned.

## Manual checks

1. Open the queue at desktop, tablet, and mobile sizes.
2. Confirm no horizontal page overflow; desktop uses a scroll-safe table and
   smaller screens use cards.
3. Check in normal and urgent appointments and verify deterministic ordering.
4. Change status and priority filters and verify positions/counts are computed
   from the filtered authorized rows.
5. Change a row in a second tab and verify a stale quick action asks for reload.
6. Confirm assigned nurse/midwife visibility and resident ownership boundaries.
