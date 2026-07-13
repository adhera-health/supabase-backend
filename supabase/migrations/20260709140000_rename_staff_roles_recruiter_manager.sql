-- Rename dashboard staff roles: inviter → recruiter, dashboard_manager → manager.

ALTER TYPE dashboard_staff_role RENAME VALUE 'inviter' TO 'recruiter';
ALTER TYPE dashboard_staff_role RENAME VALUE 'dashboard_manager' TO 'manager';

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"recruiter"'
)
WHERE raw_app_meta_data->>'role' IN ('inviter', 'invitation_sender');

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"manager"'
)
WHERE raw_app_meta_data->>'role' = 'dashboard_manager';
