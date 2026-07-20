# Private resident photo storage

## Boundary

Resident images live in the private Supabase Storage bucket `resident-photos`.
PostgreSQL stores only the object name in `residents.photo_path`; image bytes,
signed URLs, and upload metadata are not copied into registry or audit tables.
Browser code uses `registryService` and the authenticated Supabase client. No
service-role credential is present in the frontend.

Object names use `<resident UUID>/<object UUID>.<extension>`. Names, email
addresses, resident numbers, and timestamps are excluded. The bucket accepts
JPEG, PNG, and WebP up to 5 MB. The UI verifies size, declared MIME type, and
JPEG/PNG/WebP magic bytes before upload; bucket configuration and policies
independently restrict size, MIME, path shape, resident existence, and role.

## Signed URL lifecycle

Images are displayed with five-minute signed URLs. React Query considers a URL
fresh for four minutes and discards it at five minutes, ensuring a refreshed URL
is requested before reuse. URLs and object paths are not logged or rendered as
text. An initials fallback is used when no image exists or display authorization
fails.

## Safe replacement

Replacement follows this order:

1. validate and upload a new UUID-named object;
2. update the RLS-protected resident `photo_path`;
3. remove the old object only after the database update succeeds.

If step 2 fails, the new object is removed and the old relationship remains. If
old-object cleanup fails, the new photo remains valid and the UI reports that
administrator cleanup is required. Explicit removal first detaches the path so
a storage failure leaves only an inaccessible orphan, never a broken resident
reference.

## Policy matrix

| Actor                    | Active resident photo | Archived resident photo | Write                               |
| ------------------------ | --------------------- | ----------------------- | ----------------------------------- |
| Administrator            | View                  | View                    | Upload, replace, remove             |
| BHW                      | View                  | No                      | Upload, replace, remove active only |
| Nurse/Midwife            | View                  | No                      | No                                  |
| Linked resident          | Own only              | No                      | No                                  |
| Other resident/anonymous | No                    | No                      | No                                  |

Storage policies resolve the resident UUID from the object path and re-check an
active canonical profile. They never trust a client role value.

## Known limitations

There is no crop editor or resumable/byte-level progress API. The UI reports
validated workflow stages. Failed post-update cleanup can leave a private orphan
that must be reconciled by an administrator; it cannot be accessed without a
matching storage policy.
