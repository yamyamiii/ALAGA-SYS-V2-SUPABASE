# ALAGA-SYS

**Automated Local Appointment and General Assistance System** is a planned
barangay healthcare management system. This repository currently contains the
Phase 0 application foundation, the Phase 1 normalized PostgreSQL schema and
deny-by-default Row Level Security, the Phase 2A Supabase Auth foundation, and
the Phase 2B trusted administrator/user-management workflow, and the Phase 3A
household and resident demographic registry. Phase 3B adds private resident
photos, trusted resident-account linking, scalable household selection, and
RLS-safe duplicate review.

No appointment or clinical healthcare workflow is implemented in this phase.

## Technology stack

- React 19 with Vite 7 (JavaScript and JSX)
- React Router
- Tailwind CSS and focused shadcn/ui-compatible components
- Lucide React and Sonner
- TanStack React Query
- React Hook Form, Zod, and Hook Form resolvers
- date-fns and Recharts
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
`/residents`, and unfinished healthcare module routes remain shared placeholders.

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

Phase 3B hardens household and resident listing, creation, editing, details,
relationship management, archival/restoration, server paging/search, safe audit
events, and RLS-aligned route permissions. Resident images use a private,
resident-authorized bucket and short-lived signed URLs. Account linking remains
administrator-only behind the trusted Edge Function. Household selection is
debounced/server-paginated, and probable duplicates require an explicit audited
override. Registry locality is configured for
Brgy. Bagongpook with Purok 1 through Purok 7; barangay UUID resolution remains
database-backed. Public registration, physical deletion, and password reset
remain unavailable.

## Next phase

Future phases may extend registry workflows or implement appointments. They must
not weaken database policies or place secret credentials in the frontend.

See [Resident registry architecture](docs/architecture/RESIDENT_REGISTRY.md),
[Private photo storage](docs/architecture/STORAGE.md),
[Resident account linking](docs/workflows/RESIDENT_ACCOUNT_LINKING.md),
[Storage deployment](docs/deployment/SUPABASE_STORAGE.md),
[Authentication architecture](docs/architecture/AUTHENTICATION.md),
[RLS matrix](docs/database/RLS_MATRIX.md), and
[Roadmap](docs/requirements/ROADMAP.md).
