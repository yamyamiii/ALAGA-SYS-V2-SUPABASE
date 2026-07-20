# Phase 3C production quality review

## Scope

This review covers the completed authentication, trusted user management, and
household/resident registry. It adds no appointment or clinical workflow and
does not change the database schema, migrations, grants, or RLS policies.

## Review summary

| Area            | Verified behavior                                                                                                                            | Hardening in Phase 3C                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Authentication  | Login, local logout, storage-selected persistence, session restore/refresh, active-profile validation, route and role guards                 | All Supabase browser requests now have a 20-second upper bound; offline state is announced globally                |
| User management | Server paging/search, invite/create, detail, role/status changes, confirmation flows, safe response shaping                                  | Mobile pagination wraps instead of overflowing                                                                     |
| Registry        | Server paging/search/sort/filter, detail views, archive/restore, relationships, photo validation/storage, account linking                    | Resident images lazy-load and decode asynchronously; selectors and async states have stronger accessible semantics |
| Responsive UI   | Desktop tables and compact-screen cards, responsive shell/forms, scrollable complex dialogs                                                  | Every dialog receives a dynamic-viewport height limit and a 40-pixel close target                                  |
| Security        | RLS-authoritative reads/writes, trusted Edge Function administration, no browser secret, no unsafe HTML sink, allowlisted writes and uploads | Timeout/offline handling fails without mutating saved data; production copy exposes no internal phase labels       |
| Performance     | React Query caching, debounced server search, route-level lazy loading, short-lived photo URL cache                                          | Shared libraries are split into stable vendor chunks; unused Recharts dependency removed                           |

## Accessibility checks

- Radix dialogs and sheets retain focus trapping and Escape-to-close behavior.
- Icon-only actions have accessible names; the household-head selector now has
  an explicit name.
- Loading states use `role="status"`, `aria-live`, and `aria-busy`; errors use an
  assertive alert role.
- Offline status is announced and does not rely on color alone.
- Dialog content scrolls inside the 390-pixel mobile viewport, and close controls
  meet the project's touch-target baseline.
- Reduced-motion preferences remain honored globally.

## Responsive targets

Responsive rules were reviewed against the 1366, 768, and 390 CSS-pixel target
widths. Desktop tables switch to cards before their minimum widths would create
page overflow. Page headings, filters, action groups, pagination, and dialog
footers stack or wrap on narrow screens. Dialogs use `dvh` limits so browser
chrome changes do not make actions unreachable. A rendered staging pass at all
three widths remains required because an interactive browser target was not
available in the QA environment.

## Error and recovery model

React Query workflows retain loading, empty, server-error, permission-error,
retry, and reconnect behavior. The global banner makes offline state explicit.
The Supabase fetch boundary aborts a request after 20 seconds; services continue
to map provider details to safe user messages. Mutations are never presented as
successful until their service operation resolves.

## Remaining operational checks

- Run authenticated smoke tests against a staging Supabase project for each
  canonical role; automated tests cannot prove hosted Auth, SMTP, Storage, or RLS
  configuration.
- Add automated browser accessibility scans and performance budgets to CI when a
  supported browser runner is selected.
- Add production monitoring for Edge Function latency/error rates and private
  storage orphan reconciliation before launch.
- Review real data volumes and query plans before setting appointment-system
  capacity targets.
