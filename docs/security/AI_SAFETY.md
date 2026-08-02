# ALAGA AI medical and security safety

## Intended use

ALAGA AI provides general ALAGA-SYS workflow guidance, verified low-risk
health-center information, and safe navigation. It is not a doctor and does not
replace a nurse, midwife, physician, emergency responder, or verified policy.

The fixed server instruction requires the assistant to stay inside the
canonical role, never invent operational facts or patient data, direct
emergencies to local emergency services or the Barangay Health Center, and
refuse diagnosis, pregnancy determination, prescriptions, dosage advice,
laboratory interpretation, and emergency decisions. Common unsafe requests
receive deterministic responses without calling Gemini.

## Grounding boundary

The only database grounding is active FAQ text, public health-center name,
address, hours and services, and currently published announcements. A
service-role-only RPC selects explicit safe fields. It cannot return IDs,
authors, contact details, team profiles, or any resident, household,
appointment, clinical, maternal/child, reporting, inquiry, notification, or
audit data.

The Edge Function applies a second source-type, shape, count, and character
allowlist. Grounding content is treated as untrusted data: embedded instructions
cannot override the fixed server policy. Grounding is separated from the
untrusted conversation and is never logged or persisted. If approved live
grounding is unavailable, the assistant states that verified information is
unavailable instead of fabricating it.

Verified hours, services, and current announcements use deterministic server
synthesis from the sanitized records and bypass the provider. The response
language follows recognizable English, Filipino, or Taglish phrasing. Source
cards expose only a safe type, label, title, and optional updated timestamp;
they do not expose source bodies or database identifiers and are not presented
as exact sentence citations.

## Navigation boundary

Navigation supports symbolic, read-only action IDs only. The deterministic
server parser runs before Gemini and validates IDs against the canonical role.
It rejects raw URLs, raw routes, unknown destinations, and unauthorized
modules. The frontend independently checks the ID and role and supplies the
fixed local route; it ignores server/model route fields. Ambiguous commands
require a visible user choice. Offline actions are disabled.

No navigation action can create, edit, archive, confirm, cancel, sign, export,
or otherwise mutate application data. No privileged mutation RPC is available
to the model.

## Prompt-injection controls

Prompt injection cannot be made fully preventable. Independent controls are:

1. Authentication, role selection, grounding selection, and navigation
   authorization occur outside the model.
2. The browser cannot provide system instructions, roles, model names, tools,
   grounding source types, or database identifiers.
3. Transcript and grounding text are explicitly labeled untrusted.
4. Prompt/secret extraction, restriction bypass, clinician impersonation,
   cross-resident access, SQL, and mutation requests receive deterministic
   refusals.
5. Gemini has no tools, database connection, route registry, previous
   interaction ID, or application credentials.
6. Input, output, source, body-size, timeout, and hourly limits reduce abuse.
7. Output is rendered as plain text, never raw HTML.
8. Known Edge error codes map to fixed client messages; untrusted backend error
   text is discarded.
9. Duplicate source metadata and action IDs are removed before rendering, and
   a synchronous in-flight guard blocks repeated submission clicks.

Model output remains probabilistic and must not be treated as clinical or
operational authority.

## Data minimization and logging

No chat or grounding content is persisted by ALAGA-SYS. Gemini calls set
`store: false`. Operational logs contain only privacy-safe request metadata and
exclude prompts, responses, sources, names, reasons, diagnoses, and narratives.
The rate-limit table stores only profile ID, UTC-hour window, count, and update
time; browser access is denied.

The UI warns users not to enter personal or medical information. Identifier
detection is defense in depth, not a complete data-loss-prevention system.

## Incident handling

If unsafe output or navigation is observed:

1. Disable or undeploy `alaga-ai`, or remove its required secrets.
2. Preserve only privacy-safe request IDs and timestamps.
3. Do not copy sensitive prompts, responses, or sources into tickets or logs.
4. Review both server and frontend action allowlists, the grounding RPC, fixed
   instruction, deterministic boundaries, role map, and live request path.
5. Re-test medical refusals, injection, source poisoning, secret extraction,
   cross-role actions, raw URLs/routes, and identifiers before restoring access.
