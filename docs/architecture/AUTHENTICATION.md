# Authentication foundation

## Scope

Phase 2A connects the React application to Supabase Auth. It provides email and
password sign-in, local sign-out, session restoration and refresh, active
profile validation, centralized role permissions, protected routes, and
authentication states. Migration 44 adds Resident-only self-registration with
Administrator verification. Email/password recovery uses Supabase's standard
recovery session and token flow; ALAGA-SYS does not create custom reset tokens.

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

## Account recovery and password changes

- `/forgot-password` sends a privacy-safe reset request to the current browser
  origin plus `/reset-password`. The success response does not reveal whether
  the email is registered.
- `/reset-password` accepts only a valid Supabase recovery callback containing
  recovery tokens, a recovery OTP hash, or a PKCE recovery code. A normal
  signed-in session cannot activate the reset form.
- After `updateUser({ password })` succeeds, the temporary recovery session is
  revoked and local Auth storage is cleared before redirecting to `/login`.
- Account Settings requires the current password, reauthenticates the current
  email/password account, revalidates its active profile, and then updates the
  password. It provides no administrator reset capability.
- Sign-in maps `email_not_confirmed` separately from invalid credentials and can
  resend the standard Supabase signup confirmation email.

All password forms reuse the Resident signup policy: 8–128 characters with at
least one lowercase letter, uppercase letter, and number. Recovery changes only
the Auth password. It never activates a pending, inactive, or suspended profile,
changes a role, or bypasses Administrator approval.

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

| Role                   | Current application boundary                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Administrator          | Full configured application permissions, including trusted User Management                                       |
| Barangay Health Worker | Registry and appointment operations, approved reports, announcements/inquiries, and bounded health-record access |
| Nurse                  | Assigned appointment operations, health records/vital signs, approved reports, and announcements                 |
| Midwife                | Assigned appointment and authorized clinical workflows, approved reports, and announcements                      |
| Resident               | Own appointments/profile, own notifications, announcements, and resident-safe assistance                         |

Navigation filtering and `RoleGuard` are usability controls, not authorization
boundaries. PostgreSQL grants and Row Level Security remain authoritative. A
role supplied by form input, route state, browser storage, or user metadata is
never used.

## Route behavior

- Public routes are `/login`, `/register/resident`, `/register/status`,
  `/forgot-password`, `/reset-password`, and `/configuration-error`. Other guest
  requests are redirected to `/login`, with the intended internal path retained
  where appropriate.
- Authenticated users enter the dashboard and can access routes allowed by the
  profile role.
- Authenticated users without a required permission see `/access-denied`.
- Session recovery blocks protected content until validation completes.
- A temporary password-recovery session is accepted only on `/reset-password`
  and cannot enter protected application routes. Successful recovery revokes
  that temporary session. Account Settings separately requires current-password
  reauthentication before changing an active account's password.
- The configuration guide is reachable only when public Supabase configuration
  is absent; otherwise it redirects to sign-in.

## Account provisioning and deployment

The public `/register/resident` route uses Supabase email signup and submits only
the approved Resident identity fields. The Auth trigger always assigns the
`resident` role and `invited` status; it never reads a role or status from user
metadata. A pending account is signed out and cannot enter protected routes.
An Administrator must approve and create or explicitly link the Resident record
through the `manage-user` Edge Function before the profile becomes active.
Staff accounts continue to be provisioned only by trusted administrators.

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
