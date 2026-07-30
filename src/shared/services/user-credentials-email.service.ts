/**
 * Credentials email for newly provisioned dashboard users.
 */

import type { DashboardStaffRole } from "@domain/user.ts";
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from "@shared/utils/environment.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";
import {
  DEV_RESEND_SETUP_HINT,
  isResendConfigured,
  sendResendEmail,
} from "@shared/utils/resend.ts";

const logger = createLogger("user-credentials-email");

export interface SendUserCredentialsEmailInput {
  to: string;
  password: string;
  role: DashboardStaffRole;
}

export interface UserCredentialsEmailResult {
  sent: boolean;
  skip_reason?: "resend_not_configured";
  dev_hint?: string;
}

function formatRoleLabel(role: DashboardStaffRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "recruiter":
      return "Recruiter";
    case "manager":
      return "Manager";
    default:
      return role;
  }
}

function buildCredentialsEmailHtml(input: SendUserCredentialsEmailInput): string {
  const roleLabel = formatRoleLabel(input.role);

  return `
    <p>Your Adhera dashboard account has been created.</p>
    <p><strong>Role:</strong> ${roleLabel}</p>
    <p><strong>Email:</strong> ${input.to}</p>
    <p><strong>Temporary password:</strong> ${input.password}</p>
    <p>Please sign in and change your password as soon as possible.</p>
  `.trim();
}

/** Sends account credentials when Resend is configured; skips gracefully in local dev. */
export async function sendUserCredentialsEmail(
  input: SendUserCredentialsEmailInput,
): Promise<UserCredentialsEmailResult> {
  const resendConfigured = isResendConfigured();
  const isProduction = isProductionEnvironment();

  if (!resendConfigured) {
    if (isProduction) {
      throw new AppError("User credentials email is not configured", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }

    logger.warn("User credentials email skipped — delivery disabled in development", {
      to: input.to,
      role: input.role,
      dev_hint: DEV_RESEND_SETUP_HINT,
      ...(isDevelopmentEnvironment() && {
        generated_password: input.password,
      }),
    });

    return {
      sent: false,
      skip_reason: "resend_not_configured",
      dev_hint: DEV_RESEND_SETUP_HINT,
    };
  }

  await sendResendEmail({
    to: input.to,
    subject: "Your Adhera dashboard account",
    html: buildCredentialsEmailHtml(input),
    fromEnvVar: "INVITATION_FROM_EMAIL",
  });

  logger.info("User credentials email sent", {
    to: input.to,
    role: input.role,
  });

  return { sent: true };
}
