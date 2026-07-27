# Resident inquiry workflow

Resident inquiries are non-urgent tickets, not live chat.

1. A linked active resident submits a subject, category, and message.
2. The trusted RPC derives `resident_profile_id` from `auth.uid()`, assigns an
   atomic `INQ-YYYY-NNNNNN` number, and reuses the request key on a safe retry.
3. The resident can list only their own inquiries.
4. Administrators and BHWs can review the queue, add a staff response, and
   move a ticket through `Open`, `In Progress`, `Resolved`, and `Closed`.
5. A closed inquiry is terminal. Version checks reject stale staff updates.

The audit log records creation and status changes but not the inquiry message
or staff response. Residents should not submit emergencies or unnecessary
clinical details. Inquiry data remains inside ALAGA-SYS; Phase 8 sends no email,
SMS, or push response.
