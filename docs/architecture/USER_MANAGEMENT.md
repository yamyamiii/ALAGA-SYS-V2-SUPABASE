# Trusted user-management architecture

## Request path

```text
Admin React module
  -> browser Supabase client with current user JWT
  -> manage-user Edge Function
     -> exact-origin CORS check
     -> Auth getUser token verification
     -> active admin profile verification
     -> atomic administrator rate limit
     -> explicit action schema
     -> Supabase Auth Admin API and/or service-role-only RPC
  -> sanitized response
  -> React Query cache and admin UI
```

Frontend route guards and hidden controls are usability measures. The Edge
Function independently verifies the Auth user and profile, while each privileged
database RPC independently requires an active administrator actor. The final
active administrator is also protected by a database trigger.

## Supported actions

- `invite_user`
- `create_user`
- `resend_invitation`
- `update_role`
- `update_account_status`
- `update_profile`
- `list_users`
- `get_user`

There is no delete-user action. `create_user` marks the Auth user's server-side
app metadata with `requires_password_change`; because Supabase does not provide a
native forced-password-change state for this workflow, administrators must use
the documented secure handoff. Invitations remain the preferred workflow.

## Data minimization

User responses contain only ID, email, canonical role, safe name/contact fields,
account status, last login, creation time, invitation time, and status-change
time. Passwords, password hashes, tokens, invitation links, identity arrays,
Auth provider metadata, and arbitrary user metadata are never returned.

The profile update schema accepts only first, middle, and last name, suffix, and
phone number. Role and status have separate sensitive actions. Unknown fields
are rejected at the Edge Function.

## Failure handling

If Auth invitation/creation succeeds but the profile finalization RPC fails, the
function attempts to remove that newly created Auth user as a compensating
action. If compensation also fails, it returns `provisioning_incomplete` so an
operator can reconcile the UUID. It never returns or logs a password or invite
link.

Known callers receive stable safe error codes. Appropriate rejected privileged
actions are audited using actor ID, target ID when available, action class, and a
safe error code. Invalid bearer tokens are not written as profile audit entries
because no trusted actor can be resolved.

## Role and status propagation

Database RLS checks the current profile on every protected database operation,
so role removal, inactivity, or suspension takes effect there immediately. The
Phase 2A provider revalidates on focus, when the tab becomes visible, on Auth
events, and at a five-minute interval. This updates navigation or signs out an
account without trusting stale frontend role state.
