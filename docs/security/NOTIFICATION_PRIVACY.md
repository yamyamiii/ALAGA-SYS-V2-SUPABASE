# Notification privacy and consent

External delivery is opt-in. Defaults are privacy-safe: in-app updates are on; email and SMS are off. A user can change only their own row through an RPC that derives `auth.uid()`. Enabling an external channel requires an eligible active profile and a confirmed, valid contact in Supabase Auth. Resident profiles also require exactly one active, unarchived linked resident record.

Recipients are never accepted from the browser or source event payload. The processor resolves and normalizes confirmed Auth contacts server-side and stores only a masked destination hint after an attempt. Full email addresses, phone numbers, provider keys, JWTs, bodies, and clinical data are excluded from database audit metadata, application responses, and processor logs.

Allowed external fields are deliberately narrow:

- appointment date and time for confirmed/rescheduled/reminder notices;
- a bounded inquiry status label;
- the title of an important published announcement;
- a generic document kind such as consultation summary or referral form.

External messages exclude diagnosis, chief complaint, appointment reason, assessment, treatment, vital signs, medical history, pregnancy risk, referral reason, addresses, record numbers, and protected document attachments. Users must sign in to see sensitive detail. HTML variables are escaped, subjects are static, values reject newlines, and SMS output is capped at 320 characters.

Preferences affect future notification creation and do not erase prior in-app history or minimized delivery audit. No mandatory-delivery override is defined in this release.
