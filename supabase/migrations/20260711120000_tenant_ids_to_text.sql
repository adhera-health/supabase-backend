-- Adhera Core integer ids become the tenant identity.
--
-- Clients/programs live only in the external Adhera Core API and are identified by
-- integers. Store client_id/program_id as TEXT (the exact integer as a string, e.g.
-- "36") instead of internal UUIDs, removing the external→internal mapping entirely.
-- No FKs reference these columns; unique/regular indexes rebuild automatically on the
-- type change. The separate License-Service integer columns are unchanged.

-- ---------------------------------------------------------------------------
-- 1. Tenant columns: UUID -> TEXT
-- ---------------------------------------------------------------------------

ALTER TABLE patient_invitations
  ALTER COLUMN client_id TYPE TEXT USING client_id::text,
  ALTER COLUMN program_id TYPE TEXT USING program_id::text;

ALTER TABLE onboarding_assignments
  ALTER COLUMN client_id TYPE TEXT USING client_id::text,
  ALTER COLUMN program_id TYPE TEXT USING program_id::text;

ALTER TABLE consent_documents
  ALTER COLUMN client_id TYPE TEXT USING client_id::text,
  ALTER COLUMN program_id TYPE TEXT USING program_id::text;

ALTER TABLE user_consents
  ALTER COLUMN program_id TYPE TEXT USING program_id::text;

ALTER TABLE licenses
  ALTER COLUMN client_id TYPE TEXT USING client_id::text,
  ALTER COLUMN program_id TYPE TEXT USING program_id::text;

ALTER TABLE users
  ALTER COLUMN client_id TYPE TEXT USING client_id::text;

-- ---------------------------------------------------------------------------
-- 2. Rebuild the atomic RPCs with TEXT tenant types (bodies unchanged).
--    Param/return-type changes require DROP + CREATE (not CREATE OR REPLACE).
-- ---------------------------------------------------------------------------

-- 2a. atomic_complete_onboarding — p_client_id / p_program_id: UUID -> TEXT
DROP FUNCTION IF EXISTS atomic_complete_onboarding(
  UUID, BIGINT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT
);

CREATE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_client_id TEXT,
  p_program_id TEXT,
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

-- 2b. atomic_mark_invitation_active — return client_id / program_id: UUID -> TEXT
DROP FUNCTION IF EXISTS atomic_mark_invitation_active(BIGINT, TIMESTAMPTZ);

CREATE FUNCTION atomic_mark_invitation_active(
  p_invitation_id BIGINT,
  p_activated_at TIMESTAMPTZ
)
RETURNS TABLE (
  invitation_uuid UUID,
  client_id TEXT,
  program_id TEXT,
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

-- 2c. atomic_resend_invitation_token — return client_id / program_id: UUID -> TEXT
DROP FUNCTION IF EXISTS atomic_resend_invitation_token(BIGINT, TEXT, TIMESTAMPTZ);

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
  client_id TEXT,
  program_id TEXT,
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

-- 2d. atomic_accept_user_consent — p_program_id: UUID -> TEXT
DROP FUNCTION IF EXISTS atomic_accept_user_consent(
  BIGINT, TIMESTAMPTZ, UUID, TEXT, BIGINT, UUID, BIGINT, TEXT, TEXT,
  TIMESTAMPTZ, TEXT, TEXT, JSONB
);

CREATE FUNCTION atomic_accept_user_consent(
  p_supersede_consent_id BIGINT,
  p_superseded_at TIMESTAMPTZ,
  p_user_id UUID,
  p_email TEXT,
  p_invitation_id BIGINT,
  p_program_id TEXT,
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

-- 2e. atomic_activate_consent_document — internal vars UUID -> TEXT (signature unchanged)
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
  v_client_id TEXT;
  v_program_id TEXT;
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
