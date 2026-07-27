# Reports and analytics architecture

Phase 7 adds privacy-safe operational reporting without creating a reporting
data warehouse or duplicating clinical records. The browser calls only the
`reportService`; pages never query Supabase directly. React Query caches the
currently selected category for one minute and cancels obsolete requests.

## Trust boundary

All calculations run in PostgreSQL. Registry and appointment data RPCs are
`security invoker` and retain the caller's existing RLS visibility. Narrow
aggregate-only definers cover overview and clinical sources whose deliberate
table RLS gives administrators/BHWs no raw narrative access. They expose no
rows or narratives and do not broaden table policies or grants. Every function
uses a fixed empty `search_path`; `report_validate_scope` independently verifies
the active profile, role, date range, canonical Bagongpook purok, service, and
staff filter.

Reports return counts, rates, time buckets, and operational workload totals.
They do not return resident names, identifiers, contact details, appointment
reasons, diagnoses, assessments, plans, or other clinical narratives.

## Role scope

| Role                   | Available report categories                                     |
| ---------------------- | --------------------------------------------------------------- |
| Administrator          | All categories                                                  |
| Barangay Health Worker | Overview, residents, appointments, maternal care, child care    |
| Nurse                  | Overview, appointments, health records, own workload            |
| Midwife                | Overview, appointments, maternal care, child care, own workload |
| Resident               | None                                                            |

Administrator workload rows may cover all active staff. Nurse and midwife
workload reports are self-only at the database boundary. Workload is an
operational volume indicator, not a performance or quality score.

## Time, filtering, and performance

Date ranges are inclusive and limited to five years. Date-only business rules
and timestamp bucketing use `Asia/Manila` explicitly. Initial page load fetches
only the active category. Existing indexes cover the report predicates; Phase 7
does not add speculative indexes. Production query plans should be sampled as
data volume grows.

Migration `20260720002600_reports_analytics.sql` is forward-only and must be
reviewed and applied manually.
