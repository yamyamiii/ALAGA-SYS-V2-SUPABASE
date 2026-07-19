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

## Phase 7 — Medicine inventory and dispensing

Track lots, expiries, stock movements, dispensing, reconciliation, and inventory
alerts with database-enforced integrity.

## Phase 8 — Announcements and notifications

Add targeted announcements, delivery preferences, read state, and safe scheduled
notification workflows.

## Phase 9 — Reports and dashboards

Add server-side aggregates, permission-aware reports, filters, exports, and
performance-tested dashboard queries.

## Phase 10 — Audit logs, testing, hardening, and deployment

Complete audit review tools, automated test coverage, accessibility and security
testing, backups, operational monitoring, incident procedures, and production
deployment.
