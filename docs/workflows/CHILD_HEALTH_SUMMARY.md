# Child Health Summary

The child profile detail dialog provides a role-authorized Child Health
Summary. Residents can request only their own linked child record. Nurses retain
assignment-scoped access, and the existing maternal/child authorization remains
the source of truth for all roles.

The document includes child number, child display name, date of birth, age at
the Manila generation date, and mother/guardian display names when the current
record API permits them. Clinical roles may also receive the latest 12 growth
measurements, up to 100 completed immunization facts, and latest child-visit
date/staff.

Growth rows contain only date, weight, height, head circumference, and MUAC.
Immunization rows contain only vaccine, dose, and date given. Notes, findings,
developmental narratives, lot numbers, vaccine eligibility, nutrition/growth
classification, recommendations, raw UUIDs, and audit metadata are excluded.

The age is calculated only for display at generation time. No clinical
interpretation or schedule recommendation is generated.
