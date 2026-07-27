# Report privacy rules

Reports are for planning and service operations, not for reconstructing an
individual's health history. Apply the minimum necessary date range and filter,
share exports only through approved channels, and delete downloaded copies when
the operational need ends.

The database exposes aggregates only. Small-count suppression is not enabled
because the reports are internal operational tools, but staff must not combine
filters to infer an individual's condition. Clinical narratives and direct
identifiers are excluded by contract.

Residents and anonymous callers cannot execute report RPCs. Suspension,
deactivation, logout, or an invalid session removes report access. Browser route
guards improve navigation, while PostgreSQL roles, scope validation, grants,
and RLS remain authoritative.

Report export audit metadata is deliberately minimized. Administrators should
review unusually broad or repeated exports through the audit process without
placing report contents into audit logs.
