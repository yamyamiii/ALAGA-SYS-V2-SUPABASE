# Immunization Tracking Workflow

The module records staff-supplied facts and does not fabricate a national
schedule or future doses.

- Midwives and assigned nurses record vaccine, dose, dates, and status.
- Completed entries require a Manila-valid administration date and the
  server-derived clinical actor.
- Vaccine code and dose are unique per child.
- Request keys prevent retry duplicates and versions prevent stale overwrites.
- Administrators archive through a trusted RPC; browser table writes stay
  revoked.
