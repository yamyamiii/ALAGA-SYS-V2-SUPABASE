# Supabase Storage deployment

Migration `20260720001600_registry_hardening.sql` creates/configures the private
`resident-photos` bucket and its object policies. It is pending until a reviewed
linked dry run and explicit deployment approval; do not create a public bucket
manually as a shortcut.

## Deploy

1. Review `npx supabase db push --dry-run` and confirm migrations 15 and 16 are
   the only expected pending migrations.
2. Apply in order during an approved window.
3. Deploy the updated `manage-user` Edge Function with its existing trusted
   secrets and allowed-origin configuration.
4. In Storage, confirm `resident-photos` is private, 5 MB maximum, and limited
   to `image/jpeg`, `image/png`, and `image/webp`.
5. Never copy signed URLs, service keys, test credentials, or real photos into
   source control or deployment logs.

## Live role checks

- Administrator and BHW: upload/replace an active resident photo.
- Administrator: view an archived resident photo; BHW/nurse/midwife cannot.
- Nurse and midwife: view an active authorized photo but cannot mutate it.
- Linked resident: view only its own active photo and cannot list another
  resident's object.
- Anonymous: cannot select, list, sign, upload, update, or delete private
  objects.
- Replace a photo and verify the old object disappears only after the new path
  is stored. Simulate a failed update and confirm the old object remains.

If old-object cleanup fails, retain the live database path and reconcile the
orphan using a reviewed administrator operation. Do not weaken the policy.
