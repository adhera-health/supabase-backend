-- Dashboard staff users — maps Supabase Auth users to client tenant + role.

CREATE TYPE dashboard_staff_role AS ENUM (
  'admin',
  'invitation_sender',
  'dashboard_manager'
);

CREATE TYPE dashboard_user_status AS ENUM (
  'active',
  'inactive'
);

CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id            UUID NOT NULL UNIQUE,
  client_id               UUID NOT NULL,
  license_client_id       INTEGER,
  email                   TEXT NOT NULL,
  role                    dashboard_staff_role NOT NULL,
  status                  dashboard_user_status NOT NULL DEFAULT 'active',
  created_by_auth_user_id UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_unique_idx ON users (lower(trim(email)));

CREATE INDEX users_client_id_idx ON users (client_id);
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_status_idx ON users (status);

COMMENT ON TABLE users IS
  'Dashboard staff mapped to Supabase Auth — tenant scope and role for RBAC.';

COMMENT ON COLUMN users.auth_user_id IS
  'Supabase Auth user id — use as API selector for delete/update.';

COMMENT ON COLUMN users.license_client_id IS
  'Integer client id for License Service (cached from Client API or env at provision).';
