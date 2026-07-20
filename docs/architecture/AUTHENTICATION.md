# Authentication foundation

## Scope

Phase 2A connects the React application to Supabase Auth. It provides email and
password sign-in, local sign-out, session restoration and refresh, active
profile validation, centralized role permissions, protected routes, and
authentication states. It does not add public registration, password reset, or
any healthcare module.

## Runtime flow

```text
Login / restored browser session
  -> authService (Supabase Auth)
  -> server-validated auth user (`getUser`)
  -> `profiles` row through RLS
  -> active account and canonical role validation
  -> AuthProvider (one profile object)
  -> protected route and permission-aware application shell
```

Pages never call Supabase directly. `src/services/authService.js` is the reusable
boundary for authentication and profile loading. `AuthProvider` owns the only
shared profile state and exposes exactly these profile values:

- `id`
- `role`
- `first_name`
- `last_name`
- `avatar`

`account_status` is read only while validating access and is never retained in
the shared frontend profile. The session is managed internally by Supabase and
is not duplicated into application state.

## Session behavior

The Supabase client enables persisted sessions, automatic token refresh, and a
custom storage adapter. Selecting **Remember me** stores the auth session in
`localStorage`; clearing it stores the session in `sessionStorage`, which still
supports a page refresh but ends with the browser session. Storage cleanup is
limited to Supabase auth-token keys.

On application start and relevant auth events, the service:

1. reads the locally persisted session;
2. refreshes a missing or nearly expired access token;
3. validates the user with Supabase Auth rather than trusting local token data;
4. loads the matching profile through RLS;
5. rejects missing profiles, deleted auth users, unsupported roles, and any
   account that is not `active`.

Network failures use a retryable, fail-closed screen. Terminal session or
profile failures clear the local auth session and return the user to sign-in.

## Roles and permissions

Canonical database roles are `admin`, `barangay_health_worker`, `nurse`,
`midwife`, and `resident`. `src/features/auth/permissions.js` is the single
frontend permission map:

| Role                   | User-interface permissions in this phase  |
| ---------------------- | ----------------------------------------- |
| Administrator          | All system permissions                    |
| Barangay Health Worker | Residents, appointments, announcements    |
| Nurse                  | Appointments, consultation/health records |
| Midwife                | Maternal and child care                   |
| Resident               | Dashboard and own-profile permission only |

Navigation filtering and `RoleGuard` are usability controls, not authorization
boundaries. PostgreSQL grants and Row Level Security remain authoritative. A
role supplied by form input, route state, browser storage, or user metadata is
never used.

## Route behavior

- Guests are redirected to `/login`, with the intended internal path retained.
- Authenticated users enter the dashboard and can access routes allowed by the
  profile role.
- Authenticated users without a required permission see `/access-denied`.
- Session recovery blocks protected content until validation completes.
- The configuration guide is reachable only when public Supabase configuration
  is absent; otherwise it redirects to sign-in.

## Account provisioning and deployment

There is no registration endpoint or registration page in the frontend. The
local Supabase configuration disables general and email signup. Production
projects must also disable **Allow new users to sign up** in the hosted Supabase
Auth settings. Accounts and matching profiles are provisioned by the Phase 2B
`manage-user` Edge Function after independent active-administrator verification.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in the
frontend. Never expose a Supabase secret or service-role key.

## Verification coverage

Automated tests cover successful login/profile shaping, local logout, persisted
session restore, expired-session refresh, missing profiles, inactive accounts,
deleted auth users, protected-route redirects, allowed access, denied access,
and the centralized role matrix. Live login still requires a configured
Supabase project with migrations applied and a trusted active test account.

## Phase 2B integration

Safe own-profile settings use the existing self-update RLS policy and protection
trigger. Privileged role, status, email invitation, Auth creation, and other-user
profile actions use the trusted Edge Function only. The provider revalidates an
authenticated profile on focus, tab visibility, Auth events, and every five
minutes. Database RLS reflects status and role changes immediately.

See [Trusted user management](USER_MANAGEMENT.md) for the server boundary and
[Administrator bootstrap](../security/ADMIN_BOOTSTRAP.md) for the one-time
initialization procedure.
