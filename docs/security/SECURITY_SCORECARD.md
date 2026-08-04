# ALAGA-SYS security scorecard

Assessment date: 2026-08-04

Overall codebase score: **88/100 — conditionally production-ready**

Go-live state: **No-go until pending controls are deployed and verified**

The score reflects reviewed source controls, not a claim that the hosted environment is secure. A perfect score is intentionally unavailable without production configuration evidence, external penetration testing, restore exercises, and operational sign-off.

| Domain                                     |  Weight |  Score | Assessment                                                                                                                                                           |
| ------------------------------------------ | ------: | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and session lifecycle       |      12 |     10 | Server user validation, active profile loading, refresh rotation, no public registration; hosted 15-minute JWT/password/MFA/CAPTCHA settings still need confirmation |
| Authorization, RLS, and least privilege    |      20 |     18 | Comprehensive RLS and trusted RPCs; inactive resident and preference gaps fixed in pending Migration 34; production negative tests required                          |
| Clinical and resident privacy              |      12 |     11 | Own-record/assignment boundaries, private photos, minimized audits and documents; exported PHI handling remains operational                                          |
| Edge Functions, CORS, and secrets          |      10 |      9 | Independent Auth checks, exact origins, safe responses, size/time limits, private service credentials; redeployment and secret rotation evidence required            |
| AI safety and grounding                    |       8 |      7 | No PHI grounding/tools/storage, deterministic actions/refusals, new clinical screening; free-text DLP has unavoidable limits                                         |
| Notifications and providers                |       7 |      6 | Fixed templates, recipient revalidation, idempotency/rate controls, minimized logs; provider retention and delivery-account controls are external                    |
| Backup, restore, and disaster recovery     |      10 |      8 | Signed/checksummed bounded packages, admin-only restore, staging and confirmation; isolated restore drill and offsite retention are pending                          |
| Uploads, downloads, exports, and documents |       7 |      7 | Private storage, magic bytes, generated paths, signed links, CSV formula defense, minimal print contracts                                                            |
| Browser/XSS/headers/error handling         |       6 |      5 | React escaping, no raw HTML, redacted errors, CSP/referrer meta; response-level CSP, HSTS and framing controls depend on hosting                                     |
| Dependencies and supply chain              |       5 |      3 | Current patched PostCSS/transitives and latest React Router; one high RSC-mode advisory remains flagged but the vulnerable server feature is not used                |
| Testing, auditing, and operations          |       3 |      4 | Extensive automated verifier/tests and release docs; score includes one bonus point for migration hash immutability and semantic audit design                        |
| **Total**                                  | **100** | **88** | **Conditional**                                                                                                                                                      |

## Release blockers

1. Review, apply, and verify linked pending Migrations 32, 33, and 34 in order. The 2026-08-04 dry-run reported exactly that sequence; stop if the deployment list differs.
2. Redeploy the five changed Edge Functions with exact production origins and reviewed secrets.
3. Apply the hardened Auth settings in the hosted dashboard and remove localhost redirect origins.
4. Configure response-level CSP, frame protection, HSTS, `nosniff`, referrer, and permissions headers on the production host.
5. Execute the direct role/RLS/Storage matrix against an isolated environment, including suspended and unlinked accounts.
6. Complete an isolated restore drill, record RTO/RPO results, and obtain two-person production restore approval.
7. Record a risk acceptance for the React Router RSC advisory or upgrade when a compatible patched package is published; monitor the advisory continuously.

## Residual risk register

| Risk                                                        | Level                    | Owner                      | Required treatment                                                                                         |
| ----------------------------------------------------------- | ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Stateless access token replay within its 15-minute lifetime | Medium                   | Platform administrator     | MFA, session revocation process, active-profile RLS checks, monitoring, key rotation for severe compromise |
| React Router RSC advisory reported by npm                   | Medium/Low applicability | Frontend owner             | Remain client-only; do not enable Router actions/RSC; monitor and update immediately when fixed            |
| User enters unlabeled PHI into AI chat                      | Medium                   | Privacy and product owners | Training/warnings, reviewed provider terms, no storage, minimized logs, periodic DLP test expansion        |
| Exported/printed PHI leaves application controls            | Medium                   | Clinic operations          | Device encryption, access policy, download retention, secure printing/disposal, incident response          |
| Hosting/WAF/Auth/provider configuration drift               | Medium                   | Deployment owner           | Infrastructure checklist, configuration evidence, alerts, quarterly access review                          |
| Backup confidentiality outside Supabase                     | Medium                   | Backup owner               | Encrypted offsite storage, signing-key separation/rotation, retention and restore drills                   |
| Browser session theft on a compromised endpoint             | Medium                   | Operations                 | Managed devices, patching, CSP, short JWTs, logout/session response, user training                         |

## Recommended retest cadence

- Every release: automated suite, dependency audit, migration hash verifier, secret scan, and Edge/RLS regression checks.
- Quarterly: role-access penetration matrix, administrator access review, key inventory, provider retention review, and restore sample verification.
- Annually or after material authorization changes: independent penetration test, privacy impact review, disaster-recovery exercise, and incident tabletop.
- Immediately after an incident or critical advisory: targeted replay, secret rotation, audit review, and documented corrective action.
