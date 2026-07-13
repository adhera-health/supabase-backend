-- Rename dashboard staff role invitation_sender → inviter.

ALTER TYPE dashboard_staff_role RENAME VALUE 'invitation_sender' TO 'inviter';

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"inviter"'
)
WHERE raw_app_meta_data->>'role' = 'invitation_sender';
