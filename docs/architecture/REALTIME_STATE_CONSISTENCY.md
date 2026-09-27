# Realtime state consistency

## Account, Resident, and appointment are different records

`ACCOUNT != RESIDENT != APPOINTMENT` is an intentional architecture rule:

- A **portal account/profile** is the authentication identity, role, and access
  lifecycle. Its account status controls whether the person can use ALAGA-SYS.
- A **Resident Registry record** is the person's durable barangay healthcare
  identity. It can remain active when its portal account is inactive,
  suspended, retired, or absent. Historical appointments and health records
  remain linked to this Resident identity.
- An **appointment** is a transactional service record linked to a Resident. It
  has its own reference, schedule, assigned staff, source, and lifecycle.

Deactivating a portal account removes system access but does not erase or
automatically deactivate the Resident's historical healthcare identity.

## Synchronization model

Migration `20260720010200_realtime_state_consistency.sql` creates a minimized
`realtime_sync_events` stream. Trusted database triggers emit only a topic,
optional entity UUID, audience, and availability boundary. They do not copy
names, contact details, appointment content, notification summaries, or
clinical fields.

The browser subscribes once for the current authenticated profile. Row Level
Security allows only events addressed to that profile or its current active
role. An event invalidates the matching React Query family; existing RLS-safe
tables or trusted RPCs then return the authoritative current state. Sensitive
business tables remain unpublished and RPC-only notification/announcement
access is not weakened.

The stream covers account status/role, Resident registration, registry links
and records, appointments and queue state, own notifications, and
announcements. Scheduled notification and announcement events use their
database availability times. Announcement expiration creates a separate
boundary event. On subscription, the browser also replays its own RLS-filtered
future event envelopes so a schedule created before the tab opened still
reconciles at its availability time.

## Reliability and lifecycle

- Local mutations retain their existing targeted cache invalidation.
- A successful subscription, reconnect, browser-online event, and throttled
  focus/visibility event reconcile active critical queries.
- Current profile authorization is revalidated on targeted profile and
  registration events. An inactive or suspended account loses protected access
  and its local session is cleared. A restricted pending Resident session can
  read only its own profile/registration event and becomes active only after
  the trusted approval transaction succeeds.
- Event identifiers are deduplicated in a bounded in-memory set. Scheduled
  timers and channels are removed on logout, identity change, or unmount.
- Realtime is an optimization, never authorization or the source of record.
  Missed messages are repaired by authoritative reconciliation.

No clinical table is published, no browser role can insert/update/delete event
rows, and no service-role credential is present in the frontend.
