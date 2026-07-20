# Household and resident registry architecture

## Scope

Phase 3A implements demographic household and resident registry workflows only.
It does not create appointment, clinical, medicine, maternal-care, reporting,
notification, or AI functionality.

## Application boundaries

Route pages use feature hooks backed by TanStack React Query. All Supabase calls
are isolated in `src/services/registryService.js`; pages do not import the
Supabase client. Forms use React Hook Form and centralized Zod schemas. Enum
labels, filters, sorting choices, and page sizes are centralized under
`src/features/registry`.

The browser contains only a project URL and publishable key. Frontend permission
checks control navigation and actions for usability, while table grants and RLS
remain authoritative.

## Single-barangay deployment context

The current deployment is fixed to `Brgy. Bagongpook`. Registry forms and
filters show a read-only context label instead of a barangay dropdown. The
frontend calls `registry_get_deployment_context`, which fails if the canonical
barangay is missing, inactive, duplicated, or does not have exactly seven active
puroks named `Purok 1` through `Purok 7`.

No UUID is hard-coded in visual code. The service resolves it from database
reference data and limits all list queries and writes to that UUID. A database
trigger independently derives `barangay_id` from the selected purok and rejects
inactive, non-Bagongpook, and Purok 8 values. The normalized `barangay_id`
columns and foreign keys remain intact for integrity and future reuse.

## Search and pagination

`registry_list_households` and `registry_list_residents` are stable,
`security invoker` PostgreSQL functions. They execute with the authenticated
caller's table privileges and RLS-visible rows. Search terms are function
parameters, sorting is selected from allowlists, page sizes are limited to
1–100, and results include a windowed `total_count`.

The UI debounces search and sends `limit` and `offset`; it never downloads the
whole registry for client-side paging. Household search covers number, head
name, and address. Resident search covers number, full name, phone, address, and
household number.

## Identifiers and calculated age

Resident numbers remain immutable database-generated `RES-YYYY-NNNNNN` values.
Phase 3A adds immutable database-generated household numbers in
`HH-YYYY-NNNNN` form. Sequence-backed triggers ignore browser-supplied values,
and the UI never offers editable number fields.

Age is never stored. PostgreSQL calculates it for list rows, and the frontend
calculates it from date of birth for detail/form feedback.

## Locality and household relationships

Existing composite foreign keys enforce barangay/purok and
resident/household-locality consistency. A Phase 3A trigger adds clear workflow
errors and prevents assigning a resident to an archived household. A household
head must be a current member; the head must be cleared or reassigned before
that resident is moved or archived.

## Archive strategy

There is no physical-delete service method, API grant, RLS policy, or UI action.
Households and residents use lifecycle status plus a trigger-derived
`archived_at`. Active staff see current rows. An administrator can see and
restore archived rows. A BHW can archive a current row through the pre-existing
one-way update policy but cannot update it afterward.

`moved_out` and `deceased` remain terminal archived resident states. Phase 3A
adds neutral `archived` status in a separate migration because PostgreSQL enum
values must be committed before a subsequent migration can use them safely.

## Audit behavior

Automatic row triggers emit semantic household/resident actions for create,
update, archive, restore, household assignment, and head changes. Audit
snapshots continue through the Phase 1 safe whitelist. Request metadata stores
only changed field names—never address, phone, email, PhilHealth, emergency
contact, pregnancy, or other sensitive values.

## Role permissions

- Administrator: full household and resident access, archived visibility, and
  restoration.
- Barangay Health Worker: current household/resident create and update, member
  management, and one-way archival allowed by RLS.
- Nurse and midwife: current resident demographic read only.
- Resident: no registry browse route; RLS retains access only to the uniquely
  linked resident row and current household.

## Known limitations

- The canonical Bagongpook reference and exactly seven active puroks must be
  provisioned before registry screens can load.
- Household choice lists intentionally cap at 100 current records per locality;
  a future high-volume phase may add a dedicated searchable picker RPC.
- Photo upload and profile-link management are outside Phase 3A.
- Hosted migrations require reviewed dry-run output and explicit approval before
  apply.
