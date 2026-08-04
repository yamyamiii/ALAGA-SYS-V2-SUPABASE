# ALAGA-SYS

**Automated Local Appointment and General Assistance System** is a planned
barangay healthcare management system. This repository currently contains the
Phase 0 application foundation, Phase 1 normalized PostgreSQL schema and
deny-by-default Row Level Security, Phase 2 authentication and trusted user
management, and the Phase 3 household/resident registry and production
hardening. Phase 4 adds operational appointment scheduling, a daily queue, a
calendar, resident appointment history, and appointment dashboard summaries.
Phase 5 adds the secure Electronic Health Records foundation: clinical
encounters, vital signs, allergies, medical history, signatures, amendments,
and resident clinical timelines.
Phase 5.5 allows a linked active resident to submit an own pending appointment
request for staff review and cancel it only while still pending.
Phase 6 adds secure pregnancy, prenatal, delivery, postnatal, child profile,
growth, immunization, and developmental-visit foundations.
Phase 7 adds privacy-safe aggregate reports, bounded exports, and printing.
Phase 8 adds announcements, in-app notifications, resident/admin activity,
health-center information, FAQs, and resident inquiry tickets.
Phase 9A adds a stateless, role-aware ALAGA AI general-assistance chat through
an authenticated Supabase Edge Function and the Gemini Interactions API.
Phase 9B adds bounded live grounding from approved public operational sources
and deterministic, role-checked, read-only navigation using symbolic actions.
Phase 9C adds deterministic trusted answers for hours, services, and current
announcements plus multilingual matching, role-aware starters, compact source
cards, copy/retry/confirmed-reset controls, and stricter client safety handling.
Phase 10 adds authorized A4 previews, browser printing, and local selectable-text
PDF downloads for appointment slips, consultation summaries, clinician-authored
referrals, prenatal summaries, and child health summaries.
The release-candidate foundation adds role-aware UAT corrections and optional,
provider-neutral email/SMS delivery. External channels are opt-in, use only
minimized templates, and never make core workflows depend on provider success.
Phase 12 adds administrator-only, application-aware backup and restore with
private signed ZIP packages, per-file SHA-256 integrity, dry-run preview,
transactional conflict rollback, history, and scheduler-ready retention. It
does not export Auth/Storage internals, secrets, AI conversations, audit
payloads, or notification delivery logs.

Inventory, prescription dispensing, laboratory integrations, birth
registration, provider-specific delivery webhooks, AI mutations, and AI access
to clinical or resident data are not implemented. SMS is disabled by default.

## Technology stack

- React 19 with Vite 7 (JavaScript and JSX)
- React Router
- Tailwind CSS and focused shadcn/ui-compatible components
- Lucide React and Sonner
- TanStack React Query
- React Hook Form, Zod, and Hook Form resolvers
- date-fns
- jsPDF, lazy-loaded only for local protected-document downloads
- Supabase JavaScript client with persisted authentication
- Supabase Edge Functions with the server-only Google GenAI SDK
- Vitest, Testing Library, ESLint, and Prettier

## Project structure

```text
src/
  app/             Application composition, providers, routing, error boundary
  assets/          Static project assets
  components/
    common/        Reusable page and state patterns
    layout/        Responsive application shell
    ui/            Focused shadcn/ui-compatible primitives
  config/          Routes, navigation, and shared metadata
  features/        Feature-owned code, introduced incrementally
  hooks/           Shared React hooks
  lib/             Supabase, query, validation, and utility foundations
  pages/           Route-level pages
  services/        Auth and future data-access boundaries used by features
  styles/          Global styles and design tokens
  utils/           Framework-independent helpers
supabase/          Migrations, trusted Edge Functions, bootstrap, and seed
docs/              Architecture, requirements, database, and UI documentation
```

Pages must not call Supabase directly. Future server operations belong in
service or repository-like modules, server state belongs in React Query, and
forms will use React Hook Form with Zod validation.

## Requirements

- Node.js 20.19 or newer (Node 24.15 was used for Phase 0 verification)
- npm 11 or a compatible npm release
- A Supabase project with Phase 1 migrations and trusted test accounts for live login

## Installation

```bash
npm install
```

## Environment variables

The tracked `.env.example` contains placeholders:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

For local project configuration, copy the example to `.env.local` and add only
the project URL and **publishable** key. Vite exposes every `VITE_` value to the
browser. Phase 1 migrations are applied through the Supabase CLI or SQL Editor,
not through this browser configuration.

> Never add a Supabase secret key or service-role key to this React application,
> any `VITE_` variable, source control, logs, screenshots, or support messages.

The ALAGA AI gateway requires server-only Gemini secrets configured through
Supabase. They must never use the `VITE_` prefix. See
[Gemini AI deployment](docs/deployment/GEMINI_AI.md) for the complete setup.

Outbound providers and the queue processor also use server-only secrets. See
[Email and SMS deployment](docs/deployment/EMAIL_SMS.md). Never place provider
keys or the notification processor token in Vite configuration.

Backup workers require separate server-only signing and scheduler secrets. See
[Backup deployment](docs/deployment/BACKUP_DEPLOYMENT.md), the
[architecture](docs/architecture/BACKUP_AND_RESTORE.md), and the
[security policy](docs/security/BACKUP_SECURITY.md). Phase 12 does not deploy a
scheduler or apply Migration 33 automatically.

The reusable client boundary is `src/lib/supabase/client.js`. Calling
`getSupabaseClient()` without both public variables throws a clear
`SupabaseConfigurationError`. Authentication pages use the auth service and do
not import the client directly.

## Development

```bash
npm run dev
```

