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

| Role                   | Visible report categories                                             |
| ---------------------- | --------------------------------------------------------------------- |
| Administrator          | Overview, Resident summary, Appointment reports, Appointment workload |
| Barangay Health Worker | Overview, Resident summary, Appointment reports                       |
| Nurse                  | Appointment reports, limited by assigned-appointment RLS              |
| Midwife                | Appointment reports, limited by assigned service and appointment RLS  |
| Resident               | None                                                                  |

Administrator workload rows visibly show appointment assignments and completed
appointments only. Workload is an operational volume indicator, not a
performance or quality score.

Nurse and Midwife report access reuses the existing appointment-only report
category. Those functions are `security invoker`, so list, chart, export, PDF,
and print aggregates contain only appointment rows already visible through the
caller's RLS policies. They do not receive Overview, Resident summary,
Appointment workload, barangay-wide clinical reports, or raw appointment and
Resident records. Residents remain denied at both route and database scope.

Health-record analytics, maternal care, child care, pregnancy, prenatal,
delivery, postnatal, growth, and immunization categories are not present in the
final UI or ALAGA AI registry. Their RPCs and historical database controls are
preserved as inactive future extensions and excluded from the approved final
thesis scope.

## Time, filtering, and performance

Date ranges are inclusive and limited to five years. Date-only business rules
and timestamp bucketing use `Asia/Manila` explicitly. Initial page load fetches
only the active category. Existing indexes cover the report predicates; Phase 7
does not add speculative indexes. Production query plans should be sampled as
data volume grows.

Migration `20260720002600_reports_analytics.sql` is forward-only and must be
reviewed and applied manually.
