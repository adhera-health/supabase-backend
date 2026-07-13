/**
 * Named rate-limit presets for edge function routes (PRD §19 / OWASP).
 */

import { assertRateLimit } from "@shared/utils/rate-limit.ts";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type AdminRateLimitAction =
  | "invitation_send"
  | "invitation_clients_list"
  | "invitation_client_programs_list"
  | "invitation_resend"
  | "invitation_drop_out"
  | "consent_document_upload"
  | "consent_document_activate"
  | "email_template_create"
  | "email_template_update"
  | "email_template_delete"
  | "user_create"
  | "user_delete"
  | "user_role_update";

const ADMIN_ACTION_DEFAULTS: Record<
  AdminRateLimitAction,
  { max: number; windowMs: number; envMaxKey: string }
> = {
  invitation_send: {
    max: 30,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_SEND_MAX",
  },
  invitation_clients_list: {
    max: 60,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_CLIENTS_LIST_MAX",
  },
  invitation_client_programs_list: {
    max: 120,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_CLIENT_PROGRAMS_LIST_MAX",
  },
  invitation_resend: {
    max: 20,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_RESEND_MAX",
  },
  invitation_drop_out: {
    max: 30,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_DROP_OUT_MAX",
  },
  consent_document_upload: {
    max: 10,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_CONSENT_UPLOAD_MAX",
  },
  consent_document_activate: {
    max: 20,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_CONSENT_ACTIVATE_MAX",
  },
  email_template_create: {
    max: 20,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_EMAIL_TEMPLATE_CREATE_MAX",
  },
  email_template_update: {
    max: 30,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_EMAIL_TEMPLATE_UPDATE_MAX",
  },
  email_template_delete: {
    max: 10,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_EMAIL_TEMPLATE_DELETE_MAX",
  },
  user_create: {
    max: 20,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_USER_CREATE_MAX",
  },
  user_delete: {
    max: 20,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_USER_DELETE_MAX",
  },
  user_role_update: {
    max: 30,
    windowMs: 60_000,
    envMaxKey: "RATE_LIMIT_ADMIN_USER_ROLE_UPDATE_MAX",
  },
};

const ADMIN_WINDOW_MS_ENV = "RATE_LIMIT_ADMIN_WINDOW_MS";

/** Rate limit authenticated staff mutations per admin user id. */
export function assertAdminActionRateLimit(
  adminUserId: string,
  action: AdminRateLimitAction,
): void {
  const preset = ADMIN_ACTION_DEFAULTS[action];
  const windowMs = parsePositiveInt(
    Deno.env.get(ADMIN_WINDOW_MS_ENV),
    preset.windowMs,
  );

  assertRateLimit({
    key: `admin:${action}:${adminUserId}`,
    max: parsePositiveInt(Deno.env.get(preset.envMaxKey), preset.max),
    windowMs,
  });
}

/** Public validate-token (GET) — per client IP. */
export function assertValidateTokenRateLimit(clientIp: string): void {
  assertRateLimit({
    key: `validate-token:${clientIp}`,
    max: parsePositiveInt(Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_MAX"), 60),
    windowMs: parsePositiveInt(
      Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_WINDOW_MS"),
      60_000,
    ),
  });
}

/** Public complete-onboarding — per client IP. */
export function assertCompleteOnboardingRateLimit(clientIp: string): void {
  assertRateLimit({
    key: `complete-onboarding:${clientIp}`,
    max: parsePositiveInt(Deno.env.get("RATE_LIMIT_COMPLETE_ONBOARDING_MAX"), 10),
    windowMs: parsePositiveInt(
      Deno.env.get("RATE_LIMIT_COMPLETE_ONBOARDING_WINDOW_MS"),
      60_000,
    ),
  });
}

/** Public communication opt-out — per client IP. */
export function assertOptOutRateLimit(clientIp: string): void {
  assertRateLimit({
    key: `patient-opt-out-email-reminders:${clientIp}`,
    max: parsePositiveInt(Deno.env.get("RATE_LIMIT_OPT_OUT_MAX"), 30),
    windowMs: parsePositiveInt(
      Deno.env.get("RATE_LIMIT_OPT_OUT_WINDOW_MS"),
      60_000,
    ),
  });
}
