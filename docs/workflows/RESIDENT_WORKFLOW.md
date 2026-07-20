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

## Household assignment

Open resident details and choose **Household assignment**. Only current
households in the resident's selected Bagongpook purok are offered. Choosing no
household removes only the relationship. The resident record remains intact.

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
