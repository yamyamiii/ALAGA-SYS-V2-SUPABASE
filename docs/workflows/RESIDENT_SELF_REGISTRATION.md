# Resident self-registration

## Public submission

The login page links to `/register/resident`. The form accepts email, password,
confirmation, name, date of birth, sex, one active Bagongpook purok, and optional
address/phone. It has no role, account-status, staff, household, approval, or
Resident-number controls.

The browser uses Supabase email signup. User metadata contains only validated
application fields and the `resident_self_registration` marker. The existing
Auth trigger creates an `invited` Resident profile and Migration 44 captures the
application after independently resolving the canonical Brgy. Bagongpook
locality. Browser metadata never supplies role, status, barangay UUID, Resident
UUID, or Resident number.

## Pending state

Signup ends any immediate local Auth session and displays a pending-verification
screen. Email confirmation may run before or after that screen, depending on the
hosted Auth setting. Confirmation does not activate ALAGA-SYS access.

The registration form and service use independent single-flight guards, so a
double click or repeated Enter key press produces only one `signUp` request.
Supabase `over_email_send_rate_limit` responses explain that account creation
may already have started and offer confirmation resend instead of encouraging a
second signup. `over_request_rate_limit` is reported separately as a short-term
request limit. These safeguards do not retry Auth or email requests, bypass
Supabase limits, or disclose whether an unrelated email exists.

Pending and rejected profiles fail active-role helpers and protected routes.
They cannot read other Residents, appointments, health records, or private
application data. Their own registration status is the only direct table read
granted through RLS.

An unconfirmed signup does not alert staff. When email confirmation makes a
pending registration actionable, the database creates exactly one concise
in-app notification for each active Administrator. The notification uses the
registration UUID as trusted source metadata, opens `/user-management`, and
contains no name, birth date, phone number, address, or clinical information.
Repeated confirmation callbacks are harmless because recipient and registration
deduplication is enforced by the notification table.

## Administrator review

User Management lists pending Resident applications for Administrator accounts.
The trusted `manage-user` Edge Function repeats Administrator verification and
calls service-role-only RPCs.

- With no exact existing match, approval creates one active Resident row. The
  existing sequence trigger generates the `RES-YYYY-NNNNNN` number.
- With an exact name and birth-date match, automatic creation is blocked. The
  Administrator must verify and explicitly select an active, unlinked Resident.
- An already-linked, inactive, or archived candidate cannot be selected.
- Approval links the same Auth profile and activates it transactionally.
- Rejection records the decision but never grants protected access.

BHW, Nurse, Midwife, Resident, authenticated browser, and anonymous roles cannot
execute the review RPCs. Self-registered profiles are permanently constrained to
the Resident role so the public path cannot become staff provisioning.

## Permanent test-account cleanup

The trusted lifecycle backend can assess pending, rejected, approved, or active
Resident accounts, but the pending-registration review dialog intentionally
shows only Cancel, Reject, and Approve/Link. It does not expose permanent
deletion while an application is under review. Eligible managed-user cleanup is
performed from the separate Administrator User Management surface.

Permanent deletion is allowed only after the database guard proves that the
account has no protected history. A dependency-free linked Resident row is
staged and removed before the Auth user; the same row is restored automatically
if Auth deletion fails. Any appointment, clinical record, document, audit
authorship, inquiry, outbound job, photo, or unknown future reference blocks
hard deletion. The approved retirement workflow then removes login access and
releases the original email while retaining the historical profile and all
protected records. Neither path exposes Auth Admin access or service-role
credentials to the browser.

## Deployment

The repository contains exactly 56 migrations. Migrations 54 and 55 respectively
add the registration notification type and its trusted confirmation triggers;
Migration 56 applies the separate appointment start-slot rule. Repository
presence does not prove hosted deployment, so review the linked migration dry
run before applying any pending files. Migrations 54 and 55 do not require an
Edge Function deployment.
Then enable email signup, keep anonymous sign-in disabled, configure exact Site
URLs, choose the email-confirmation policy, and review CAPTCHA/rate limits. See
`docs/deployment/SUPABASE_AUTH_SETTINGS.md`.
