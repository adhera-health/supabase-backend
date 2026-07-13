-- Resumable onboarding: keep invitation tokens valid until status becomes active.
-- 1. Restore tokens mistakenly consumed before active (in-progress invitations).
-- 2. Stop consuming tokens in atomic_complete_onboarding.
-- 3. Consume the latest active token when invitation first transitions to active.

-- Repair in-progress invitations that still have a latest token reference.
UPDATE patient_invitation_tokens t
SET
  consumed_at = NULL,
  is_active = true
FROM patient_invitations i
WHERE t.id = i.latest_token_id
  AND t.invitation_id = i.id
  AND i.status IN ('onboarding_completed', 'consent_completed_and_registered')
  AND t.consumed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_hospital_id UUID,
  p_program_id UUID,
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
    status = 'onboarding_completed',
    registered_at = p_registered_at
  WHERE id = p_invitation_id;

  RETURN QUERY
  SELECT v_license_id, p_assigned_at, p_registered_at;
END;
$$;

CREATE OR REPLACE FUNCTION atomic_mark_invitation_active(
  p_invitation_id BIGINT,
  p_activated_at TIMESTAMPTZ
)
RETURNS TABLE (
  invitation_uuid UUID,
  hospital_id UUID,
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
    patient_invitations.hospital_id,
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
