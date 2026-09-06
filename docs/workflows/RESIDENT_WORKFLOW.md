# Resident registry workflow

## Create and edit

Administrators and BHWs open `/residents`, select **Add resident**, complete the
required name, birth date, sex, and Bagongpook purok fields, then add optional
demographic/contact data. Middle name, address, contact details, PhilHealth
number, and emergency contact are optional. Household selection is not shown in
the Resident create/edit form; it is handled separately from Resident details.

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
household is an explicit state and does not start a replacement search. Saving
it removes only the relationship. The resident record remains intact. A current
household head must be replaced or cleared before that Resident can be removed
from the household.

Resident details identify the current **Household Head** and expose an explicit
head-change action only to roles already authorized to manage registry
relationships. The replacement list contains only active members of the same
household and excludes the current head. An archive attempt opens this workflow
first, then presents the normal archive confirmation after the guarded head
update succeeds. If no other eligible active member exists, an Administrator
may explicitly choose **Archive Resident and Household**. The trusted database
workflow serializes registry writes, clears the head and Resident membership,
and archives both records atomically. BHW and view-only roles do not receive
this sole-member archive capability.

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
neutral archived row to active. The normal registry workflow never physically
deletes a Resident. Separately, the trusted account-lifecycle backend may remove
a linked Resident only when its fail-closed dependency scan proves that no
protected history or current/future foreign-key dependency must be retained.

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
13. As administrator, archive a household head with another active member;
    choose the replacement, confirm the head changes, then complete archive.
14. Confirm an outside, inactive, or archived Resident is never offered as a
    replacement. For a sole-active-member head, confirm only an administrator
    can explicitly archive the Resident and household together.
