# ALAGA-SYS V2

**Automated Local Appointment and General Assistance System** is a planned
barangay healthcare management system. This repository currently contains the
Phase 0 application foundation plus the Phase 1 normalized PostgreSQL schema,
database constraints, audit foundation, and deny-by-default Row Level Security.

No real healthcare records, frontend authentication workflow, or frontend
database queries exist in this phase.

## Technology stack

- React 19 with Vite 7 (JavaScript and JSX)
- React Router
- Tailwind CSS and focused shadcn/ui-compatible components
- Lucide React and Sonner
- TanStack React Query
- React Hook Form, Zod, and Hook Form resolvers
- date-fns and Recharts
- Supabase JavaScript client (connection foundation only)
- ESLint and Prettier

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
  services/        Future data access boundary used by features/pages
  styles/          Global styles and design tokens
  utils/           Framework-independent helpers
supabase/          Ordered migrations, synthetic seed, and RLS foundation
docs/              Architecture, requirements, database, and UI documentation
```

Pages must not call Supabase directly. Future server operations belong in
service or repository-like modules, server state belongs in React Query, and
forms will use React Hook Form with Zod validation.

## Requirements

- Node.js 20.19 or newer (Node 24.15 was used for Phase 0 verification)
- npm 11 or a compatible npm release
- A Supabase project is optional until the database phase begins

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

The reusable client boundary is `src/lib/supabase/client.js`. It does not make a
query. Calling `getSupabaseClient()` without both public variables throws a clear
`SupabaseConfigurationError`.

## Development

```bash
npm run dev
```

Vite prints the local URL. The dashboard is at `/`; unfinished module routes use
the shared Coming Soon page.

## Quality commands

```bash
npm run build
npm run db:verify
npm run lint
npm run format
npm run format:check
npm run preview
```

## Current phase

Phase 1 adds seven normalized foundation tables, ordered migrations, constraints,
indexes, synthetic reference seed data, audit triggers, explicit grants, and
restrictive RLS policies. Dashboard values remain previews or empty states.
Authentication controls, including the account avatar and logout item, remain
non-functional placeholders.

## Next phase

Phase 2 will implement Supabase Authentication, account invitation/activation,
trusted role administration, protected routes for user experience, and live RLS
verification with synthetic accounts. It must not weaken the database policies
or place service-role credentials in the frontend.

See [Foundation architecture](docs/architecture/FOUNDATION.md), [Database schema](docs/database/SCHEMA.md), [RLS matrix](docs/database/RLS_MATRIX.md), [Design system](docs/ui/DESIGN_SYSTEM.md), and [Roadmap](docs/requirements/ROADMAP.md).
