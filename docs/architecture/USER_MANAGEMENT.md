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
- `list_resident_link_candidates`
- `get_resident_account`
- `link_resident_account`
- `unlink_resident_account`
- `invite_resident_account`
- `list_resident_registrations`
- `approve_resident_registration`
- `reject_resident_registration`
- `delete_resident_registration_account`
- `delete_user_account`
- `retire_user_account`

There is no unrestricted delete-user action. Migration 49 generalizes the
narrowly scoped permanent-delete boundary to Resident, Barangay Health Worker,
Nurse, and Midwife targets. Administrator targets are always rejected. The
database must find the target free of appointments, clinical records, maternal
or child records, documents, audit authorship, announcements, inquiries,
notifications/outbound jobs, backup operations, photos, and every other current
or future foreign-key dependency. Account status and creation source do not
decide eligibility. The action remains unavailable to every browser role except
through the active-Administrator-verified Edge Function.

Pending and rejected Resident registration review is intentionally limited to
Cancel, Reject, and Approve/Link decisions. A pending request has no permanent
delete control. After rejection, its invited Auth/profile identity remains a
historical rejected signup and may be cleaned up only from the separate normal
managed-user row or detail view when the server reports no protected
dependency. Approved and Administrator-created non-Administrator accounts use
that same managed-user cleanup surface. The database remains final authority.

For a dependency-free account, the generalized prepare RPC atomically locks and
suspends the profile, stages any Resident, registration, and
notification-preference rows in an RLS-protected table with no browser or direct
service-role table grants, and removes only that disposable state before the
Edge Function permanently deletes the Auth user. If Auth deletion fails, the
private compensation RPC restores the exact Resident number, attribution,
registration, preferences, and prior account status. Protected history is never
deleted. Migration 53 gives those protected-history accounts a separate
retirement workflow: the retained profile is marked inactive and retired, the
Auth email is replaced by a UUID-based address under the reserved `.invalid`
domain, and the Auth user is banned for 100 years. The permanent database
retirement marker continues to deny access after that Auth ban duration, so the
original email becomes reusable without deleting the historical identity.
Migration 52 permits an archived Resident identity row itself to pass this
assessment while retaining every real profile/Resident foreign-key, media, and
lifecycle blocker. The service-role-only assessment returns only a coarse safe
category such as appointment, clinical, audit, inquiry, notification, media, or
other protected history; it never returns record content.

Retired profiles are excluded from the normal User Management list and detail
RPCs. They remain referenced by appointments, clinical records, audit entries,
documents, and other protected history. Retirement is available only for a
supported non-Administrator account that fails hard-delete eligibility for a
recognized retention reason; dependency-free accounts must continue through
the compensated hard-delete workflow. If the Auth retirement operation fails,
the database compensation RPC restores the prior account status and removes the
retirement marker.

`create_user` marks the Auth user's server-side app metadata with
`requires_password_change`; because Supabase does not provide a native
forced-password-change state for this workflow, administrators must use the
documented secure handoff. Invitations remain the preferred workflow.

Resident-link actions are administrator-only and narrowly scoped. Candidate
listing returns only active/invited, resident-role profiles not already linked.
Resident invitation forces the resident role, compensates a failed link by
removing only the newly created Auth user, and never exposes a general Auth
Admin browser client. Unlinking never deletes Auth or profile rows.

Resident self-registration review is also Administrator-only. The pending list
shows validated application fields plus exact name-and-birth-date candidates.
When a candidate exists, new-record creation fails until the Administrator
explicitly selects the verified unlinked active Resident. Approval generates a
Resident number through the existing database sequence, links the Auth profile,
and activates it in one transaction. Rejection leaves the account unable to
enter protected routes. BHW accounts have no review RPC or route permission.

Email confirmation is the trusted readiness boundary for review notifications.
Once a captured registration is still pending and its Auth email is confirmed,
the database creates one privacy-minimized in-app notification for each active
Administrator. Recipient-scoped deduplication prevents repeated confirmation
callbacks from adding duplicate rows. The fixed symbolic destination is User
Management; BHW, Nurse, Midwife, Resident, inactive, suspended, and retired
profiles are never selected as recipients.

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
