/**
 * Invitation email delivery via Resend — DB templates + per-send overrides.
 */

import { getActiveConsentDocument } from "@shared/database/queries/consent.query.ts";
import { resolveInvitationEmailContent } from "@shared/services/email-template.service.ts";
import type { InvitationEmailContentOverride } from "@domain/email-template.ts";
import { AppError } from "@shared/utils/errors.ts";
import {
  findUnresolvedInvitationPlaceholders,
  renderEmailTemplate,
} from "@shared/utils/email-template-render.ts";
import { createLogger } from "@shared/utils/logger.ts";
import {
  DEV_RESEND_SETUP_HINT,
  getPatientAppBaseUrl,
  isResendConfigured,
  sendResendEmail,
} from "@shared/utils/resend.ts";

const logger = createLogger("invitation-email");

const TOKEN_TTL_HOURS = 72;

export interface SendInvitationEmailInput {
  to: string;
  onboardingToken: string;
  /** Tenant UUID the invitation was created for (consent lookup). */
  clientId: string;
  /** Program UUID the invitation was created for (consent lookup). */
  programId: string;
  /** Per-send only — not persisted to email_templates. */
  contentOverride?: InvitationEmailContentOverride;
}

export interface InvitationEmailResult {
  sent: boolean;
  skip_reason?: "resend_not_configured";
  dev_hint?: string;
}

function buildOnboardingUrl(token: string): string {
  return `${getPatientAppBaseUrl()}/onboard?token=${encodeURIComponent(token)}`;
}

function getPatientAppDownloadUrl(): string {
  return Deno.env.get("PATIENT_APP_DOWNLOAD_URL")?.trim() ?? "";
}

/** Sends onboarding invite email when Resend is configured; skips gracefully in local dev. */
export async function sendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<InvitationEmailResult> {
  // Validate default template + overrides even when Resend is disabled (local dev).
  const resolved = await resolveInvitationEmailContent(input.contentOverride);

  const resendConfigured = isResendConfigured();
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

  if (!resendConfigured) {
    if (isProduction) {
      throw new AppError("Invitation email is not configured", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }

    logger.warn("Invitation email skipped — delivery disabled in development", {
      to: input.to,
      client_id: input.clientId,
      program_id: input.programId,
      dev_hint: DEV_RESEND_SETUP_HINT,
    });

    return {
      sent: false,
      skip_reason: "resend_not_configured",
      dev_hint: DEV_RESEND_SETUP_HINT,
    };
  }

  const consentDocument = await getActiveConsentDocument(input.clientId, input.programId);
  const privacyNoticeUrl = consentDocument?.privacy_notice_url ??
    "https://example.com/privacy/adhera";

  const onboardingUrl = buildOnboardingUrl(input.onboardingToken);

  const renderVars = {
    onboarding_url: onboardingUrl,
    privacy_notice_url: privacyNoticeUrl,
    expires_in_hours: String(TOKEN_TTL_HOURS),
    patient_app_download_url: getPatientAppDownloadUrl(),
  };

  const subject = renderEmailTemplate(resolved.subject, renderVars);
  const html = renderEmailTemplate(resolved.html_body, renderVars);

  const optionalUnresolved = findUnresolvedInvitationPlaceholders(html).filter(
    (key) => key === "patient_app_download_url",
  );
  if (optionalUnresolved.length > 0) {
    logger.warn("Invitation email has unresolved optional placeholders", {
      placeholders: optionalUnresolved,
    });
  }

  await sendResendEmail({
    to: input.to,
    subject,
    html,
  });

  logger.info("Invitation email sent", {
    to: input.to,
    client_id: input.clientId,
    program_id: input.programId,
    used_default_subject: resolved.used_default_subject,
    used_default_html_body: resolved.used_default_html_body,
    default_template_uuid: resolved.default_template_uuid,
  });

  return { sent: true };
}
