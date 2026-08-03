# Consultation Summary

Only signed or amended, non-archived encounters can produce a Consultation
Summary. Nurses retain their current narrative authorization. Midwives remain
limited to maternal-care and child-health encounters. Residents can print only
their own signed/amended record. Administrator and BHW metadata access does not
become clinical print access.

The summary contains encounter number, resident display name, visit date,
encounter type, attending staff, chief complaint, assessment, plan, optional
follow-up date, and the encounter's latest authorized vital signs. It excludes
subjective/objective working notes, diagnosis/treatment fields not approved for
this document, allergies, medical history, audit metadata, raw UUIDs, and draft
content.

An amendment is clearly labeled and identifies the preserved source encounter
number. It does not silently merge or overwrite the original record.

Manual UAT:

1. Verify a draft has no print action.
2. Open an authorized signed encounter and review all included sections.
3. Open an amended encounter and verify the amendment notice.
4. Test an administrator/BHW and another resident; clinical printing must be
   unavailable.
