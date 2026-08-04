# ALAGA-SYS Roadmap

## Completed foundations

Phases 0–11 establish authentication and roles, registry, appointments, electronic health records, maternal/child care, reports, assistance and announcements, printable documents, outbound notification foundations, AI navigation/grounding, and release-candidate UI hardening.

## Phase 12 — Backup & Restore Foundation

Implemented in the repository and pending manual deployment:

- application-aware allowlisted exports;
- private signed ZIP packages with per-file SHA-256 and HMAC authenticity;
- administrator-only manual backup, history, download, retry, restore validation/preview/confirmation, and reports;
- single-transaction merge-missing restore with conflict rollback;
- scheduler-ready daily/weekly/monthly configuration and automatic retention;
- explicit exclusion of Auth/Storage internals, secrets, AI conversations, audit payloads, and notification delivery logs.

Future reviewed work may add streaming multipart packages, external encrypted immutable storage, key-version rotation, automated isolated recovery drills, Auth/Storage disaster-recovery coordination, and formal retention/legal-hold policy. These are not part of Phase 12.
