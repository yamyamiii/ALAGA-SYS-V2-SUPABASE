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

Inventory, prescription dispensing, laboratory integrations, birth
registration, reports, notification delivery, and AI are not implemented.

## Technology stack

- React 19 with Vite 7 (JavaScript and JSX)
- React Router
- Tailwind CSS and focused shadcn/ui-compatible components
- Lucide React and Sonner
- TanStack React Query
- React Hook Form, Zod, and Hook Form resolvers
- date-fns
- Supabase JavaScript client with persisted authentication
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

Phase 7 provides role-aware, database-aggregated reports for registry,
appointments, health records, maternal care, child care, and operational staff
workload. It adds bounded CSV/Excel-compatible export and browser PDF/printing
with formula-injection protection and minimized export audits. Report pages do
not receive clinical narratives or direct resident identifiers.
Registry locality remains Brgy. Bagongpook with Purok 1 through Purok 7.
Household latitude/longitude columns remain in the database for compatibility
but are not selected, collected, submitted, or displayed by the frontend.
Phase 5.5 adds RPC-only resident appointment requests. Requested times are
preferences until staff assignment and confirmation; no SMS, email, or push
delivery is implemented.

## Deployment note

Migrations 1–25 are the completed remote baseline. Forward-only Migration 26 is
not applied by application startup. Review it and apply it manually through the
Supabase CLI before enabling the Reports route in production.

See [Resident registry architecture](docs/architecture/RESIDENT_REGISTRY.md),
[Appointment architecture](docs/architecture/APPOINTMENTS.md),
[Appointment workflow](docs/workflows/APPOINTMENT_WORKFLOW.md),
[Resident appointment request](docs/workflows/RESIDENT_APPOINTMENT_REQUEST.md),
[Health Records architecture](docs/architecture/HEALTH_RECORDS.md),
[Clinical encounter workflow](docs/workflows/CLINICAL_ENCOUNTER.md),
[Reports architecture](docs/architecture/REPORTS_ANALYTICS.md),
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
