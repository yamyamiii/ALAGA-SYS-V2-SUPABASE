# Final scope alignment UAT

## Release intent

This release presents ALAGA-SYS as the **Automated Local Appointment and
General Assistance System**. It changes visibility and routing only; existing
RLS, trusted RPCs, audit, backup, notification delivery, and historical data
architecture remain authoritative.

Maternal and Child Care, Referral Management, advanced clinical reports,
prenatal and child printouts, Medicine Inventory, and advanced administrator
settings are preserved as inactive future extensions and excluded from the
approved final thesis scope.

## Role menus

- Administrator: Dashboard, Appointments, Residents, Health Records,
  Announcements, ALAGA AI, Reports, User Management.
- Barangay Health Worker: Dashboard, Appointments, Residents, Health Records,
  Announcements, ALAGA AI, Reports.
- Nurse: Dashboard, Appointments, Health Records, Announcements, ALAGA AI.
- Midwife: Dashboard, Appointments, Health Records, Announcements, ALAGA AI.
- Resident: Dashboard, My Appointments, Announcements, Notifications, ALAGA AI.

Desktop sidebar and mobile drawer use the same registry. FAQ, Health Center,
and inquiries remain secondary assistance destinations through ALAGA AI.

## Live UAT

1. Sign in as each role and compare the primary menu to the list above.
2. At 360x800, 390x844, 430x932, 768x1024, 1024x768, 1366x768, and 1920x1080,
   open the desktop sidebar or mobile drawer; confirm no overflow, blank slots,
   overlap, or hidden module.
3. Open ALAGA AI from both the menu and floating launcher. Confirm appointment,
   calendar, queue, resident, consultation-record, announcement, report, user,
   FAQ, and health-center actions follow the role allowlist.
4. Ask for maternal/child, referral, household, audit, backup, settings, or an
   advanced report. Confirm no symbolic action button is returned.
5. Directly enter `/households`, `/maternal-child-care`,
   `/medicine-inventory`, `/activity`, `/audit-logs`, `/backup-restore`, and
   `/settings`. Confirm Access Denied renders once with no record request and no
   redirect loop.
6. Complete staff-created and resident-request appointment workflows, including
   assignment, confirmation/rejection, reschedule, cancellation, Calendar,
   Daily Queue, reminder, history, and Appointment Slip.
7. From an authorized appointment, create/edit vitals and a consultation
   record, sign it, and open Consultation Summary. Confirm resident ownership,
   assignment restrictions, and masking remain unchanged.
8. Confirm Referral Form, Prenatal Summary, and Child Health Summary actions are
   absent from visible pages and dialogs.
9. Open Reports as Administrator and BHW. Confirm only approved categories are
   shown and direct hidden category query parameters fall back safely.
10. Confirm logout, session invalidation, route navigation, and mobile
    orientation changes retain their established secure behavior.

## Browser notes

Mobile Safari and Android browser printing may open the platform share/print
surface; downloading the generated PDF remains the reliable fallback. The AI
launcher remains fixed above mobile navigation and below modal dialogs. No
clinical draft or AI conversation is persisted to browser storage.
