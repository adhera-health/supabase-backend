-- Freeze License Service integers on invitation at send time (used at complete-onboarding).

ALTER TABLE patient_invitations
  ADD COLUMN license_client_id INTEGER,
  ADD COLUMN license_program_id INTEGER,
  ADD COLUMN core_api_host TEXT;

COMMENT ON COLUMN patient_invitations.license_client_id IS
  'Integer client id for License Service — snapshot at invite send.';

COMMENT ON COLUMN patient_invitations.license_program_id IS
  'Integer program id for License Service — snapshot at invite send.';

COMMENT ON COLUMN patient_invitations.core_api_host IS
  'Core API host for License Service payload — snapshot at invite send.';
