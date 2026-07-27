# Maternal and Child Care Architecture

Phase 6 adds longitudinal maternal and child care without changing appointment
or electronic-health-record ownership boundaries.

## Model

- `maternal_pregnancies` owns the `MAT-YYYY-NNNNNN` identifier and the active,
  delivered, completed, archived state machine.
- Prenatal visits, delivery outcomes, and postnatal visits are separate events.
- `child_health_profiles` owns the `CHD-YYYY-NNNNNN` identifier.
- Growth measurements, immunization facts, and developmental visits are
  separate child timeline events.
- Age and BMI are calculated at read time. No derived classification or
  immunization schedule is fabricated.

Sequences generate identifiers atomically. Partial unique indexes prevent
multiple active episodes/profiles. Request keys provide retry idempotency and
versions provide optimistic concurrency.

## Trust and privacy

Authenticated users have RLS-filtered `SELECT` only. All writes use trusted
RPCs with an empty `search_path`, role checks, active-resident validation,
appointment/encounter consistency, and server-derived actor identifiers.

Midwives create episodes/profiles and document maternal workflows. Nurses are
assignment-scoped. BHW growth entry requires a checked-in or in-progress Child
Health appointment. Administrators receive metadata and archive control, not
clinical narratives. Residents access only their own linked record; mother and
guardian links grant no clinical access by default.

Lists are minimal, details are role-shaped, dashboards contain counts only, and
audit entries exclude narrative and measurement values. Date-only rules use
`Asia/Manila`; event timestamps remain UTC `timestamptz`.

Migration `20260720002400_maternal_child_care.sql` is forward-only and must be
reviewed before deployment. Migrations 1–23 remain unchanged.
