# ALAGA AI safe navigation

Phase 9B navigation is a read-only convenience layer. It does not give Gemini
control of React Router or any database operation.

## Contract

The Edge Function parses explicit navigation language before any provider call
and returns only:

```json
{
  "message": "Choose a destination.",
  "sources": [],
  "actions": [
    {
      "type": "navigate",
      "actionId": "open_appointments",
      "requiresConfirmation": true
    }
  ]
}
```

The response never contains a route or URL. The client uses a fixed local
registry to translate an allowed action ID into a label and route. It discards
unknown IDs, unexpected fields, and role-incompatible actions.

## Role-aware destinations

All roles may open the dashboard, their appointment view, announcements, FAQs,
and health-center information. Additional actions are allowed only where the
approved visible scope and existing route permissions both allow them:

- Administrator: calendar, queue, inquiries, residents, health records,
  approved reports, and user management.
- Barangay Health Worker: appointment requests, queue, inquiries, residents,
  health records, and approved reports.
- Nurse: calendar, queue, and health records.
- Midwife: calendar, queue, and health records.
- Resident: own appointment/request view, notifications, and common secondary
  assistance destinations.

The canonical role is loaded at the server. The frontend repeats the check for
defense in depth but is not the authorization authority.

## Interaction rules

- A single authorized destination is offered as an explicit Open button.
- Multiple detected destinations are displayed as confirmation choices.
- Unknown, raw-route, raw-URL, and unauthorized requests do not navigate.
- Navigation buttons are disabled while the browser is offline.
- The user remains responsible for clicking an action; there is no automatic
  redirect from model output.
- Actions only open existing pages. They cannot submit, approve, archive,
  cancel, sign, export, or mutate anything.
- The response introduction follows recognizable English, Filipino, or
  Taglish phrasing and uses the locally trusted action label.

## Supported resident phrasing

The deterministic parser recognizes concise English, Filipino, and Taglish
navigation commands. Resident appointment examples include `Open appointments`,
`Buksan ang appointments ko`, `Punta sa appointments ko`, `Tingnan ang mga
appointment ko`, `My appointments`, and `Appointment requests ko`. They all use
the existing `open_appointments` action and the resident-facing label **Open My
Appointments**.

Common Filipino/Taglish commands are also recognized for resident-safe
notifications, announcements, FAQs, health-center information, and inquiries.
This matching does not broaden permissions: incoming appointment requests, the
staff queue, and the staff calendar remain unavailable to residents.

Both allowlists must be updated and tested when an approved route is added.
Never add a generic `navigate(url)` action or accept model-generated paths.

Phase 9C also recognizes common Filipino module nouns for the staff queue,
health records, approved reports, and user management.
These phrase additions do not change any role allowlist.

## Registered child destinations

The same symbolic-action boundary supports these existing child views:

- Appointments: Appointment Calendar and Daily Queue.
- Health Records: Clinical Encounters and the Vital Signs encounter context.
- Reports: Appointment Reports and Monthly Reports.

Each action maps to a fixed route or an allowlisted query parameter in the
frontend registry. Report categories, reporting periods, and health-record
sections are validated by their destination page. The Vital Signs
action opens the authorized encounter list and asks the user to select a record;
it never fabricates or accepts an encounter identifier. Existing role checks and
database row-level security still apply.

Maternal and Child Care, households, referral, audit, backup, settings, and
advanced-report actions are absent from the server and frontend registries.
Those capabilities are preserved as inactive future extensions and excluded
from the approved final thesis scope. Navigation does not grant create, edit,
archive, or clinical-documentation permissions.

## Resident appointment request form action

For an active Resident account linked to an active resident record, approved
appointment-request phrases may return the fixed `ui_action` ID
`open_appointment_request_form`. Staff roles and unlinked resident accounts do
not receive it. The Edge Function verifies the canonical profile and link before
constructing the action; Gemini cannot create it.

The client maps the symbolic ID to the existing resident Appointments route. A
single-use opaque token is held only in memory and carried in React Router state.
The resident page consumes and removes the token before opening the existing
request dialog. Refresh, back/forward navigation, logout, unmount, or a profile
role change cannot replay it. The action carries no route, component name,
resident identifier, form value, or appointment data.

The action never submits or pre-populates the form. The resident must review and
submit the existing form manually, and its validation plus the trusted resident
appointment RPC remain authoritative.
