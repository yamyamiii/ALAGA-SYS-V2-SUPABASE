# Household registry workflow

## Create

1. An administrator or BHW opens `/households` and selects **Add household**.
2. Select a barangay and one of its active puroks, enter an address, and
   optionally enter valid latitude/longitude.
3. Save. The database generates the immutable household number and audit event.
4. A head is intentionally optional during creation.

## Members and head

Open household details to review all current members. **Add existing** searches
current residents in the same locality and reassigns the selected resident.
Removing a member sets only `household_id` to null and never deletes the
resident.

Choose a current member as household head. Clear or choose a replacement head
before removing, moving, or archiving the current head. Database constraints and
triggers enforce this even if a UI is bypassed.

## Edit, archive, and restore

Current records may be edited by administrator/BHW. Archive requires explicit
confirmation and removes the household from normal lists. Only administrators
can include archived records and restore them. Restoration returns status to
`active`; member records are preserved.

## Manual checks

1. Create a household and confirm its `HH-YYYY-NNNNNN` number is read-only.
2. Search it by number and address; change barangay/purok filters and page size.
3. Add a same-locality resident, assign the resident as head, and verify details.
4. Confirm moving the head fails until a replacement is selected.
5. Remove a non-head member and verify the resident still exists unassigned.
6. As BHW, archive a current household and confirm it disappears and cannot be
   edited/restored.
7. As admin, include archived records and restore it.
