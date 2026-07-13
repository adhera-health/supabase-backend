-- Block 5: Richer default invitation email (web onboarding — no app download block).
-- Legal/data-controller paragraphs marked for client review; placeholders unchanged.

UPDATE email_templates
SET
  subject = 'Your Adhera program invitation',
  html_body = $html$<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">You are invited to the Adhera care program</h1>

    <p style="margin: 0 0 12px;">Hello,</p>
    <p style="margin: 0 0 20px;">
      Your care team has invited you to take part in the Adhera digital care program.
      Registration is completed <strong>online in your browser</strong> using the secure link below.
    </p>

    <p style="margin: 0 0 20px;">
      <a href="{{onboarding_url}}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Accept invitation and start onboarding
      </a>
    </p>

    <p style="margin: 0 0 24px; font-size: 14px; color: #444444;">
      This link is personal to you and expires in <strong>{{expires_in_hours}} hours</strong>.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

    <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 12px;">Privacy and your data</h2>
    <p style="margin: 0 0 12px;">
      Before you register, you can read how we use your information:
      <a href="{{privacy_notice_url}}">Privacy notice</a>
    </p>
    <p style="margin: 0 0 20px; font-size: 13px; color: #555555;">
      <strong>Data controller.</strong>
      Your hospital or program sponsor, together with Adhera, processes your personal data to deliver
      this digital care program. Full details are provided in the privacy notice and consent documents
      presented during onboarding. [TBD — legal review.]
    </p>

    <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 12px;">Reminder emails</h2>
    <p style="margin: 0 0 24px; font-size: 13px; color: #555555;">
      If you do not complete onboarding, we may send a small number of reminder emails about this
      invitation. You can opt out of those reminders at any time using the link in those emails.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

    <p style="margin: 0 0 12px; font-size: 12px; color: #666666;">
      <strong>Legal notice.</strong>
      This message is intended only for the person named in this invitation. If you received it in
      error, please delete it and do not use the link. Unauthorized use or sharing of this link is
      not permitted.
    </p>

    <p style="margin: 24px 0 0; font-size: 12px; color: #999999;">
      Adhera Caring Digital Program<br />
      This is an automated message — please do not reply to this email.
    </p>
  </body>
</html>$html$,
  updated_at = now()
WHERE template_type = 'invitation'
  AND is_default = true;
