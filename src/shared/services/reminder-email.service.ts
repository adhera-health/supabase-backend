/**
 * Onboarding reminder email delivery via Resend — Phase 1 Step D.
 */

import {
  DEV_RESEND_SETUP_HINT,
  getPatientAppBaseUrl,
  isResendConfigured,
  sendResendEmail,
} from "@shared/utils/resend.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createOptOutToken } from "@shared/utils/opt-out-token.ts";
import { createLogger } from "@shared/utils/logger.ts";
import type { InvitationStatus } from "@domain/invitation.ts";
import { PRE_CONSENT_ACCEPT_STATUSES } from "@shared/services/invitation-status-rules.ts";
import type { ReminderScheduleSlot } from "@domain/reminder.ts";

const logger = createLogger("reminder-email");

export interface SendReminderEmailInput {
  to: string;
  invitationUuid: string;
  invitationStatus: InvitationStatus;
  scheduleSlot: ReminderScheduleSlot;
  /** Fresh onboarding token for invited_* and email_opened patients. */
  onboardingToken?: string;
}

export interface ReminderEmailResult {
  sent: boolean;
  skip_reason?: "resend_not_configured";
  dev_hint?: string;
}

function buildActionUrl(
  invitationStatus: InvitationStatus,
  onboardingToken?: string,
): string {
  const baseUrl = getPatientAppBaseUrl();

  if (PRE_CONSENT_ACCEPT_STATUSES.includes(invitationStatus)) {
    return `${baseUrl}/consent`;
  }

  if (onboardingToken) {
    return `${baseUrl}/onboard?token=${encodeURIComponent(onboardingToken)}`;
  }

  return `${baseUrl}/onboard`;
}

async function buildOptOutUrl(invitationUuid: string): Promise<string> {
  const baseUrl = getPatientAppBaseUrl();
  const optOutToken = await createOptOutToken(invitationUuid);
  const params = new URLSearchParams({
    opt_out_token: optOutToken,
    channel: "email",
  });
  return `${baseUrl}/opt-out?${params.toString()}`;
}

function buildSubject(scheduleSlot: ReminderScheduleSlot): string {
  if (scheduleSlot === "48h") {
    return "Reminder: please complete your Adhera onboarding";
  }

  return "Reminder: your Adhera program invitation is waiting";
}

function buildHtml(params: {
  actionUrl: string;
  optOutUrl: string;
  scheduleSlot: ReminderScheduleSlot;
  invitationStatus: InvitationStatus;
}): string {
  const actionLabel = PRE_CONSENT_ACCEPT_STATUSES.includes(params.invitationStatus)
    ? "Complete consent"
    : "Continue onboarding";

  const intro = params.scheduleSlot === "48h"
    ? "<p>This is a follow-up reminder to complete your Adhera onboarding.</p>"
    : "<p>This is a friendly reminder about your Adhera care program invitation.</p>";

  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    ${intro}
    <p>
      <a href="${params.actionUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
        ${actionLabel}
      </a>
    </p>
    <p style="font-size: 14px; color: #444;">
      If you no longer wish to receive onboarding reminders,
      <a href="${params.optOutUrl}">unsubscribe here</a>.
    </p>
  </body>
</html>`;
}

/** Sends a reminder email when Resend is configured; skips gracefully in local dev. */
export async function sendReminderEmail(
  input: SendReminderEmailInput,
): Promise<ReminderEmailResult> {
  const resendConfigured = isResendConfigured();
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

  if (!resendConfigured) {
    if (isProduction) {
      throw new AppError("Reminder email is not configured", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }

    logger.warn("Reminder email skipped — delivery disabled in development", {
      to: input.to,
      invitation_uuid: input.invitationUuid,
      schedule_slot: input.scheduleSlot,
      dev_hint: DEV_RESEND_SETUP_HINT,
    });

    return {
      sent: false,
      skip_reason: "resend_not_configured",
      dev_hint: DEV_RESEND_SETUP_HINT,
    };
  }

  const actionUrl = buildActionUrl(input.invitationStatus, input.onboardingToken);
  const optOutUrl = await buildOptOutUrl(input.invitationUuid);
  const html = buildHtml({
    actionUrl,
    optOutUrl,
    scheduleSlot: input.scheduleSlot,
    invitationStatus: input.invitationStatus,
  });

  await sendResendEmail({
    to: input.to,
    subject: buildSubject(input.scheduleSlot),
    html,
  });

  logger.info("Reminder email sent", {
    to: input.to,
    invitation_uuid: input.invitationUuid,
    schedule_slot: input.scheduleSlot,
  });

  return { sent: true };
}
