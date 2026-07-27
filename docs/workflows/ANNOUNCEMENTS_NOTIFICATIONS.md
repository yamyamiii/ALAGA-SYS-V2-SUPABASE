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
changes, and a new announcement can create concise notifications. The database
derives the recipient from the appointment, resident, pregnancy, or child
relationship; the browser never submits a notification owner.

Each account can list only its own available rows, newest first. Mark-as-read
updates require both the notification UUID and matching `auth.uid()`.
Mark-all-as-read affects only the caller. Staff therefore see only
notifications addressed to them, such as an assigned appointment update or a
general announcement.

This is an in-app center only. There is no SMS, email, push notification, or
guaranteed emergency delivery. Users should not rely on it for urgent care.
