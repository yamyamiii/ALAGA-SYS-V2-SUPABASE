-- Add the symbolic in-app notification type separately from its consumers.
-- PostgreSQL requires a newly added enum value to commit before functions or
-- data in a later migration can use it.

alter type public.assistance_notification_type
  add value if not exists 'resident_registration_pending';
