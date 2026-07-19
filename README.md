# ALAGA-SYS V2

**Automated Local Appointment and General Assistance System** is a planned
barangay healthcare management system. This repository currently contains the
Phase 0 application foundation: a responsive interface, maintainable frontend
architecture, public Supabase configuration boundary, and project guidance.

No database tables, real healthcare records, or authentication workflows exist
in this phase.

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
supabase/          Future migrations, seed guidance, and RLS policies
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

When a later phase needs Supabase, copy the example to `.env.local` and add only
the project URL and **publishable** key. Vite exposes every `VITE_` value to the
browser.

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
npm run lint
npm run format
npm run format:check
npm run preview
```

## Current phase

Phase 0 establishes the frontend foundation and design system only. Dashboard
values are visibly marked as previews or empty states. Authentication controls,
including the account avatar and logout item, are non-functional placeholders.

## Next phase

Phase 1 will design the normalized PostgreSQL schema and Row Level Security
policies. It should begin with a reviewed data model, foreign-key relationships,
enumerated statuses, timestamps, indexes, audit requirements, and a migration
strategy before connecting any frontend module.

See [Foundation architecture](docs/architecture/FOUNDATION.md), [Design system](docs/ui/DESIGN_SYSTEM.md), and [Roadmap](docs/requirements/ROADMAP.md).
