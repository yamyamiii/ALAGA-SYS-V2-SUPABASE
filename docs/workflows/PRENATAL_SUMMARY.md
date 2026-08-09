# Prenatal Summary

> Preserved as an inactive future extension and excluded from the approved
> final thesis scope. No Prenatal Summary action is visible in the application.

The pregnancy detail dialog provides a role-authorized Prenatal Summary. Base
obstetric fields follow the existing `maternal_child_get` visibility. Prenatal
visit rows and risk level appear only for nurse/midwife roles already allowed
to see clinical maternal data. Residents remain limited to their own linked
record; administrator/BHW masking remains intact.

Included fields are pregnancy number, resident display name, LMP, EDD, gravida,
para, term and preterm births, pregnancy losses, living children, allowed risk
level, current status, and up to 50 ordered prenatal visit facts: date,
validated gestational age, and attending staff.

Risk notes, findings, plans, unrelated encounters, audit data, and raw UUIDs are
excluded. The summary never infers risk or offers a recommendation.

Manual UAT should compare the preview to an authorized pregnancy record, test
masked roles, confirm chronological visit rows, and verify the deterministic
`ALAGA-Prenatal-MAT-….pdf` filename.
