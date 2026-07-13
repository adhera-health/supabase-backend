/**
 * License Service + Auth0 M2M configuration from environment.
 */

import { AppError } from "@shared/utils/errors.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BATCH_PATH = "/api/v1/licenses/batch";
const DEFAULT_AUTH0_SCOPE = "admin:licenses";

function parseTimeoutMs(): number {
  const raw = Deno.env.get("LICENSE_TIMEOUT_MS")?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function normalizePath(path: string): string {
  return path.replace(/^\/*/, "/");
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export interface LicenseServiceConfig {
  baseUrl: string;
  batchPath: string;
  timeoutMs: number;
  auth0Domain: string;
  auth0ClientId: string;
  auth0ClientSecret: string;
  auth0Audience: string;
  auth0Scope: string;
}

export interface LicenseAuth0Config {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  scope: string;
}

/** True when all five production License + Auth0 vars are set. */
export function isLicenseServiceConfigured(): boolean {
  return (
    Boolean(trimOrNull(Deno.env.get("LICENSE_SERVICE_BASE_URL"))) &&
    Boolean(trimOrNull(Deno.env.get("LICENSE_AUTH0_DOMAIN"))) &&
    Boolean(trimOrNull(Deno.env.get("LICENSE_AUTH0_CLIENT_ID"))) &&
    Boolean(trimOrNull(Deno.env.get("LICENSE_AUTH0_CLIENT_SECRET"))) &&
    Boolean(trimOrNull(Deno.env.get("LICENSE_AUTH0_AUDIENCE")))
  );
}

function requireConfigured(): LicenseServiceConfig {
  const baseUrl = trimOrNull(Deno.env.get("LICENSE_SERVICE_BASE_URL"));
  const auth0Domain = trimOrNull(Deno.env.get("LICENSE_AUTH0_DOMAIN"));
  const auth0ClientId = trimOrNull(Deno.env.get("LICENSE_AUTH0_CLIENT_ID"));
  const auth0ClientSecret = trimOrNull(Deno.env.get("LICENSE_AUTH0_CLIENT_SECRET"));
  const auth0Audience = trimOrNull(Deno.env.get("LICENSE_AUTH0_AUDIENCE"));

  if (
    !baseUrl ||
    !auth0Domain ||
    !auth0ClientId ||
    !auth0ClientSecret ||
    !auth0Audience
  ) {
    throw new AppError(
      "License Service is not configured. Set LICENSE_SERVICE_BASE_URL and LICENSE_AUTH0_* variables.",
      { statusCode: 503, code: "INTERNAL_ERROR" },
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    batchPath: normalizePath(
      trimOrNull(Deno.env.get("LICENSE_BATCH_PATH")) ?? DEFAULT_BATCH_PATH,
    ),
    timeoutMs: parseTimeoutMs(),
    auth0Domain: auth0Domain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    auth0ClientId,
    auth0ClientSecret,
    auth0Audience,
    auth0Scope: trimOrNull(Deno.env.get("LICENSE_AUTH0_SCOPE")) ?? DEFAULT_AUTH0_SCOPE,
  };
}

export function getLicenseServiceConfig(): LicenseServiceConfig {
  return requireConfigured();
}

export function getLicenseAuth0Config(): LicenseAuth0Config {
  const config = requireConfigured();
  return {
    domain: config.auth0Domain,
    clientId: config.auth0ClientId,
    clientSecret: config.auth0ClientSecret,
    audience: config.auth0Audience,
    scope: config.auth0Scope,
  };
}
