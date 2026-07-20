# Resident registry workflow

## Create and edit

Administrators and BHWs open `/residents`, select **Add resident**, complete the
required name, birth date, sex, and Bagongpook purok fields, then add optional
demographic/contact data. Middle name, household, address, contact details,
PhilHealth number, and emergency contact are optional.

Names are trimmed and internal whitespace normalized. Future birth dates,
invalid locality combinations, unsuitable pregnancy fields, and malformed
contact values are rejected. The database generates the immutable resident
number. Age is calculated from birth date and is never stored.

Before a create or identity edit is saved, the server checks likely active
matches using normalized name, birth date, and sex. The warning is reviewable,
not a blanket block. Staff must explicitly continue, and the override is
audited. Phone match is supporting context only.

An optional private JPEG, PNG, or WebP photo (maximum 5 MB) may be selected.
The UI verifies magic bytes and previews the image. New-resident creation is
preserved if a later upload fails; staff can reopen the resident and retry.
Replacement never deletes the old object until the new upload and resident path
update both succeed.

## Household assignment

Open resident details and choose **Household assignment**. Only current
households in the resident's selected Bagongpook purok are returned by debounced,
paginated search by number, head, or address. Choosing no
household removes only the relationship. The resident record remains intact.

Administrators may open **Manage portal account** to link an eligible existing
resident profile, invite-and-link a new resident account, inspect status, or
confirm unlink. Unlinking never deletes the Auth user.

## Read access

Administrators, BHWs, nurses, and midwives can search current demographic rows.
Only administrator/BHW users see write actions. Resident-role accounts cannot
browse the route; RLS permits only their own linked row.

## Archive and restore

Archive requires confirmation and uses neutral `archived` status. `moved_out`
and `deceased` also set the archive timestamp. BHW archival is one-way under
existing RLS. Administrators can select archived-only/all filters and restore a
neutral archived row to active. No permanent delete path exists.

## Manual checks

1. Create a resident without middle name, household, or address.
2. Confirm the generated number, calculated age, six detail sections, and safe
   classification display.
3. Test name/number/phone/household search, every filter, sorting, and paging.
4. Assign and remove a same-locality household; verify mismatched locality is
   rejected.
5. Confirm nurse/midwife read access has no edit/archive/assignment controls.
6. Confirm a resident role receives access denied for `/residents` and can read
   only its own linked row through RLS.
7. Archive as BHW, then verify only an administrator can find and restore it.
8. Confirm no barangay selector or Purok 8 option appears.
9. Upload, replace, and remove a photo as administrator/BHW; confirm
   nurse/midwife view-only behavior and resident-own access.
10. Search beyond the first household page and confirm archived households do
    not appear.
11. Trigger a duplicate warning, review the matches, and confirm an override
    audit event exists only after explicit continuation.
12. As administrator, link and unlink a resident account; confirm BHW and other
    roles cannot perform the action.
