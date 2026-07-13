-- Block 4: Program license config + License Service records + assignment FK fix.
-- Replaces placeholder UUID on onboarding_assignments.license_id.

-- -----------------------------------------------------------------------------
-- programs — License Service parameters per Supabase program UUID
-- -----------------------------------------------------------------------------

CREATE TABLE programs (
  id             UUID PRIMARY KEY,
  name           TEXT NOT NULL,
  license_config JSONB NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE programs IS
  'Program registry. license_config supplies License Service batch API inputs per program UUID.';

COMMENT ON COLUMN programs.license_config IS
  'JSON: client_id, program_id, role, core_api_host (License Service integers — not Supabase UUIDs).';

CREATE INDEX idx_programs_is_active ON programs (is_active) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- licenses — records returned from License Service (or dev stub)
-- -----------------------------------------------------------------------------

CREATE TABLE licenses (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code               TEXT NOT NULL UNIQUE,
  core_api_host      TEXT NOT NULL,
  license_client_id  INTEGER NOT NULL,
  role               TEXT NOT NULL,
  is_available       BOOLEAN NOT NULL DEFAULT true,
  program_id         UUID NOT NULL REFERENCES programs (id) ON DELETE RESTRICT,
  hospital_id        UUID NOT NULL,
  invitation_id      BIGINT REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  user_id            UUID,
  source             TEXT NOT NULL DEFAULT 'license_service',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT licenses_source_check CHECK (source IN ('license_service', 'dev_stub'))
);

COMMENT ON TABLE licenses IS
  'License codes assigned at complete-onboarding. code is unique (e.g. pal-NE2Jwc).';

COMMENT ON COLUMN licenses.source IS
  'license_service = external API; dev_stub = local fallback when service env is unset.';

CREATE INDEX idx_licenses_program_id ON licenses (program_id);
CREATE INDEX idx_licenses_invitation_id ON licenses (invitation_id);
CREATE INDEX idx_licenses_user_id ON licenses (user_id);

-- -----------------------------------------------------------------------------
-- onboarding_assignments — FK to licenses (replaces placeholder UUID)
-- -----------------------------------------------------------------------------

DELETE FROM onboarding_assignments;

ALTER TABLE onboarding_assignments
  DROP COLUMN license_id;

ALTER TABLE onboarding_assignments
  ADD COLUMN license_id BIGINT NOT NULL REFERENCES licenses (id) ON DELETE RESTRICT;

COMMENT ON COLUMN onboarding_assignments.license_id IS
  'FK to licenses.id — assigned automatically at complete-onboarding.';

-- -----------------------------------------------------------------------------
-- atomic_complete_onboarding — insert license + assignment atomically
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_hospital_id UUID,
  p_program_id UUID,
  p_token_id BIGINT,
  p_assigned_at TIMESTAMPTZ,
  p_registered_at TIMESTAMPTZ,
  p_license_code TEXT,
  p_license_core_api_host TEXT,
  p_license_client_id INTEGER,
  p_license_role TEXT,
  p_license_is_available BOOLEAN,
  p_license_source TEXT
)
RETURNS TABLE (
  license_id BIGINT,
  assigned_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license_id BIGINT;
  v_rows_updated INT;
BEGIN
  PERFORM 1
  FROM patient_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM onboarding_assignments
    WHERE invitation_id = p_invitation_id
  ) THEN
    RAISE EXCEPTION 'onboarding assignment already exists for invitation'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO licenses (
    code,
    core_api_host,
    license_client_id,
    role,
    is_available,
    program_id,
    hospital_id,
    invitation_id,
    user_id,
    source
  )
  VALUES (
    p_license_code,
    p_license_core_api_host,
    p_license_client_id,
    p_license_role,
    p_license_is_available,
    p_program_id,
    p_hospital_id,
    p_invitation_id,
    p_user_id,
    p_license_source
  )
  RETURNING id INTO v_license_id;

  INSERT INTO onboarding_assignments (
    user_id,
    invitation_id,
    hospital_id,
    program_id,
    license_id,
    assigned_at
  )
  VALUES (
    p_user_id,
    p_invitation_id,
    p_hospital_id,
    p_program_id,
    v_license_id,
    p_assigned_at
  );

  UPDATE patient_invitations
  SET
    status = 'registered',
    registered_at = p_registered_at
  WHERE id = p_invitation_id;

  UPDATE patient_invitation_tokens
  SET
    consumed_at = p_registered_at,
    is_active = false
  WHERE id = p_token_id
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'invitation token has already been consumed'
      USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
  SELECT v_license_id, p_assigned_at, p_registered_at;
END;
$$;
