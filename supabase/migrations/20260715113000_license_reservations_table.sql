-- Feature: License reservations
-- Table: license_reservations

-- -----------------------------------------------------------------------------
-- license_reservations
-- -----------------------------------------------------------------------------

CREATE TABLE license_reservations (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_code  TEXT NOT NULL,
  user_email        TEXT NOT NULL,
  is_european    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (license_code, user_email)
);

COMMENT ON TABLE license_reservations IS
  'Relations between license codes and the user emails that they are reserved for.';

CREATE INDEX idx_license_reservations_license_code
  ON license_reservations (license_code);

CREATE INDEX idx_license_reservations_user_email
  ON license_reservations (user_email);
