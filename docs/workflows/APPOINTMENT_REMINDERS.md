# Appointment reminders

An external reminder is eligible only for a confirmed, unarchived, future appointment. The trusted database function converts the appointment's Manila wall-clock schedule to a `timestamptz` instant and makes the job available 24 hours before that instant. If confirmation occurs within 24 hours, the job is available immediately. Timestamps remain stored as `timestamptz`.

The event category may identify prenatal, postnatal, child, or immunization reminders only from the already scheduled appointment service type. The system does not infer vaccine eligibility, due dates, risk, or clinical advice.

Cancelling, rejecting, completing, marking no-show, or rescheduling cancels the old pending/processing reminder. A rescheduled confirmed appointment creates a new idempotency key containing the new UTC schedule instant. The processor also rechecks the source schedule before claim, so stale reminders are cancelled rather than delivered.

The scheduler is operational infrastructure and is not deployed by this migration. See [Email and SMS deployment](../deployment/EMAIL_SMS.md).
