-- Rename tenant column hospital_id → client_id (align DB with API/types).

ALTER TABLE patient_invitations
  RENAME COLUMN hospital_id TO client_id;

ALTER TABLE onboarding_assignments
  RENAME COLUMN hospital_id TO client_id;

ALTER TABLE consent_documents
  RENAME COLUMN hospital_id TO client_id;

-- Rename index for clarity (column rename keeps index valid; name was hospital-specific).
ALTER INDEX IF EXISTS idx_consent_documents_hospital_program
  RENAME TO idx_consent_documents_client_program;

COMMENT ON TABLE consent_documents IS
  'Versioned consent documents per client/program (§4.1).';

COMMENT ON TABLE onboarding_assignments IS
  'Binds authenticated user to invitation/client/program after complete-onboarding.';

-- CREATE OR REPLACE cannot rename input parameters (p_hospital_id → p_client_id)
-- or change RETURNS TABLE column names; drop and recreate affected RPCs.

DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS atomic_mark_invitation_active(BIGINT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS atomic_resend_invitation_token(BIGINT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS atomic_activate_consent_document(BIGINT, TIMESTAMPTZ);

-- -----------------------------------------------------------------------------
-- atomic_complete_onboarding
-- -----------------------------------------------------------------------------

CREATE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_client_id UUID,
  p_program_id UUID,
  p_assigned_at TIMESTAMPTZ,
  p_registered_at TIMESTAMPTZ
)
RETURNS TABLE (
  assigned_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO onboarding_assignments (
    user_id,
    invitation_id,
    client_id,
    program_id,
    assigned_at
  )
  VALUES (
    p_user_id,
    p_invitation_id,
    p_client_id,
    p_program_id,
    p_assigned_at
  );

  UPDATE patient_invitations
  SET
    status = 'onboarding_completed',
    registered_at = p_registered_at
  WHERE id = p_invitation_id;

  RETURN QUERY
  SELECT p_assigned_at, p_registered_at;
END;
$$;

-- -----------------------------------------------------------------------------
-- atomic_mark_invitation_active
-- -----------------------------------------------------------------------------

CREATE FUNCTION atomic_mark_invitation_active(
  p_invitation_id BIGINT,
  p_activated_at TIMESTAMPTZ
)
RETURNS TABLE (
  invitation_uuid UUID,
  client_id UUID,
  program_id UUID,
  status invitation_status,
  activated_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_token_id BIGINT;
  v_previous_status invitation_status;
BEGIN
  SELECT pi.latest_token_id, pi.status
  INTO v_latest_token_id, v_previous_status
  FROM patient_invitations pi
  WHERE pi.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_status NOT IN ('consent_completed_and_registered', 'active') THEN
    RAISE EXCEPTION 'invitation is not eligible for activation'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE patient_invitations
  SET
    status = 'active',
    activated_at = COALESCE(patient_invitations.activated_at, p_activated_at),
    last_activity_at = p_activated_at
  WHERE id = p_invitation_id
  RETURNING
    patient_invitations.uuid,
    patient_invitations.client_id,
    patient_invitations.program_id,
    patient_invitations.status,
    patient_invitations.activated_at,
    patient_invitations.last_activity_at;

  IF v_previous_status = 'consent_completed_and_registered'
    AND v_latest_token_id IS NOT NULL THEN
    UPDATE patient_invitation_tokens
    SET
      consumed_at = p_activated_at,
      is_active = false
    WHERE id = v_latest_token_id
      AND consumed_at IS NULL;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- atomic_resend_invitation_token (return column rename)
-- -----------------------------------------------------------------------------

CREATE FUNCTION atomic_resend_invitation_token(
  p_invitation_id BIGINT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  token_id BIGINT,
  invitation_uuid UUID,
  invitation_status invitation_status,
  email TEXT,
  client_id UUID,
  program_id UUID,
  invited_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_token_id BIGINT;
  v_new_token_id BIGINT;
BEGIN
  PERFORM 1
  FROM patient_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  SELECT pit.id
  INTO v_old_token_id
  FROM patient_invitation_tokens pit
  WHERE pit.invitation_id = p_invitation_id
    AND pit.is_active = true
  FOR UPDATE;

  IF v_old_token_id IS NOT NULL THEN
    UPDATE patient_invitation_tokens
    SET is_active = false
    WHERE id = v_old_token_id;
  END IF;

  INSERT INTO patient_invitation_tokens (
    invitation_id,
    token_hash,
    expires_at,
    is_active
  )
  VALUES (p_invitation_id, p_token_hash, p_expires_at, true)
  RETURNING id INTO v_new_token_id;

  IF v_old_token_id IS NOT NULL THEN
    UPDATE patient_invitation_tokens
    SET superseded_by_token_id = v_new_token_id
    WHERE id = v_old_token_id;
  END IF;

  UPDATE patient_invitations
  SET latest_token_id = v_new_token_id
  WHERE id = p_invitation_id;

  RETURN QUERY
  SELECT
    v_new_token_id,
    pi.uuid,
    pi.status,
    pi.email,
    pi.client_id,
    pi.program_id,
    pi.invited_at
  FROM patient_invitations pi
  WHERE pi.id = p_invitation_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- atomic_activate_consent_document
-- -----------------------------------------------------------------------------

CREATE FUNCTION atomic_activate_consent_document(
  p_consent_document_id BIGINT,
  p_effective_from TIMESTAMPTZ
)
RETURNS TABLE (
  deactivated_document_ids BIGINT[],
  activated_document_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_program_id UUID;
  v_deactivated BIGINT[];
BEGIN
  SELECT cd.client_id, cd.program_id
  INTO v_client_id, v_program_id
  FROM consent_documents cd
  WHERE cd.id = p_consent_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consent document not found'
      USING ERRCODE = 'P0002';
  END IF;

  WITH deactivated AS (
    UPDATE consent_documents
    SET
      is_active = false,
      updated_at = p_effective_from
    WHERE client_id = v_client_id
      AND program_id = v_program_id
      AND is_active = true
      AND id <> p_consent_document_id
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::BIGINT[])
  INTO v_deactivated
  FROM deactivated;

  UPDATE consent_documents
  SET
    is_active = true,
    effective_from = p_effective_from,
    updated_at = p_effective_from
  WHERE id = p_consent_document_id;

  RETURN QUERY
  SELECT v_deactivated, p_consent_document_id;
END;
$$;
