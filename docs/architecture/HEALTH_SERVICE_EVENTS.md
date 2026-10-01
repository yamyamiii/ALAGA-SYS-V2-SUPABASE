# Automated health service events (Phase 2)

For scheduled Barangay health events, authorized staff configure the service,
event schedule, target capacity, and participating staff once. ALAGA-SYS then
automatically accepts eligible Resident bookings, enforces capacity, distributes
participants among participating staff, confirms bookings, manages the waitlist,
and propagates notifications and operational updates without requiring routine
Administrator approval.

## Operational model

`health_service_events` owns the fixed Asia/Manila date/window and capacity.
`health_event_staff` owns participating staff and derived equal quotas.
`health_event_bookings` owns confirmed/waitlisted/cancelled/checked-in/completed
participation. `health_event_history` retains minimized structured events.
HEV and EVB references are distinct from APT numbers: campaigns are capacity-based
queues, not overlapping individual 30-minute appointments. No clinical narratives
are stored in these tables. Health Records and ordinary appointments remain intact.

An optional Announcement references the event; it does not own capacity. Its
booking CTA resolves through a publication-filtered trusted batch RPC. Publication
and the event date are separate. Event cancellation archives linked communication
and removes only proven announcement-linked notifications, retaining history.

## Allocation, concurrency and recovery

Equal is the only current mode. Stable ascending staff UUIDs receive the remainder:
60/2 = 30+30; 60/3 = 20+20+20; 61/2 = 31+30. Next booking chooses the smallest
event-specific active assigned count below quota, with UUID tie-break. CUSTOM is
not exposed; it requires a reviewed future contract rather than unchecked inputs.

Reservation writers serialize on a transaction advisory day lock and the event
parent row. Ordinary booking/availability and trusted staff schedule validation
also check reserved event windows. Existing ordinary staff overlap protection is
not relaxed. The day lock trades throughput for simple, safe campaign/ordinary
reservation coordination; the supported event capacity is 1–1000, team up to 25.

Capacity counts confirmed, checked-in and completed bookings. A partial unique
index prevents duplicate active participation. Per-profile request keys make
retries idempotent. Queue order is monotonic, retained through promotions and
cancellations; gaps are intentional history, not missing capacity.

Cancellation frees capacity and promotes the oldest currently eligible waitlisted
Resident within the same transaction, revalidating active account, active linked
Resident and staff allocation. Ineligible waitlisters are skipped, not silently
deleted. Closure stops new bookings/promotions; completion remains available.
Staff status/role/retirement changes automatically redistribute equal quotas and
affected active assignments. If no safe assignment exists, confirmed participation
is retained with an explicit manager exception, not cancelled. Completed staff
attribution is never rewritten. Managers may repair the team before the event.

## Authorization and UI

- Admin/BHW: configure, publish, edit, close, cancel, archive; operational queues.
- Nurse/Midwife: only assigned participant queue/actions and assigned aggregates.
- Resident: public event metadata/capacity and own booking/history only; booking
  derives identity from the authenticated active linked Resident. No identity,
  staff, status, quota or queue input is accepted from the browser.
- Check-in and completion use optimistic versions and event-day Manila rules;
  no mandatory clinical encounter. Cancellation of participation is optional-narrative.
- Tables and internal helpers are browser-private, RLS enabled; narrow authenticated
  RPCs authorize every operation. Existing fail-closed account dependency guards
  also see these new protected foreign keys. No direct mutation grants added.

Events appear as a new Appointments tab, not a sidebar redesign. Resident cards
show a fixed window, remaining places, own status/reference/order, confirmation
and waitlist actions. Manager cards show allocation and exceptions. Forms retain
unsaved values in memory across refetch/focus; no localStorage drafts.
Mobile uses wrapping cards, 44px-ish controls and scrollable 90dvh dialogs.
Notification navigation uses exact symbolic source/path/UUID validation, never
message-derived URLs. Reports/dashboard show campaign aggregates separately from
unchanged ordinary appointment totals (clinical roles are assignment-scoped).

## Realtime and notifications

Existing Migration 102 minimized `appointment` invalidation events refresh both
`appointments` and `reports` query prefixes. Event keys include the current profile.
There is no new subscription or participant-table publication. Visible event lists
and announcement link maps reconcile at 30-second intervals for clock-only closure
or expiry; the database's `booking_open` flag remains authoritative even if a
device clock is wrong. Existing notification
triggers refresh the bell/list; success also invalidates local related queries.
Confirmation, waitlist, promotion, team/schedule update, cancellation and completion
notifications contain generic operational text, not participant/clinical data.

## Deployment and verification

Migration 105 is forward-only; all earlier migrations, including 103/104, are
immutable. No Edge Function change is required. Review then manually apply:

```sh
npx supabase@latest db push --linked --dry-run
npx supabase@latest db push --linked
```

Deploy the frontend afterward. Do not publish an event until its staff/window are
verified. Demonstrate Immunization, capacity 60, BHW + Nurse, Equal, announcement
enabled: quotas 30/30, automatic confirmations, 61st waitlist, cancellation promotion,
notification and live queue/count updates without F5. Test staff suspension and
manager repair; separately regression-test ordinary bookings and postpartum coordination.

Executable tests use an optional temporary PGlite installation (not a production
dependency). Set `ALAGA_TEST_PGLITE_MODULE` to its `dist/index.js` file URL before
running Vitest. They compile Migration 105 and exercise real PostgreSQL functions;
parallel transactions are serialized by the embedded single connection. A genuine
multi-connection hosted concurrency and cross-browser realtime UAT remains a
manual deployment check, not a claim of local browser/hosted testing.
