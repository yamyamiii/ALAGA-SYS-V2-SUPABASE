# Notification preferences

Open **Notifications** to manage delivery channels, update topics, and message language. In-app notifications remain available by default. Email and SMS are off until the user opts in and are enabled in the UI only when a confirmed contact and configured provider are available. Only a masked contact is shown.

Available topics are appointment updates, appointment reminders, important announcements, inquiry updates, maternal/child appointment reminders, and signed-document availability. English and Filipino external templates are supported.

Saving uses optimistic versioning. A concurrent change asks the user to reload instead of silently overwriting it. Offline, timeout, permission, and missing verified-contact errors have safe user-facing messages. Settings are kept in React memory and RPC responses; no contact or preference draft is written to browser storage.

Administrators see a separate operational summary with aggregate counts, channel status, masked recent jobs, safe failure categories, and a bounded retry action. It contains no message body, full contact, clinical value, or arbitrary message composer.
