# ALAGA-SYS V2 roadmap

## Phase 0 — Foundation

Vite/React project, responsive application shell, design system, route and
provider composition, Supabase connection boundary, documentation, and quality
tooling. No database or authentication implementation.

## Phase 1 — Database schema and RLS

Design normalized PostgreSQL tables, foreign keys, constraints, indexes,
migrations, audit foundations, storage buckets/policies, and deny-by-default Row
Level Security policies. Use synthetic development fixtures only.

## Phase 2 — Authentication and user roles

Implement Supabase Authentication, staff profiles, role assignment governance,
protected routes for user experience, and RLS-backed authorization.

## Phase 3 — Resident and household management

Build paginated resident and household workflows with relational links,
validation, search, and auditable changes.

## Phase 4 — Appointment scheduling and queue

Add appointment capacity, conflict handling, statuses, daily queues, and safe
concurrent updates.

## Phase 5 — Encounters and health records

Add access-controlled clinical encounters and health record workflows with
strict auditing and privacy protections.

## Phase 6 — Maternal and child healthcare

Add program-specific relational records, schedules, and monitoring workflows
after clinical review.

## Phase 7 — Reports, analytics, exports, and printing

Add server-side aggregates, permission-aware reports, bounded exports, and
printable operational summaries.

## Phase 8 — General assistance

Add announcements, in-app notification read state, activity timelines,
health-center information, FAQs, and resident inquiry tickets.

## Phase 9A — Secure ALAGA AI assistant foundation

Add an authenticated, server-proxied Gemini assistant for role-aware system
guidance and general assistance. Keep conversations in browser memory only,
send no application PHI, apply server-side medical and prompt-injection safety
boundaries, and enforce a per-profile server rate limit.

## Phase 9B — Advanced AI capabilities (future)

Any database-grounded answer, report generation, navigation or mutation tool,
clinical-data use, external knowledge retrieval, or autonomous action requires
a separately approved threat model, narrow authorization design, audit model,
and privacy review. None is part of Phase 9A.

## Future phases

Medicine inventory, dispensing, laboratory integrations, external notification
delivery, backup/restore operations, advanced AI capabilities, and final
deployment hardening remain explicitly out of scope until separately approved.
