# ALAGA AI user guide

ALAGA AI is a read-only guide for verified ALAGA-SYS information, approved
workflows, and pages already available to your account. It is not a clinician,
search engine, report generator, or record assistant.

## Starting a conversation

Open **ALAGA AI** from the floating button. The first screen offers short
role-aware starter questions. You may select one or type in English, Filipino,
or common Taglish. Press Enter to send and Shift+Enter for a new line.

Useful examples include:

- `Ano ang operating hours?`
- `Anong services ang available?`
- `May bagong announcement ba?`
- `Paano mag-request ng appointment?`
- `Buksan ang appointments ko.`

The assistant answers matched hours, services, and current announcements from
the trusted live ALAGA-SYS records. If that information is missing, inactive,
archived, unpublished, or expired, it says that verified information could not
be found rather than guessing.

## Sources and navigation

Compact source cards show the trusted record type, a short title, and an
optional Manila-local updated date. A source card means that record was used as
approved context; it is not a sentence-level citation and does not reveal the
stored source body or identifier.

Navigation suggestions are buttons with locally trusted labels. The assistant
cannot invent a route or bypass your account role. It never navigates
automatically, and ambiguous choices require you to select the intended page.

## Conversation controls

- **Copy** places one assistant response on the clipboard without saving it in
  ALAGA-SYS.
- **Retry** repeats a retryable failed request.
- **Clear** and **New conversation** ask for confirmation before removing the
  current conversation.
- Closing and reopening the panel keeps the in-memory draft for the current
  signed-in page session.
- Logout, account invalidation, a role/profile change, component unmount, or a
  full reload removes the in-memory conversation.

Conversations are not saved to localStorage, sessionStorage, IndexedDB, URLs,
application tables, or analytics.

## Safety and privacy

Do not enter names, record numbers, contact details, appointment reasons,
diagnoses, symptoms, laboratory results, pregnancy details, or other personal
or clinical information. ALAGA AI does not diagnose, prescribe, interpret
tests, access resident records, run SQL, generate reports, search the public
internet, or modify ALAGA-SYS data.

For an emergency, contact local emergency services or the Barangay Health
Center immediately. For an account or record-linking issue, contact the health
center or an administrator.

## Demo checklist

1. Sign in as each supported role and confirm its starter prompts differ.
2. Ask the three verified-information examples above in English and Filipino.
3. Confirm source cards show only safe metadata.
4. Try an allowed and a disallowed navigation request for the role.
5. Confirm Copy, Retry, Clear, New conversation, Escape, and mobile keyboard
   behavior.
6. Confirm offline, expired-session, rate-limit, provider-timeout, and missing
   grounding messages remain actionable and reveal no raw error details.
7. Confirm no conversation returns after logout or a full reload.
