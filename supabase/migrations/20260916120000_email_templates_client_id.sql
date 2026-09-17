-- Per-client invitation email templates.
--
-- Templates were global: one default per template_type, editable by any staff
-- member with `email_templates.manage`. That meant a recruiter working for one
-- client could change the email every other client's patients receive.
--
-- Templates now belong to a client (Adhera Core id as TEXT, matching
-- patient_invitations.client_id), with `client_id IS NULL` as the shared
-- fallback used when a client has no template of its own.

ALTER TABLE email_templates
  ADD COLUMN client_id TEXT;

COMMENT ON COLUMN email_templates.client_id IS
  'Adhera Core client id (TEXT) that owns this template. NULL = shared fallback for clients without their own.';

-- One default per template_type *per client*, plus one shared default.
-- Two partial indexes because NULLs do not compare equal in a unique index:
-- a single index on (template_type, client_id) would allow many shared defaults.
DROP INDEX IF EXISTS idx_email_templates_default_invitation;

CREATE UNIQUE INDEX idx_email_templates_default_shared
  ON email_templates (template_type)
  WHERE is_default = true AND client_id IS NULL;

CREATE UNIQUE INDEX idx_email_templates_default_per_client
  ON email_templates (template_type, client_id)
  WHERE is_default = true AND client_id IS NOT NULL;

-- Lookup path for send/resend: the client's template, else the shared one.
CREATE INDEX idx_email_templates_type_client
  ON email_templates (template_type, client_id);

-- The existing seeded row keeps client_id NULL, so it stays the shared default
-- and current sends are unaffected.
--
-- RLS: email_templates already has RLS enabled and FORCEd with no policies
-- (20260730120000_rls_and_least_privilege.sql); adding a column does not change
-- that, and access stays service-role only. Re-run that migration's
-- verification queries after applying this one.
