-- Harden licenses: one license per invitation (prevents duplicate complete races).
-- Idempotent for DBs that already applied 20260708180000 with the UNIQUE constraint embedded.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'licenses_invitation_id_unique'
  ) THEN
    ALTER TABLE licenses
      ADD CONSTRAINT licenses_invitation_id_unique UNIQUE (invitation_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT licenses_invitation_id_unique ON licenses IS
  'At most one stored license per invitation (complete-onboarding).';
