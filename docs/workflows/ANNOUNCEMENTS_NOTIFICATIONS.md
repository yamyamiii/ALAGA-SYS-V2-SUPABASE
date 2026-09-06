# Announcements and in-app notifications

## Announcement workflow

1. An administrator or BHW creates a categorized announcement with a publish
   time, optional expiration, and optional pin.
2. The trusted RPC trims and validates the content, records the actor, and
   reuses the request key if a submission is retried.
3. An in-app notification is created for every active profile and remains
   unavailable until the announcement publish time.
4. Current lists show only non-archived announcements whose publish time has
   arrived and whose expiration has not passed. Pinned records sort first.
5. Administrators and BHWs may edit, pin/unpin, or archive through versioned
   RPCs. Every required change creates a minimized semantic audit.

Announcements are community information and must never contain private health
information.

## Notification workflow

Appointment status changes, a signed health encounter, maternal/child record
changes, a new announcement, and an actionable Resident self-registration can
create concise notifications. The database derives every recipient from trusted
relationships or role state; the browser never submits a notification owner.

A Resident self-registration becomes actionable only after its Auth email is
confirmed while the registration remains pending. Every active Administrator
then receives one recipient-private notification linked to the registration
UUID. Unconfirmed signups do not notify staff, repeated confirmation callbacks
are deduplicated, and the notification contains no applicant demographics or
contact information. Its fixed action opens Administrator-only User Management.

Each account can list only its own available rows, newest first. Mark-as-read
updates require both the notification UUID and matching `auth.uid()`.
Mark-all-as-read affects only the caller. Staff therefore see only
notifications addressed to them, such as an assigned appointment update or a
general announcement.

Notification queries poll every 30 seconds while enabled so the header bell,
Dashboard summary, and Notifications page discover trusted server-created
events without requiring a route reload. Marking one row read still invalidates
all of the current account's notification query variants; it never changes
another recipient's read state.

The in-app notification center is the authoritative user-facing channel.
Optional server-side email/SMS delivery infrastructure exists but remains
provider-configured, best effort, and independent of core workflow success.
There is no push notification or guaranteed emergency delivery. Users should
not rely on any notification channel for urgent care.
