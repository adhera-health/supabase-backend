-- Restore licenses storage + link to onboarding_assignments.
-- Snapshot integers still live on patient_invitations; this stores the created license code.

CREATE TABLE licenses (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                 TEXT NOT NULL UNIQUE,
  core_api_host        TEXT NOT NULL,
  license_client_id    INTEGER NOT NULL,
  license_program_id   INTEGER NOT NULL,
  role                 TEXT NOT NULL,
  is_available         BOOLEAN NOT NULL DEFAULT true,
  client_id            UUID NOT NULL,
  program_id           UUID NOT NULL,
  invitation_id        BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  user_id              UUID NOT NULL,
  source               TEXT NOT NULL DEFAULT 'license_service',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT licenses_source_check CHECK (source IN ('license_service', 'dev_stub')),
  CONSTRAINT licenses_invitation_id_unique UNIQUE (invitation_id)
);

COMMENT ON TABLE licenses IS
  'License codes assigned at complete-onboarding from License Service (or local dev_stub).';

CREATE INDEX idx_licenses_invitation_id ON licenses (invitation_id);
CREATE INDEX idx_licenses_user_id ON licenses (user_id);
CREATE INDEX idx_licenses_client_program ON licenses (client_id, program_id);

ALTER TABLE onboarding_assignments
  ADD COLUMN license_id BIGINT REFERENCES licenses (id) ON DELETE RESTRICT;

COMMENT ON COLUMN onboarding_assignments.license_id IS
  'FK to licenses.id — set at complete-onboarding.';

-- Recreate RPC: insert license then assignment with license_id (atomic).
-- Drop all historical overloads (earlier CREATE OR REPLACE left extras when arg lists changed).
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, UUID, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT
);
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT
);
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT
);

CREATE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_client_id UUID,
  p_program_id UUID,
  p_assigned_at TIMESTAMPTZ,
  p_registered_at TIMESTAMPTZ,
  p_license_code TEXT,
  p_license_core_api_host TEXT,
  p_license_client_id INTEGER,
  p_license_program_id INTEGER,
  p_license_role TEXT,
  p_license_is_available BOOLEAN,
  p_license_source TEXT
)
RETURNS TABLE (
  assigned_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  license_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license_id BIGINT;
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

  IF EXISTS (
    SELECT 1
    FROM licenses
    WHERE invitation_id = p_invitation_id
  ) THEN
    RAISE EXCEPTION 'license already exists for invitation'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO licenses (
    code,
    core_api_host,
    license_client_id,
    license_program_id,
    role,
    is_available,
    client_id,
    program_id,
    invitation_id,
    user_id,
    source
  )
  VALUES (
    p_license_code,
    p_license_core_api_host,
    p_license_client_id,
    p_license_program_id,
    p_license_role,
    p_license_is_available,
    p_client_id,
    p_program_id,
    p_invitation_id,
    p_user_id,
    p_license_source
  )
  RETURNING id INTO v_license_id;

  INSERT INTO onboarding_assignments (
    user_id,
    invitation_id,
    client_id,
    program_id,
    assigned_at,
    license_id
  )
  VALUES (
    p_user_id,
    p_invitation_id,
    p_client_id,
    p_program_id,
    p_assigned_at,
    v_license_id
  );

  UPDATE patient_invitations
  SET
    status = 'onboarding_completed',
    registered_at = p_registered_at
  WHERE id = p_invitation_id;

  RETURN QUERY
  SELECT p_assigned_at, p_registered_at, v_license_id;
END;
$$;

COMMENT ON FUNCTION atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT
) IS
  'Atomically inserts license + onboarding assignment and marks invitation onboarding_completed.';
