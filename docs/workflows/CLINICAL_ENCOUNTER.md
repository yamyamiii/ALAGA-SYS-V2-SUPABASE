# Clinical encounter workflow

## Create

An authorized nurse or midwife starts a draft from the Health Records page or
an eligible appointment. The database generates the encounter number. Creating
from an appointment is transactional and idempotent; repeated clicks cannot
create a second primary encounter.

No appointment reason or operational notes are copied. The draft begins with
empty clinical documentation unless it is an amendment.

## Document

The attending clinician records:

1. Chief complaint
2. Subjective notes
3. Objective notes
4. Assessment
5. Diagnosis text
6. Plan
7. Treatment notes
8. Follow-up date

Vital signs are managed separately. Draft updates require the version last read
by the browser. If another tab saves first, reload before retrying.

## Sign

Review the entire record before signing. Chief complaint, assessment, and plan
are required. Signing records the signer and timestamp and makes the encounter
read-only at both RPC and trigger layers.

## Amend

A signed encounter is never edited in place. Choose **Amend**, enter a reason,
and work in the new linked draft. The original remains signed while correction
work is incomplete. When the amendment is signed:

- the original becomes `amended`;
- the correction becomes the current signed encounter;
- both encounter numbers, narratives, signatures, and audit histories remain.

Only one amendment may directly replace an encounter.

## Archive

Administrators may archive signed or amended records through the controlled
workflow. Clinical contents remain preserved, normal users cannot see the
archived record, and no physical delete occurs.

## Failure handling

- Missing/inactive resident: correct registry status before creating.
- Appointment mismatch: open the appointment belonging to the selected
  resident.
- Existing encounter: open the health record already linked to the appointment.
- Stale version: reload the record.
- Signed edit: use an amendment.
- Permission denied: verify active profile role, clinician assignment, and
  midwife service scope.
- Offline/timeout: reconnect and retry; idempotency protects encounter creation.
