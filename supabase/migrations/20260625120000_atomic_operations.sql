-- Atomic DB operations for invitation resend, complete-onboarding, consent accept, and document activation.
-- Prevents partial-failure states when multiple rows must change together.

-- -----------------------------------------------------------------------------
-- Resend invitation token (deactivate old → insert new → supersede → link)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atomic_resend_invitation_token(
  p_invitation_id BIGINT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  token_id BIGINT,
  invitation_uuid UUID,
  invitation_status invitation_status,
  email TEXT,
  hospital_id UUID,
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
    pi.hospital_id,
    pi.program_id,
    pi.invited_at
  FROM patient_invitations pi
  WHERE pi.id = p_invitation_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Complete onboarding (assignment + registered status + token consume)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_hospital_id UUID,
  p_program_id UUID,
  p_license_id UUID,
  p_token_id BIGINT,
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
DECLARE
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
    p_license_id,
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
  SELECT p_assigned_at, p_registered_at;
END;
$$;

-- -----------------------------------------------------------------------------
-- Accept consent (optional supersede + insert in one transaction)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atomic_accept_user_consent(
  p_supersede_consent_id BIGINT,
  p_superseded_at TIMESTAMPTZ,
  p_user_id UUID,
  p_email TEXT,
  p_invitation_id BIGINT,
  p_program_id UUID,
  p_consent_document_id BIGINT,
  p_consent_version TEXT,
  p_document_hash TEXT,
  p_accepted_at TIMESTAMPTZ,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_evidence_payload_json JSONB
)
RETURNS SETOF user_consents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_supersede_consent_id IS NOT NULL THEN
    UPDATE user_consents
    SET
      superseded_at = p_superseded_at,
      updated_at = p_superseded_at
    WHERE id = p_supersede_consent_id
      AND superseded_at IS NULL
      AND is_withdrawn = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'consent record to supersede was not found or is no longer current'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO user_consents (
    user_id,
    email,
    invitation_id,
    program_id,
    consent_document_id,
    consent_version,
    document_hash,
    accepted,
    accepted_at,
    ip_address,
    user_agent,
    evidence_payload_json,
    updated_at
  )
  VALUES (
    p_user_id,
    p_email,
    p_invitation_id,
    p_program_id,
    p_consent_document_id,
    p_consent_version,
    p_document_hash,
    true,
    p_accepted_at,
    p_ip_address,
    p_user_agent,
    p_evidence_payload_json,
    p_accepted_at
  )
  RETURNING *;
END;
$$;

-- -----------------------------------------------------------------------------
-- Activate consent document (deactivate others + activate target)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atomic_activate_consent_document(
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
  v_hospital_id UUID;
  v_program_id UUID;
  v_deactivated BIGINT[];
BEGIN
  SELECT cd.hospital_id, cd.program_id
  INTO v_hospital_id, v_program_id
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
    WHERE hospital_id = v_hospital_id
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
