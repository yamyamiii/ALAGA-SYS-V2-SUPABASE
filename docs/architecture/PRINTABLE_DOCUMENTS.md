# Printable documents architecture

Phase 10 adds a reusable A4 document framework. The approved visible thesis
scope exposes only Appointment Slip and Consultation Summary. Pages open
`DocumentPreviewDialog` with only a symbolic document
type and an existing record UUID. `documentService` validates the UUID and
calls one narrow RPC. The browser never supplies a role or resident ID.

## Trust boundary

Migration `20260720003100_printable_healthcare_documents.sql` repeats the
existing appointment, health-record, and maternal/child authorization rules at
the database boundary. Its security-definer RPCs use an empty `search_path` and
return only document fields. They do not grant table access, weaken RLS, or use
a service-role key in the browser.

| Visible document     | Trusted RPC                     | Database authorization                                     |
| -------------------- | ------------------------------- | ---------------------------------------------------------- |
| Appointment Slip     | `document_appointment_slip`     | Valid appointment state plus existing role/ownership scope |
| Consultation Summary | `document_consultation_summary` | Signed/amended and narrative-authorized role/owner         |

Referral Form, Prenatal Summary, and Child Health Summary actions are removed
from pages and dialogs. Their database functions, tables, policies, and model
code are preserved as inactive future extensions and excluded from the
approved final thesis scope.

The shared React Query keys use zero cache time for protected document payloads
and revalidate on every preview opening. Window focus does not refetch or reset
the preview. Data remains in memory only while used; it is not written to
`localStorage`, `sessionStorage`, analytics, AI, or an upload endpoint.

## Rendering and PDF strategy

The browser preview uses semantic HTML, the official logo, an A4-safe layout,
repeatable table headings, page-break avoidance, and scoped print CSS. Browser
printing shows only the active protected document.

PDF download lazy-loads `jsPDF`. The PDF renderer writes headings, fields,
tables, signatures, footers, and page numbers as selectable text and embeds the
local official logo when available. It never rasterizes the page, calls an
external PDF service, or sends document content off-device. The library lives
in a separate lazy bundle so normal application routes do not pay its bundle
cost.

## Preserved referral model

`clinical_referrals` links one active referral to a signed or amended encounter.
The encounter derives the resident; no resident ID is accepted by referral
RPCs. Referral numbers use an atomic sequence, creates use `(created_by,
request_key)` idempotency with an advisory lock, and updates use optimistic
versions. Only the attending nurse or appropriately scoped midwife can author a
draft. Finalization is explicit and makes content immutable. A finalized
referral can be archived only by the referring clinician.

Direct browser table access is revoked. Semantic audits contain only the
referral identifier, status, and version—never the receiving facility, reason,
or clinical summary.

The referral model has no final-scope navigation, page action, print action, or
AI action. It remains documented here only to make the non-destructive boundary
explicit.

## Known limitations

- Browser-print page numbering depends on browser support; downloaded PDFs
  always include page numbers.
- Signatures are printed-name/signature lines, not cryptographic or image
  signatures.
- No QR verification service or persisted generated-document archive exists.
- Administrator and BHW clinical masking remains authoritative, so masked
  maternal/child sections display as unavailable rather than exposing facts.
