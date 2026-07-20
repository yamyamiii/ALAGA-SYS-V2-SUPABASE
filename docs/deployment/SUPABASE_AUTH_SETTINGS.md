# Hosted Supabase Auth and Edge Function settings

These are manual hosted-project steps. Local source configuration does not prove
that any Dashboard setting or deployment has been changed.

## Authentication settings

In **Authentication → Sign In / Providers → Email**:

1. Disable public email signup. ALAGA-SYS creates users only through the trusted
   Auth Admin workflow or the hosted Dashboard.
2. Keep anonymous sign-in disabled.
3. Choose an email-confirmation strategy appropriate to the environment.
   Invitation accounts should confirm ownership through the invitation email;
   direct temporary-password accounts are created as confirmed by the trusted
   administrator workflow.
4. Set the hosted minimum password length to at least 8. The ALAGA-SYS direct
   creation form requires at least 12 characters for temporary passwords.
5. Review leaked-password protection and password-strength requirements for the
   production plan.

Supabase documents that Auth Admin `createUser()` is server-only and that secret
keys must never be exposed in a browser:
<https://supabase.com/docs/reference/javascript/auth-admin-createuser>.

## URLs and invitation redirects

In **Authentication → URL Configuration**:

- Set **Site URL** to the deployed application origin in production.
- Add exact local redirect URLs such as `http://127.0.0.1:5173` and
  `http://localhost:5173` only for development projects.
- Add each exact deployed origin and invitation destination.
- Set the Edge Function `INVITATION_REDIRECT_URL` to one allowed destination.

Supabase ignores an unapproved invitation `redirectTo` and falls back to the Site
URL, so verify both settings together. Current invitation behavior is documented
at <https://supabase.com/docs/guides/auth/users#inviting-users>.

## Email delivery

The default hosted email provider is intended for initial testing and has a low
project-wide email limit. Supabase currently documents a default limit of two
emails per hour for endpoints that send email. Configure production custom SMTP,
sender identity, delivery monitoring, and appropriate Auth rate limits before a
real rollout:
<https://supabase.com/docs/guides/auth/rate-limits>.

Customize and review the **Invite user** template. Do not include sensitive
profile information in email templates.

## Edge Function environment variables

Required custom variable names:

- `ALLOWED_ORIGINS`
- `INVITATION_REDIRECT_URL`

Standard Supabase-provided server variables used by the function:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS` or the local legacy publishable-key variable
- `SUPABASE_SECRET_KEYS` or the local legacy service-role variable

The function also recognizes single-key `SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` variables in compatible non-hosted environments. Never
prefix a browser variable with a secret value and never commit an Edge Function
environment file containing real values. Supabase's current secret-management
reference is <https://supabase.com/docs/guides/functions/secrets>.

## Deploying the function

Authenticate and link the CLI outside source control, then review the target:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy manage-user
```

Set custom secrets through the hosted Dashboard or CLI without placing values in
shell history where operational policy forbids it. Keep JWT verification enabled;
`supabase/config.toml` declares `verify_jwt = true`. The function then performs a
second `getUser()` check and verifies the caller's active administrator profile
before using the server-only Auth Admin client.

Browser CORS is limited to `ALLOWED_ORIGINS`. Requests without an allowed Origin
do not receive an allow-origin header. Current Supabase Edge Function
authentication guidance is at
<https://supabase.com/docs/guides/functions/auth>.

## Verification checklist

1. In the Dashboard, confirm public email signup and anonymous sign-in are off.
2. From an unauthenticated browser, verify there is no registration route and a
   direct `manage-user` invocation returns an authentication error.
3. Optionally inspect the Auth settings endpoint with the project's public key
   and verify `disable_signup` is true. Do not print or store the key in logs.
4. Verify an active administrator can list sanitized users.
5. Verify a nurse, BHW, midwife, resident, inactive admin, and suspended admin
   receive a denial.
6. Send one fictional invitation and confirm the redirect remains on an allowed
   application URL.
7. Verify the response contains no password, token, identity array, Auth
   metadata, or invitation link.
8. Confirm corresponding semantic entries in `audit_logs`.