Vite prints the local URL. Guests enter at `/login`; authenticated users enter
the dashboard at `/`. Households are available at `/households`, residents at
`/residents`, and appointments at `/appointments`, `/appointments/calendar`,
and `/appointments/queue`. Unfinished healthcare module routes remain shared
placeholders. Authorized accounts access clinical encounters at
`/health-records` and `/health-records/:encounterId`. Authorized staff access
aggregate reports and exports at `/reports`.
General assistance is available at `/announcements`, `/notifications`,
`/activity`, `/health-center`, `/faq`, and `/contact`, subject to role access.

## Quality commands

```bash
npm run build
npm run db:verify
npm run lint
npm test
npm run format
npm run format:check
npm run preview
```

## Current phase

The release candidate hides the unfinished Settings navigation, removes broad
resident-search affordances from resident clinical views, and adds own-profile
notification preferences plus a privacy-minimized administrator delivery
summary. In-app notifications remain authoritative. Email works only after a
reviewed generic HTTP gateway is configured; SMS and scheduling remain
manually disabled until separately activated.

Phase 10 provides a reusable printable-document boundary backed by narrow,
server-authorized RPCs. Protected data is revalidated for every preview and is
never stored in browser storage, uploaded, or sent to AI or an external PDF
service. The new referral workflow is clinician-authored, encounter-derived,
idempotent, versioned, and immutable after finalization.

Phase 9C completes the floating authenticated assistant experience with live, read-only
grounding from active FAQs, health-center name/address/hours/services, and
current announcements. Deterministic navigation runs before Gemini and returns
only role-checked symbolic action IDs; the frontend revalidates each ID and
maps it to a fixed local route. Conversation drafts stay in React memory. No
resident, appointment, clinical, maternal/child, report, contact, inquiry,
notification, or audit data is supplied to Gemini, and no AI action mutates
application data.

Phase 8 provides role-aware announcements, own/relevant in-app notifications,
privacy-minimized activity timelines, public health-center information,
searchable FAQs, and a simple resident inquiry workflow. All data access is
through trusted RPCs; notification and timeline summaries exclude clinical
narratives.
Registry locality remains Brgy. Bagongpook with Purok 1 through Purok 7.
Household latitude/longitude columns remain in the database for compatibility
but are not selected, collected, submitted, or displayed by the frontend.
Phase 5.5 adds RPC-only resident appointment requests. Requested times remain
preferences until staff assignment and confirmation.

## Deployment note

Migrations 1-31 are the existing baseline. The release candidate adds pending
forward-only migration `20260720003200_outbound_notification_foundation.sql`;
review and apply it manually before deploying the notification processor and
frontend. Application startup does not push migrations, functions, schedules,
or provider configuration automatically.

See [Resident registry architecture](docs/architecture/RESIDENT_REGISTRY.md),
[Appointment architecture](docs/architecture/APPOINTMENTS.md),
[Appointment workflow](docs/workflows/APPOINTMENT_WORKFLOW.md),
[Resident appointment request](docs/workflows/RESIDENT_APPOINTMENT_REQUEST.md),
[Health Records architecture](docs/architecture/HEALTH_RECORDS.md),
[Clinical encounter workflow](docs/workflows/CLINICAL_ENCOUNTER.md),
[Reports architecture](docs/architecture/REPORTS_ANALYTICS.md),
[General assistance architecture](docs/architecture/GENERAL_ASSISTANCE.md),
[AI assistant architecture](docs/architecture/AI_ASSISTANT.md),
[AI safety](docs/security/AI_SAFETY.md),
[AI navigation](docs/workflows/AI_NAVIGATION.md),
[AI user guide](docs/workflows/AI_USER_GUIDE.md),
[Printable documents architecture](docs/architecture/PRINTABLE_DOCUMENTS.md),
[Outbound notifications](docs/architecture/OUTBOUND_NOTIFICATIONS.md),
[Notification privacy](docs/security/NOTIFICATION_PRIVACY.md),
[Notification preferences](docs/workflows/NOTIFICATION_PREFERENCES.md),
[Appointment reminders](docs/workflows/APPOINTMENT_REMINDERS.md),
[Email and SMS deployment](docs/deployment/EMAIL_SMS.md),
[Document privacy](docs/security/DOCUMENT_PRIVACY.md),
[Print design system](docs/ui/PRINT_DESIGN_SYSTEM.md),
[Appointment Slip](docs/workflows/APPOINTMENT_SLIP.md),
[Consultation Summary](docs/workflows/CONSULTATION_SUMMARY.md),
[Referral Form](docs/workflows/REFERRAL_FORM.md),
[Prenatal Summary](docs/workflows/PRENATAL_SUMMARY.md),
[Child Health Summary](docs/workflows/CHILD_HEALTH_SUMMARY.md),
[Gemini AI deployment](docs/deployment/GEMINI_AI.md),
[Announcements and notifications](docs/workflows/ANNOUNCEMENTS_NOTIFICATIONS.md),
[Resident inquiries](docs/workflows/RESIDENT_INQUIRIES.md),
[Report exports](docs/workflows/REPORT_EXPORTS.md),
[Report privacy](docs/workflows/REPORT_PRIVACY.md),
[Vital Signs workflow](docs/workflows/VITAL_SIGNS.md),
[Daily queue](docs/workflows/DAILY_QUEUE.md),
[Private photo storage](docs/architecture/STORAGE.md),
[Resident account linking](docs/workflows/RESIDENT_ACCOUNT_LINKING.md),
[Storage deployment](docs/deployment/SUPABASE_STORAGE.md),
[Authentication architecture](docs/architecture/AUTHENTICATION.md),
[RLS matrix](docs/database/RLS_MATRIX.md), and
[Roadmap](docs/requirements/ROADMAP.md). Phase 3C findings and regression scope
are recorded in [Production QA](docs/quality/PHASE_3C_QA.md).
