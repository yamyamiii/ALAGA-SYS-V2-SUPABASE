# Vital Signs workflow

## Measurements and units

| Measurement       | Unit        |
| ----------------- | ----------- |
| Temperature       | °C          |
| Blood pressure    | mmHg        |
| Pulse             | bpm         |
| Respiratory rate  | breaths/min |
| Oxygen saturation | %           |
| Height            | cm          |
| Weight            | kg          |
| BMI               | calculated  |
| Pain score        | 0–10        |

At least one measurement is required. Database constraints reject only values
outside broad physical bounds. The UI warns about unusual but plausible values
so staff can verify transcription without presenting the warning as a
diagnosis.

BMI is calculated as `weight_kg / (height_cm / 100)²`. It is not accepted from
the browser and is not stored as a writable database field.

## Permissions

- BHW: preliminary measurements on a draft linked to a current checked-in or
  in-progress appointment.
- Attending nurse: create or update measurements while the encounter is draft.
- Attending midwife: the same for maternal/child encounters.
- Resident: read measurements only on their own signed/amended encounter.
- Administrator: metadata only; measurements are masked.

Vital signs become immutable when the encounter is signed. Corrections use the
encounter amendment workflow, which copies the original measurements into the
new draft for review.

## Safety

Measurement values never appear in appointment list/calendar/queue responses,
dashboard cards, broad health-record lists, browser diagnostics, or audit
snapshots. Audit entries contain only the vital-sign record and encounter IDs
plus changed-field names.
