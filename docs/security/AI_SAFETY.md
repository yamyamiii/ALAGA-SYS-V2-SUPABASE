# ALAGA AI medical and security safety

## Intended use

ALAGA AI provides general ALAGA-SYS workflow guidance and non-diagnostic
health-center navigation. It is not a doctor and does not replace a nurse,
midwife, physician, emergency responder, or verified health-center policy.

The fixed server instruction requires the assistant to:

- stay within the caller's canonical role and allowed module names;
- state when verified information is unavailable;
- never invent schedules, services, policies, availability, or patient data;
- never claim database, tool, report, or record access;
- direct emergencies to local emergency services or the Barangay Health Center;
- refuse diagnosis, pregnancy determination, prescriptions, dosage advice,
  laboratory interpretation, and emergency decisions.

Common direct medical-decision and emergency requests receive deterministic
server responses without calling Gemini. The system instruction remains the
second layer for less obvious wording.

## Prompt-injection controls

Prompt injection cannot be made fully preventable. Phase 9A reduces exposure
through independent controls:

1. Authorization and role selection occur outside the model.
2. The browser cannot supply system instructions, roles, model names, tools, or
   database identifiers.
3. All transcript text, including browser-supplied `assistant` lines, is labeled
   untrusted inside a fixed server instruction.
4. Requests to reveal prompts or secrets, ignore restrictions, impersonate
   clinicians, access other residents, or execute SQL receive deterministic
   refusals.
5. No model tools, previous interaction IDs, database context, PHI context, or
   navigation commands exist.
6. Input, output, turn, body-size, timeout, and hourly request limits reduce
   abuse impact.
7. Output is rendered as plain text, never raw HTML.

Model output is still probabilistic. Users must not treat it as clinical or
operational authority.

## Data minimization and logging

No chat content is persisted by ALAGA-SYS. Gemini calls set `store: false`.
Operational logs contain only request ID, actor profile ID, canonical role,
success/failure category, latency, and timestamp. They exclude prompts,
responses, tokens, keys, names, appointment reasons, diagnoses, and clinical
narratives.

The rate-limit table stores only profile ID, current fixed-hour window, count,
and update time. Direct browser access is denied and its consumer RPC is granted
only to `service_role`.

The UI warns users not to enter personal or medical information. Basic likely
identifier detection catches email addresses, Philippine mobile numbers, UUIDs,
and common ALAGA-SYS record numbers. It is not a data-loss-prevention system and
cannot guarantee detection of every sensitive phrase typed by a user.

## Incident handling

If unsafe output is observed:

1. Disable or undeploy `alaga-ai`, or remove its required secrets.
2. Preserve only privacy-safe request IDs and timestamps for investigation.
3. Do not copy sensitive prompts or responses into tickets or logs.
4. Review the fixed instruction, deterministic boundary, role allowlist, model
   selection, and live request path.
5. Re-test diagnosis, prescription, emergency, injection, secret-extraction,
   cross-role, and identifier cases before restoring access.
