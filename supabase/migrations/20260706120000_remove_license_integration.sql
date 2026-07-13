-- Remove License Service integration (tables, assignment FK, RPC license params).
-- Onboarding assignments bind user + invitation + hospital + program only.

ALTER TABLE onboarding_assignments
  DROP COLUMN IF EXISTS license_id;

DROP TABLE IF EXISTS licenses;
DROP TABLE IF EXISTS programs;

CREATE OR REPLACE FUNCTION atomic_complete_onboarding(
  p_user_id UUID,
  p_invitation_id BIGINT,
  p_hospital_id UUID,
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
    hospital_id,
    program_id,
    assigned_at
  )
  VALUES (
    p_user_id,
    p_invitation_id,
    p_hospital_id,
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

COMMENT ON TABLE onboarding_assignments IS
  'Binds authenticated user to invitation/hospital/program after complete-onboarding.';
