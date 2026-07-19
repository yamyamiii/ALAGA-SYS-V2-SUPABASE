# Phase 0 foundation architecture

## Goals

The foundation keeps the application approachable for student developers while
establishing boundaries that prevent the weaknesses of a client-only prototype.
It separates route pages, visual components, shared configuration, server-state
coordination, and eventual data access.

## Runtime composition

`src/main.jsx` mounts `App`. The application-level error boundary contains
unexpected render failures. Providers add React Query, the future authentication
context placeholder, tooltips, and Sonner. `BrowserRouter` delegates route
selection to the centralized router.

Route pages render within `AppShell`, which owns the responsive desktop sidebar,
mobile navigation sheet, header, breadcrumb support, and content container.
Routes are lazy loaded to keep features separable as the project grows.

## Data-access rule

```text
Page / feature hook -> service or repository module -> Supabase client
                     -> React Query cache          -> visual component
```

- Pages and visual components do not call Supabase.
- Service modules will own query shapes and database error translation.
- React Query will coordinate server state, caching, invalidation, and loading.
- Visual components receive data and callbacks through props.
- Shared route strings and navigation metadata live under `src/config`.
- Forms will use React Hook Form and Zod schemas from feature or validation code.

No service or query has been implemented in Phase 0.

## Supabase boundary

`src/lib/supabase/client.js` accepts only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. It exports a single configured client when the
values exist and a getter that throws `SupabaseConfigurationError` when they do
not. Nothing in the current UI imports this module, and it makes no database
request.

The publishable key identifies the project; it is not authorization. PostgreSQL
constraints and Row Level Security must enforce all access. Client-side route or
menu filtering is a usability concern only and can never be a security boundary.

## Role metadata

Navigation items include intended role metadata in one configuration file. The
UI deliberately does not enforce those roles in Phase 0. Real authorization is
deferred until authentication and RLS exist.

## Error handling

- The error boundary provides a recoverable top-level fallback.
- A dedicated configuration-error page explains missing public variables.
- Shared empty, loading, and error states keep async behavior consistent.
- Development-only error logging avoids silently hiding unexpected failures.

## Incremental feature organization

Feature-specific UI, hooks, schemas, and mapping logic should live under
`src/features/<feature>`. Only genuinely reusable pieces move to shared folders.
This avoids both large page files and premature enterprise abstraction.
