-- Staff display name for the dashboard profile/settings page (DEC-2).
-- Nullable: existing users have no name until they set one in Settings.

ALTER TABLE users ADD COLUMN name TEXT;

COMMENT ON COLUMN users.name IS
  'Optional display name shown in the dashboard; set by the user in Settings.';
