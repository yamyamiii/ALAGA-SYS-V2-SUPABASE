# Outbound notification architecture

Migration 32 adds optional email and SMS delivery around the existing in-app notification system. In-app notifications remain authoritative. Appointment, clinical, maternal/child, announcement, and inquiry transactions commit even when queue creation or an external provider fails.

## Flow

1. A reviewed database trigger observes an approved workflow transition.
2. The database derives the linked profile from the source row, checks active account/resident eligibility and preferences, and inserts an idempotent job.
3. A scheduler calls `process-notification-jobs` with a dedicated bearer token.
4. The service-role RPC claims a bounded batch using an advisory lock and `FOR UPDATE SKIP LOCKED`.
5. The Edge Function revalidates account eligibility, resolves a confirmed Auth email or phone server-side, renders an allowlisted localized template, and invokes the configured provider adapter.
6. A service-role completion RPC records only outcome metadata and either marks the job sent/failed or schedules bounded exponential retry.

The browser cannot enqueue jobs, select recipients, read queue tables, process delivery, or submit message content. User-facing preference changes and the administrator summary use narrow RPCs. All operational tables have RLS enabled and no direct `authenticated` table grants.

## Reliability boundaries

- `(recipient_profile_id, channel, event_key)` prevents duplicate enqueue.
- Provider requests use the job UUID as their idempotency key.
- Claims are bounded to 50, reserve global/per-recipient hourly capacity, and recover processing leases older than ten minutes.
- Temporary failures retry after bounded exponential delays; jobs have at most seven automated attempts and two administrator-requested retries.
- Provider outages or disabled channels leave eligible jobs safely pending.
- Job payloads contain only strict operational template variables, never rendered clinical content.

The generic HTTP adapters are provider-neutral integration contracts. No paid provider or schedule is activated by repository code.
