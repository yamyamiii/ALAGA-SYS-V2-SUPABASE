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

All roles may open the dashboard, their appointment view, notifications,
announcements, FAQs, and health-center information. Additional actions are
allowed only where the existing route permissions allow them:

- Administrator: queue, inquiries, residents, households, health records,
  maternal/child care, pregnancies, immunizations, reports, user management,
  and audit logs.
- Barangay Health Worker: appointment requests, queue, inquiries, residents,
  households, and reports.
- Nurse: queue, health records, and reports.
- Midwife: queue, health records, maternal/child care, pregnancies,
  immunizations, and reports.
- Resident: own appointment/request view and the common resident information
  destinations.

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

Both allowlists must be updated and tested when an approved route is added.
Never add a generic `navigate(url)` action or accept model-generated paths.
