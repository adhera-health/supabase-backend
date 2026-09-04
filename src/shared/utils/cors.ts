/**
 * CORS resolution for edge functions — production allowlist with dev fallback.
 */

import { isProductionEnvironment } from "@shared/utils/environment.ts";
import { AppError, ForbiddenError } from "@shared/utils/errors.ts";

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-secret, x-correlation-id, x-license-reservation-secret";

const CORS_EXPOSE_HEADERS = "X-Correlation-ID";

const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/** Parses comma-separated origins from ALLOWED_CORS_ORIGINS. */
export function getAllowedCorsOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_CORS_ORIGINS")?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Fails closed in production when ALLOWED_CORS_ORIGINS is unset.
 * Call at the start of each edge function request path.
 */
export function assertProductionCorsConfigured(): void {
  if (!isProductionEnvironment()) return;

  if (getAllowedCorsOrigins().length === 0) {
    throw new AppError("ALLOWED_CORS_ORIGINS must be configured in production", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }
}

/**
 * Resolves Access-Control-Allow-Origin for a request.
 * - Development: `*` when allowlist unset; otherwise reflect matching Origin.
 * - Production: reflect Origin only when it matches the allowlist.
 */
export function resolveCorsOrigin(requestOrigin: string | undefined | null): string | null {
  const allowed = getAllowedCorsOrigins();

  if (!isProductionEnvironment()) {
    if (allowed.length === 0) return "*";
    if (!requestOrigin) return allowed[0];
    return allowed.includes(requestOrigin) ? requestOrigin : null;
  }

  if (allowed.length === 0) return null;
  if (!requestOrigin) return null;
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

/** Applies CORS headers to a Response when an origin is resolved. */
export function applyCorsToResponse(
  response: Response,
  requestOrigin: string | undefined | null,
): void {
  const origin = resolveCorsOrigin(requestOrigin);

  if (!origin) {
    if (isProductionEnvironment() && requestOrigin) {
      throw new ForbiddenError("Origin not allowed");
    }
    return;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
  response.headers.set("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS);
  response.headers.set("Vary", "Origin");
}

/** Builds a CORS preflight (OPTIONS) response. */
export function buildCorsPreflightResponse(
  requestOrigin: string | undefined | null,
): Response {
  assertProductionCorsConfigured();

  const origin = resolveCorsOrigin(requestOrigin);

  if (!origin) {
    if (isProductionEnvironment()) {
      throw new ForbiddenError("Origin not allowed");
    }

    return new Response(null, { status: 204 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
      "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
      "Access-Control-Expose-Headers": CORS_EXPOSE_HEADERS,
      Vary: "Origin",
    },
  });
}
