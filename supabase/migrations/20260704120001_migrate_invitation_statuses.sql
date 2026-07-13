-- Step 2: migrate account-created rows and update complete-onboarding RPC.
--   registered (account created) -> onboarding_completed
-- consent_completed is unchanged after consent accept.

UPDATE patient_invitations
SET status = 'onboarding_completed'
WHERE status = 'registered';

-- Repair rows if a prior migration renamed consent_completed -> registered.
UPDATE patient_invitations
SET status = 'consent_completed'
WHERE status = 'registered'
  AND consent_completed_at IS NOT NULL;

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
    status = 'onboarding_completed',
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
