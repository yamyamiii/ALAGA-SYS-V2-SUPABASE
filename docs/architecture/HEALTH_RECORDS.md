# Health Records architecture

## Scope and clinical boundary

Phase 5 provides a clinical-documentation foundation for Brgy. Bagongpook
Health Center. It supports encounters, one vital-sign set per encounter,
allergies, relevant medical history, appointment linkage, and resident
timelines. It is not a hospital EMR, diagnostic engine, prescribing system,
laboratory system, or clinical decision-support tool.

Appointment `reason` and `operational_notes` remain operational data. They are
never copied into an encounter. Health-record list responses contain metadata
only and do not include complaints, notes, assessment, diagnosis, treatment,
allergies, history, or vital measurements.

## Data model

- `health_encounters` owns the longitudinal clinical document, immutable
  `ENC-YYYY-NNNNNN` number, appointment link, clinician attribution, signature,
  version, and amendment lineage.
- `vital_signs` stores one verified measurement set per encounter. BMI is not a
  writable column; the trusted detail API and frontend calculate it from height
  and weight.
- `resident_allergies` stores current and historical allergy entries separately
  from encounters.
- `resident_medical_history` stores relevant condition history separately from
  encounter narratives.

All four tables have RLS enabled. Browser roles receive no INSERT, UPDATE,
DELETE, or sequence access. Mutations use fixed-search-path security-definer
RPCs that repeat role, row-state, ownership, idempotency, and optimistic
concurrency checks.

## Encounter state machine

```text
draft -- sign --> signed -- create amendment --> amendment draft
                         \                           |
                          \-- archive                \-- sign
                                                        |
original signed -- amendment signed --> amended         signed replacement
```

A draft may be edited only by its attending nurse or appropriately scoped
midwife. Signing requires the caller's current version and non-empty chief
complaint, assessment, and plan. Database triggers reject all clinical-field
changes after signing.

An amendment is a new draft linked by `amends_encounter_id`. It copies the
signed clinical content and vital signs transactionally. The original stays
signed while the amendment is drafted. Signing the amendment atomically marks
the original `amended`; the original content is never overwritten.

Only an administrator may archive signed or amended records through the
controlled RPC. There is no normal physical-delete workflow.

## Appointment linkage

`appointment_id` is nullable for unlinked encounters and unique when present.
Creating from an appointment locks the appointment row and verifies:

- appointment and encounter resident IDs match;
- the resident is active and not archived;
- appointment status is `in_progress` or `completed`;
- appointment is not archived;
- the nurse or midwife is the assigned clinician;
- a midwife's appointment and encounter are maternal or child scoped;
- no encounter already exists.

Create requests carry a UUID request key. Repeated calls with the same actor and
key return the original encounter, while a different key cannot bypass the
unique appointment link.

## Role boundaries

- Administrator: encounter metadata and controlled archival only. Direct
  clinical-table reads have no admin policy, and the detail RPC masks narratives
  and vital signs.
- BHW: encounter metadata and preliminary vital-sign entry for a draft linked
  to a checked-in or in-progress appointment. No narrative, diagnosis, signing,
  allergy, or medical-history access.
- Nurse: create and manage assigned drafts, record vitals, sign, amend, and view
  current clinical records and resident history.
- Midwife: the same clinical workflow only for `maternal_care` and
  `child_health`.
- Resident: only their own `signed` or `amended` encounters and their own
  non-archived allergies/history. Draft and archived encounters are invisible.
- Anonymous or inactive profile: no access.

Frontend permissions improve usability but never grant database access.

## Privacy and auditing

Clinical audit triggers emit semantic events and deliberately store only record
IDs, encounter number, resident/appointment IDs, status, actor, timestamps, and
changed-field names. They never copy narrative values, allergy names/reactions,
condition details, or vital measurements into `audit_logs`.

Safe diagnostics contain only operation and provider/mapped error codes.
Clinical values, names, record payloads, tokens, and credentials are never
logged.

## Service architecture

Pages use `healthRecordService` through React Query hooks. The list/search RPC
is server-paginated. Detail responses are role-shaped by the trusted database
function. Mutations have a 20-second client timeout, offline handling, safe
error mapping, disabled pending actions, and query invalidation.

## Live testing checklist

1. Apply Migration 20 to a disposable project with synthetic records.
2. Verify admin sees metadata but no clinical narrative or measurements.
3. Verify BHW can record preliminary vitals only for an eligible draft.
4. Verify an assigned nurse can create, edit, record vitals, and sign.
5. Verify an unassigned nurse cannot create from another nurse's appointment.
6. Verify midwife access is limited to maternal/child encounters.
7. Verify a resident sees only their own signed/amended records and no drafts.
8. Repeat create with one request key and verify one encounter.
9. Attempt concurrent draft saves and verify the stale version is rejected.
10. Sign, attempt direct edits, create an amendment, sign it, and confirm the
    original narrative remains unchanged.
11. Inspect audit entries and confirm no clinical text or measurements exist.

## Known limitations

- One current vital-sign set is stored per encounter.
- Structured diagnosis coding, prescriptions, dispensing, lab results,
  attachments, consent workflows, and co-signatures are not implemented.
- The module provides warnings for unusual readings but no diagnosis or
  treatment recommendation.
- Archive restoration requires a future governed retention workflow.
