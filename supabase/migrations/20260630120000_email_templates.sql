-- Invitation (and future) email templates — admin-managed defaults with per-send overrides.

CREATE TABLE email_templates (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name         TEXT NOT NULL,
  template_type TEXT NOT NULL,
  subject      TEXT NOT NULL,
  html_body    TEXT NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_template_type_check
    CHECK (template_type IN ('invitation')),
  CONSTRAINT email_templates_name_length
    CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT email_templates_subject_length
    CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT email_templates_html_body_length
    CHECK (char_length(html_body) BETWEEN 1 AND 100000)
);

COMMENT ON TABLE email_templates IS
  'Stored email templates. Default rows are read-only during send; per-invitation overrides are not persisted here.';

COMMENT ON COLUMN email_templates.html_body IS
  'HTML with placeholders: {{onboarding_url}}, {{privacy_notice_url}}, {{expires_in_hours}}, {{patient_app_download_url}}.';

-- One default per template_type.
CREATE UNIQUE INDEX idx_email_templates_default_invitation
  ON email_templates (template_type)
  WHERE is_default = true AND template_type = 'invitation';

CREATE INDEX idx_email_templates_type_created
  ON email_templates (template_type, created_at DESC);

-- Seed default invitation template (migrated from legacy hardcoded HTML).
INSERT INTO email_templates (name, template_type, subject, html_body, is_default)
VALUES (
  'Default invitation',
  'invitation',
  'Your Adhera program invitation',
  '<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <p>You have been invited to join the Adhera care program.</p>
    <p>
      <a href="{{onboarding_url}}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
        Accept invitation
      </a>
    </p>
    <p>This link expires in {{expires_in_hours}} hours.</p>
    <p>
      Privacy notice:
      <a href="{{privacy_notice_url}}">{{privacy_notice_url}}</a>
    </p>
  </body>
</html>',
  true
);
