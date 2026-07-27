# General assistance architecture

Phase 8 adds resident-facing information and operational assistance without
introducing an external messaging platform. The browser uses
`assistanceService`; React Query owns server state, cancellation, retry, and
cache invalidation. Route pages do not import the Supabase client.

## Trust boundary

Forward-only Migration `20260720002700_general_assistance.sql` creates
announcements, in-app notifications, singleton health-center information,
FAQs, and resident inquiries. All five tables have RLS enabled and revoke
direct access from `anon` and `authenticated`. Narrow RPCs independently load
the active profile role, validate inputs and pagination, and use a fixed empty
`search_path`.

Client permissions control navigation and actions for usability only. The
database remains authoritative:

| Capability                             | Database roles                       |
| -------------------------------------- | ------------------------------------ |
| View current announcements             | Admin, BHW, nurse, midwife, resident |
| Manage announcements                   | Admin, BHW                           |
| Read own/relevant notifications        | All active roles                     |
| View activity timeline                 | Admin; resident own activity         |
| Edit health-center information         | Admin                                |
| View health-center information and FAQ | All active roles                     |
| Manage FAQ                             | Admin                                |
| Submit inquiry                         | Linked active resident               |
| Read/update inquiry queue              | Admin, BHW                           |

## Privacy and event design

Notifications contain a title, a short operational summary, an optional safe
module path, and a deduplication key. They never copy diagnoses, treatment
plans, clinical notes, appointment reasons, contact data, or addresses.
Appointment, signed-encounter, maternal, and child triggers derive recipients
from trusted database relationships. New announcements create a scheduled
notification whose availability matches `publish_at`.

The resident timeline combines only own linked appointment/encounter audit
events and own notification summaries. The administrator timeline uses
existing minimized operational audits. It never returns audit snapshots or
clinical narrative columns.

## Reliability

Announcement and inquiry creation use caller-scoped request keys. Notification
deduplication uses `(recipient_profile_id, dedup_key)`. Mutable records use
optimistic `version` checks. List RPCs enforce bounded server pagination.
Frontend requests have a 20-second timeout, an offline preflight, safe error
mapping, and AbortSignal forwarding where the Supabase client supports it.

No SMS, email, browser push, delivery worker, AI, or real-time chat is part of
this phase.
