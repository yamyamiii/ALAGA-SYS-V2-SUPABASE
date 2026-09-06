# ALAGA AI user guide

ALAGA AI is a read-only guide for verified ALAGA-SYS information, approved
workflows, and pages already available to your account. It is not a clinician,
search engine, report generator, or record assistant.

## Starting a conversation

Open **ALAGA AI** from the floating assistant button or the existing Dashboard
launcher. It is not a left-sidebar navigation item. The first screen offers
short role-aware starter questions. You may select one or type in English,
Filipino, or common Taglish. Press Enter to send and Shift+Enter for a new line.

Useful examples include:

- `Ano ang operating hours?`
- `Anong services ang available?`
- `May bagong announcement ba?`
- `Paano mag-request ng appointment?`
- `Buksan ang appointments ko.`

The assistant answers matched hours, services, and current announcements from
the trusted live ALAGA-SYS records. If that information is missing, inactive,
archived, unpublished, or expired, it says that verified information could not
be found rather than guessing.

Responses use concise conversational plain text. Normal answers use short
paragraphs; procedures may use simple numbered steps, and short collections may
use hyphen bullets. Decorative Markdown separators and routine bold or italic
emphasis are intentionally avoided.

### Barangay Bagongpook health-service schedule

The trusted Edge Function contains the healthcare-personnel-verified local
service schedule as one structured catalog:

- General Consultation: regular service days/every day under current barangay
  practice
- Pregnancy-related/Buntis services: Tuesday
- Maternal Care: first Tuesday of the month
- Immunization: first Wednesday of the month
- Family Planning: Thursday
- Postpartum Care: coordinated healthcare-personnel home visit after childbirth

English, Filipino, and common Taglish schedule questions are answered directly
from this catalog without Gemini or private application data. Schedule answers
recommend confirming changes with the Barangay Health Center and never guarantee
staff availability on a particular date.

Service schedules are not official opening or closing hours. When the separate
verified `operating_hours` value is unavailable, the assistant says so and
recommends confirming directly with the Barangay Health Center; it does not infer
hours from the service-day schedule.

`Paano mag-request ng appointment?` is answered from the approved, read-only
ALAGA-SYS workflow guide: open Appointments, select Request Appointment,
complete the required information, submit the request, and wait for Barangay
Health Center review. This guidance does not query or reveal resident or
appointment data.

For an active Resident profile, the same answer includes a **Request an
Appointment** button in English, Filipino, and common Taglish. Selecting it
opens the existing blank request form on the Resident Appointments page. It does
not choose a service, date, time, reason, or resident record and never submits a
request automatically. The form and trusted request RPC still enforce the
linked-resident and appointment eligibility rules.

## Sources and navigation

Compact source cards show the trusted record type, a short title, and an
optional Manila-local updated date. A source card means that record was used as
approved context; it is not a sentence-level citation and does not reveal the
stored source body or identifier.

Navigation suggestions are buttons with locally trusted labels. The assistant
cannot invent a route or bypass your account role. It never navigates
automatically, and ambiguous choices require you to select the intended page.

Authorized users may also ask for registered child views such as `Open
Calendar`, `Open Daily Queue`, `Open Vital Signs`, `Open Appointment Reports`,
or `Open Monthly Reports`. These
commands use fixed symbolic destinations and do not accept arbitrary URLs. The
available buttons continue to depend on the signed-in role.

Maternal/child, referral, household, audit, backup, settings, and advanced
clinical report destinations are not available through ALAGA AI. They are
preserved as inactive future extensions and excluded from the approved final
thesis scope.

## Conversation controls

- **Copy** places one assistant response on the clipboard without saving it in
  ALAGA-SYS.
- **Retry** repeats a retryable failed request.
- **Clear** and **New conversation** ask for confirmation before removing the
  current conversation.
- Closing and reopening the panel keeps the in-memory draft for the current
  signed-in page session.
- Logout, account invalidation, a role/profile change, component unmount, or a
  full reload removes the in-memory conversation.

Conversations are not saved to localStorage, sessionStorage, IndexedDB, URLs,
application tables, or analytics.

## Safety and privacy

Do not enter names, record numbers, contact details, appointment reasons,
diagnoses, symptoms, laboratory results, pregnancy details, or other personal
or clinical information. ALAGA AI does not diagnose, prescribe, interpret
tests, access resident records, run SQL, generate reports, search the public
internet, or modify ALAGA-SYS data.

For an emergency, contact local emergency services or the Barangay Health
Center immediately. For an account or record-linking issue, contact the health
center or an administrator.

## Demo checklist

1. Sign in as each supported role and confirm its starter prompts differ.
2. Ask the three verified-information examples above in English and Filipino.
3. Confirm source cards show only safe metadata.
4. Try an allowed and a disallowed navigation request for the role.
5. Confirm Copy, Retry, Clear, New conversation, Escape, and mobile keyboard
   behavior.
6. Confirm offline, expired-session, rate-limit, provider-timeout, and missing
   grounding messages remain actionable and reveal no raw error details.
7. Confirm no conversation returns after logout or a full reload.
