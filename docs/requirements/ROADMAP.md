# ALAGA-SYS roadmap

## Approved final thesis release

The approved title is **Automated Local Appointment and General Assistance
System (ALAGA-SYS)**. The visible release focuses on appointments, resident
management, appointment-linked consultation records, announcements,
notifications, basic operational reports, trusted user management, and ALAGA
AI guidance. Historical backend capabilities remain protected for data and
dependency safety; visibility flags are not authorization controls.

## Phase 0 — Foundation

Vite/React project, responsive application shell, design system, route and
provider composition, Supabase connection boundary, documentation, and quality
tooling.

## Phase 1 — Database schema and RLS

Normalized PostgreSQL tables, constraints, indexes, migrations, audit
foundations, storage policies, and deny-by-default Row Level Security.

## Phase 2 — Authentication and user roles

Supabase Authentication, trusted staff management, canonical profile roles,
protected routes, and RLS-backed authorization.

## Phase 3 — Resident and household management

Paginated resident and household workflows, relational links, validation,
search, photos, account linking, and auditable changes.

## Phase 4 — Appointment scheduling and queue

Appointment capacity, conflict handling, state transitions, daily queues,
resident requests, and safe concurrent updates.

## Phase 5 — Encounters and health records

Access-controlled clinical encounters and health-record workflows with strict
auditing and privacy protections.

## Phase 6 — Maternal and child healthcare

Program-specific relational records, schedules, and monitoring workflows.
Preserved as an inactive future extension and excluded from the approved final
thesis scope.

## Phase 7 — Reports, analytics, exports, and printing

Server-side aggregates, permission-aware reports, bounded exports, and
printable operational summaries.

## Phase 8 — General assistance

Announcements, in-app notifications, activity timelines, health-center
information, FAQs, and resident inquiry tickets.

## Phase 9A — Secure ALAGA AI assistant foundation

Authenticated, server-proxied Gemini assistance with in-memory conversations,
no application PHI, deterministic safety boundaries, and an atomic per-profile
server rate limit.

## Phase 9B — Approved grounding and safe navigation

Live, bounded grounding from active FAQs, public health-center information, and
current announcements. Deterministic, role-checked, symbolic read-only
navigation has a second frontend allowlist. No resident, appointment, clinical,
maternal/child, report, contact, inquiry, notification, or audit data is
exposed, and no mutation capability is added.

## Phase 9C — Final AI UX, grounding quality, and security polish

Deterministic trusted responses for health-center hours, services, and current
announcements; English/Filipino/Taglish matching; role-aware starters; compact
source provenance; copy/retry/confirmed reset controls; responsive and
accessible chat behavior; fixed client error messages; and duplicate-request,
source, and action defenses. No new data source, mutation, or clinical
capability is introduced.

## Phase 10 — Printable forms and document exports

Reusable authorized A4 previews, browser printing, and local selectable-text
PDF downloads. Appointment Slips and signed/amended Consultation Summaries are
the approved visible documents. Referral, Prenatal, and Child Health document
support is preserved as an inactive future extension and excluded from the
approved final thesis scope. Narrow RPCs preserve ownership, assignment,
clinical masking, and record-state rules.

Medical certificates, prescriptions, laboratory results, health certificates,
barangay clearances, automated clinical conclusions, and AI-generated document
content remain out of scope.

## Release candidate — UAT and outbound notification foundation

Final role-aware UI corrections hide the placeholder Settings navigation and
present resident clinical pages without barangay-wide search affordances.
Provider-neutral, opt-in email and SMS infrastructure wraps existing trusted
events without making workflows depend on delivery. Email operates only when a
reviewed HTTP gateway is configured; SMS remains disabled by default. External
templates contain only minimized operational fields and no clinical detail.

Administrator Settings, the visible Backup/Restore console, mandatory-delivery policies, provider
webhooks, contact-verification workflows beyond Supabase Auth, and paid SMS
activation remain future enhancements.

## Advanced AI capabilities (future)

Any report generation, clinical/resident-data use, database mutation, external
knowledge retrieval, or autonomous action requires a separately approved
threat model, narrow authorization design, audit model, and privacy review.

## Future phases

Maternal and Child Care, Referral Management, Medicine Inventory, advanced
clinical reports, advanced administrator settings, provider-specific delivery
webhooks, and destructive schema cleanup remain future work. Backup, audit,
notification delivery, and security infrastructure stay operational internally.
