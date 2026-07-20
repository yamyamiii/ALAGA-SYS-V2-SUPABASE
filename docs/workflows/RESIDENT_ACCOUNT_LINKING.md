# Resident portal account linking

## Trusted flow

Only an active administrator can open the account action in Resident Details.
The browser calls `userManagementService`, which invokes `manage-user` with the
current session. The Edge Function validates the JWT, reloads the administrator
profile, rate-limits the action, and calls service-role-only PostgreSQL RPCs.

An administrator may search a narrow list of unlinked resident-role profiles in
`active` or `invited` status, or invite a new account. The candidate response is
limited to safe profile identity fields, account status, and email; it is not a
general Auth user browser. New invitations force role `resident`. After Auth and
profile provisioning succeed, the trusted RPC links the returned profile UUID.
Failed linking compensates by removing only the newly created Auth account.

## Database safeguards

- `residents.linked_profile_id` is unique, so a profile cannot link twice.
- The existing column permits only one value per resident.
- The trusted RPC locks the resident, rejects archived records, staff roles,
  inactive/suspended profiles, and already-linked profiles.
- A database trigger rejects direct browser changes unless the trusted RPC marks
  the transaction.
- Unlink requires a second administrator confirmation and never deletes the
  Auth user or profile.

RLS continues to grant a resident only its own active linked row. Archived
records and their photos remain unavailable to resident accounts.

## Audit events

Invitation provisioning records `user.invited`. Linking and unlinking record
`resident.account_linked` and `resident.account_unlinked` using only actor,
resident/profile UUIDs, and safe summaries. No invitation URL, token, email
contents, contact detail, or demographic values are copied into audit metadata.

## Live test

1. As administrator, link an eligible invited resident profile.
2. Confirm the same profile disappears from other residents' candidates.
3. Sign in as that resident and confirm only its active linked row/photo is
   available through RLS.
4. Confirm BHW, nurse, midwife, resident, and anonymous requests cannot call the
   service-role linking RPCs.
5. Unlink with confirmation and verify the Auth user still exists.
