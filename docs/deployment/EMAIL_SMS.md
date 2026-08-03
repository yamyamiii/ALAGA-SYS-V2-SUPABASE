# Email and SMS deployment

Migration 32 and the `process-notification-jobs` Edge Function are pending until manually reviewed and deployed. Repository tests never send externally. No commercial provider is selected or activated.

## Server-only configuration

Set these as Edge Function secrets, never as `VITE_` variables:

```text
NOTIFICATION_PROCESSOR_TOKEN=<random value of at least 32 characters>
EMAIL_PROVIDER=http
EMAIL_PROVIDER_URL=https://your-reviewed-gateway.example/email
EMAIL_API_KEY=<provider secret>
EMAIL_FROM_ADDRESS=health-center@example.org
EMAIL_FROM_NAME=ALAGA-SYS
EMAIL_REPLY_TO=<optional confirmed reply address>

SMS_ENABLED=false
SMS_PROVIDER=http
SMS_PROVIDER_URL=https://your-reviewed-gateway.example/sms
SMS_API_KEY=<provider secret>
SMS_SENDER_ID=ALAGA-SYS
```

`SUPABASE_URL` and the service-role/secret key are supplied to deployed Supabase Edge Functions. Optional processing limits are `EMAIL_GLOBAL_HOURLY_LIMIT` (default 100), `SMS_GLOBAL_HOURLY_LIMIT` (50), `EMAIL_RECIPIENT_HOURLY_LIMIT` (20), and `SMS_RECIPIENT_HOURLY_LIMIT` (5).

SMS remains disabled unless `SMS_ENABLED=true` and every SMS provider value is valid. Enabling SMS may incur provider charges and requires an operational, privacy, consent, and sender-registration review.

## Generic gateway contract

The email adapter sends JSON containing `to`, `from`, optional `reply_to`, static `subject`, `text`, escaped `html`, and `tracking: false`. The SMS adapter sends `to`, `sender_id`, and a bounded template `message`. Both use bearer API authorization and an `Idempotency-Key` header. A 2xx response succeeds; 408, 429, and 5xx are temporary; other non-2xx responses are permanent. A safe `x-message-id` response header may be retained as a provider reference.

## Manual deployment order

1. Review `npx supabase db push --dry-run` and confirm only Migration 32 is pending.
2. Apply it explicitly with `npx supabase db push` after approval.
3. Configure email secrets. Keep `SMS_ENABLED=false`.
4. Deploy only the processor: `npx supabase functions deploy process-notification-jobs`.
5. Invoke it once from a trusted non-browser runner with `POST`, bearer `NOTIFICATION_PROCESSOR_TOKEN`, and optional JSON `{ "batch_size": 20 }`. This records configured/disabled channel heartbeat status.
6. Configure a reviewed cron-compatible HTTPS runner to make that invocation every minute. Store the token only in that runner's secret store. Do not put it in a browser, URL, database migration, or logs.
7. Test opt-in with synthetic accounts and masked dashboard results before live resident use. Activate SMS only after separate approval.

The processor rejects browser-origin requests. If a provider is unavailable, core workflows and in-app notifications continue; external jobs follow bounded retry or remain pending while the channel is unconfigured.
