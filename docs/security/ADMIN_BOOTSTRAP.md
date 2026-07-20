# Initial administrator bootstrap

## Security model

ALAGA-SYS does not automatically promote the first registered user and exposes
no bootstrap route, API endpoint, browser secret, or permanent bootstrap
function. The project owner performs one reviewed SQL transaction for one known
Supabase Auth UUID. The source is
`supabase/bootstrap/first_admin.sql`.

The script is fail-closed:

- the all-zero placeholder UUID cannot run;
- the UUID must exist in `auth.users` and have a matching profile;
- an already-promoted target is an idempotent no-op;
- any other existing active administrator retires the bootstrap path;
- the operation writes an `admin.bootstrap` audit event.

## 1. Create the initial Auth user

1. Sign in to the hosted Supabase Dashboard as the project owner.
2. Open **Authentication → Users**.
3. Choose **Add user → Create new user**.
4. Enter the exact administrator email and a securely generated password.
5. Do not place role or account-status claims in user metadata. The database
   deliberately creates every new profile as an invited resident.
6. Record the generated Auth user UUID through an approved secure operational
   channel. Do not paste a password, token, or secret key into source control.

Use a fictional account in development. Production bootstrap identity selection
must be reviewed by the project owner.

## 2. Confirm the Auth UUID and profile

Run this read-only query in the SQL Editor, substituting the reviewed email:

```sql
select
  u.id,
  u.email,
  p.role,
  p.account_status
from auth.users as u
join public.profiles as p on p.id = u.id
where lower(u.email) = lower('REPLACE_WITH_EXACT_EMAIL');
```

Stop unless exactly one row and the expected email are returned. Copy the UUID
from that row, not from browser state or user-provided metadata.

## 3. Run the reviewed bootstrap transaction

1. Open `supabase/bootstrap/first_admin.sql` locally.
2. Replace only the all-zero `target_user_id` with the reviewed UUID.
3. Review the UUID and the script again with a second operator where possible.
4. Paste and run the complete transaction in the hosted SQL Editor after all
   migrations through `20260720001200_trusted_user_management.sql` are applied.
5. Keep the original repository file unchanged; do not commit a real UUID.

The transaction sets `role = admin`, `account_status = active`, updates the
status timestamp, and appends a narrowly scoped audit entry. It never handles a
password or Auth token.

## 4. Verify the result

```sql
select
  u.id,
  u.email,
  p.role,
  p.account_status,
  p.status_changed_at
from auth.users as u
join public.profiles as p on p.id = u.id
where u.id = 'REPLACE_WITH_REVIEWED_UUID'::uuid;

select
  actor_profile_id,
  action,
  entity_id,
  old_values,
  new_values,
  created_at
from public.audit_logs
where action = 'admin.bootstrap'
order by created_at desc
limit 5;
```

The profile must be the expected UUID with role `admin` and status `active`.
There must be a corresponding bootstrap audit event without an email, password,
token, or invitation URL.

## 5. Log in and establish administrator redundancy

1. Sign in through `/login` with the manually created credentials.
2. Confirm that **User Management** appears and `/user-management` opens.
3. Invite or create a second reviewed administrator when operational policy
   permits.
4. Activate the second administrator and verify that account independently.

Maintaining at least two reviewed administrators is recommended. The database
prevents demoting, suspending, deactivating, or deleting the final active one.

## 6. Retire the bootstrap capability

No callable capability is installed, so there is no function or endpoint to
revoke. After the first active administrator exists, the script refuses to
promote another account. Keep SQL Editor and database-owner access restricted to
project owners, remove any temporary local copy containing a real UUID, and use
the trusted User Management workflow for all subsequent role changes.

## Recovery from a wrong UUID

Do not deactivate or demote the only active administrator first. The database
will reject that change.

1. Confirm the correct Auth UUID and profile using the read-only query above.
2. In one reviewed owner transaction, promote and activate the correct profile
   first.
3. Verify the correct administrator can sign in.
4. Only then demote or deactivate the incorrectly selected profile.
5. Insert explicit semantic audit events for both corrective changes, including
   the affected UUIDs and old/new role or status only.

If the wrong account is compromised, restrict project access operationally while
the correction is reviewed. Never weaken or drop the final-admin trigger as a
shortcut.
