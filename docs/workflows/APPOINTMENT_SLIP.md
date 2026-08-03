# Appointment Slip

The Appointment Details dialog offers **Print Appointment Slip** only for
confirmed, checked-in, in-progress, or completed non-archived appointments.
Pending, cancelled, no-show, rescheduled, rejected, and archived records do not
qualify.

The database rechecks authorization. Residents can print only their linked
resident's appointment. Nurses and midwives require the existing staff
assignment, with midwives still limited to maternal/child services. BHW and
administrator access remains within their current appointment visibility.

Included fields are appointment number, resident display name, service,
appointment type, scheduled date, start time, assigned staff, current status,
and generation timestamp. Appointment reason, operational notes, cancellation
details, contact information, address, raw UUIDs, audit data, and clinical data
are excluded.

Manual UAT:

1. Open a confirmed appointment allowed for the test role.
2. Select **Print Appointment Slip** and verify the A4 preview.
3. Print and download the deterministic `ALAGA-Appointment-APT-….pdf` file.
4. Confirm reason and operational notes never appear.
5. Repeat with cancelled and another resident's appointment and confirm denial.
