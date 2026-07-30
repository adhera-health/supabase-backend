/**
 * Shared Resend email transport helpers.
 */

import { isProductionEnvironment } from "@shared/utils/environment.ts";
import { AppError } from "@shared/utils/errors.ts";

const DEV_PATIENT_APP_BASE_URL = "http://localhost:3000";

/** True when Resend should send. Development skips email unless ENABLE_RESEND_IN_DEV=true. */
export function isResendConfigured(): boolean {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) return false;

  const isProduction = isProductionEnvironment();
  if (isProduction) return true;

  return Deno.env.get("ENABLE_RESEND_IN_DEV") === "true";
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new AppError(`Missing required environment variable: ${name}`, {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }
  return value;
}

export function getPatientAppBaseUrl(): string {
  const configured = Deno.env.get("PATIENT_APP_BASE_URL")?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const isProduction = isProductionEnvironment();
  if (isProduction) {
    throw new AppError("Missing required environment variable: PATIENT_APP_BASE_URL", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }

  return DEV_PATIENT_APP_BASE_URL;
}

export function formatResendError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // fall through
  }
  return `Resend API error (HTTP ${status})`;
}

export async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  fromEnvVar?: string;
}): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv(params.fromEnvVar ?? "INVITATION_FROM_EMAIL");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const message = formatResendError(response.status, body);
    throw new AppError(`Failed to send email: ${message}`, {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      cause: { status: response.status, body },
    });
  }
}

export const DEV_RESEND_SETUP_HINT =
  "Development skips Resend by default. Copy onboarding_token from `supabase functions serve` logs. To send real emails locally: set ENABLE_RESEND_IN_DEV=true, RESEND_API_KEY, and INVITATION_FROM_EMAIL in .env, then restart functions serve.";
