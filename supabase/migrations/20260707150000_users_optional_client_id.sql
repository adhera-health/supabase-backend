-- Staff users are provisioned without tenant binding; client is chosen at invite send.
-- Seeded admin may still store client_id from bootstrap.

ALTER TABLE users
  ALTER COLUMN client_id DROP NOT NULL;

COMMENT ON COLUMN users.client_id IS
  'Optional tenant UUID — populated for seeded admin; staff resolve client at invite send.';

COMMENT ON COLUMN users.license_client_id IS
  'Optional License Service client id — resolved at invite/onboarding snapshot, not user create.';
