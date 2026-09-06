# ALAGA-SYS security scorecard

Assessment date: 2026-09-06

Repository assessment: **Conditionally release-ready after live controls are
verified**

Numeric score: **Not assigned.** A defensible score requires current hosted
configuration evidence, dependency/audit results, direct role testing, an
external security review, restore exercises, and operational sign-off. Reusing
the earlier 88/100 figure would overstate what repository inspection proves.

Go-live state: **No-go until the linked migration, Edge Function, Auth, hosting,
provider, and operational controls are independently verified.**

| Domain                        | Repository evidence                                                                                                                              | Live verification still required                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Authentication and sessions   | Active-profile validation, refresh handling, Resident-only pending signup, recovery-session isolation, and current-password reauthentication     | Hosted JWT, redirect, password, MFA, CAPTCHA, and rate-limit settings                        |
| Authorization and RLS         | Explicit grants, RLS, trusted RPCs, final-Administrator protection, guarded deletion/retirement, and canonical migration verification through 56 | Direct negative tests for every role against the linked project                              |
| Clinical and resident privacy | Own/assignment boundaries, minimized responses, private photos, signed documents, and retained-history controls                                  | Operational export, workstation, print, and incident procedures                              |
| Edge Functions and CORS       | Independent Auth checks, exact-origin parsers, bounded requests, safe errors, and server-only key access in source                               | Deployed revision inventory, exact hosted origins, and secret rotation evidence              |
| AI safety and grounding       | Read-only scope, no PHI tools/storage, deterministic refusals/actions, bounded grounding, and plain-text rendering                               | Provider configuration, retention review, red-team testing, and deployed revision            |
| Notifications and providers   | Trusted recipients, fixed templates, idempotent jobs, minimized logs, and in-app ownership                                                       | Provider accounts, delivery retention, scheduler, and failure monitoring                     |
| Backup and recovery           | Signed/checksummed packages, guarded preview/restore, staging, and conflict rollback                                                             | Encrypted offsite retention and an isolated restore drill                                    |
| Browser and supply chain      | React escaping, no executable AI output, safe downloads, and repository header configuration                                                     | Current dependency audit plus deployed CSP, HSTS, framing, referrer, and permissions headers |
| Testing and operations        | Automated tests, 56-migration verifier, semantic audits, and deployment checklists                                                               | Penetration testing, monitoring, operator training, approvals, and recorded evidence         |

## Release blockers

1. Run an authenticated linked dry run and compare it with the 56 reviewed
   repository migrations. Apply only an explicitly approved pending sequence.
2. Compare deployed revisions for `alaga-ai`, `manage-user`, `backup-admin`,
   `process-backups`, and `process-notification-jobs`; deploy only revisions that
   differ after their callers and secrets are reviewed.
3. Verify the hosted Auth settings and exact Site/redirect URLs. Remove any
   development redirect that is not explicitly required for that environment.
4. Configure response-level CSP, frame protection, HSTS, `nosniff`, referrer, and permissions headers on the production host.
5. Execute the direct role/RLS/Storage matrix against an isolated environment, including suspended and unlinked accounts.
6. Complete an isolated restore drill, record RTO/RPO results, and obtain two-person production restore approval.
7. Run the current production dependency audit and remediate or formally accept
   every applicable finding before release.

## Residual risk register

| Risk                                                         | Level  | Owner                      | Required treatment                                                                                           |
| ------------------------------------------------------------ | ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Stateless access-token replay within its configured lifetime | Medium | Platform administrator     | MFA, session revocation process, active-profile RLS checks, monitoring, key rotation for severe compromise   |
| Dependency or supply-chain vulnerability                     | Medium | Frontend owner             | Run a current production audit, validate applicability, patch promptly, and document any temporary exception |
| User enters unlabeled PHI into AI chat                       | Medium | Privacy and product owners | Training/warnings, reviewed provider terms, no storage, minimized logs, periodic DLP test expansion          |
| Exported/printed PHI leaves application controls             | Medium | Clinic operations          | Device encryption, access policy, download retention, secure printing/disposal, incident response            |
| Hosting/WAF/Auth/provider configuration drift                | Medium | Deployment owner           | Infrastructure checklist, configuration evidence, alerts, quarterly access review                            |
| Backup confidentiality outside Supabase                      | Medium | Backup owner               | Encrypted offsite storage, signing-key separation/rotation, retention and restore drills                     |
| Browser session theft on a compromised endpoint              | Medium | Operations                 | Managed devices, patching, CSP, short JWTs, logout/session response, user training                           |

## Recommended retest cadence

- Every release: automated suite, dependency audit, migration hash verifier, secret scan, and Edge/RLS regression checks.
- Quarterly: role-access penetration matrix, administrator access review, key inventory, provider retention review, and restore sample verification.
- Annually or after material authorization changes: independent penetration test, privacy impact review, disaster-recovery exercise, and incident tabletop.
- Immediately after an incident or critical advisory: targeted replay, secret rotation, audit review, and documented corrective action.
