/**
 * Auth0 client-credentials (M2M) token for License Service.
 *
 * In-memory cache with single-flight refresh — concurrent callers share one Auth0 request.
 */

import { getLicenseAuth0Config } from "./config.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("license-auth0");

const REFRESH_BUFFER_MS = 30_000;
const DEFAULT_EXPIRES_IN_SEC = 3600;
const AUTH0_REQUEST_TIMEOUT_MS = 15_000;

interface CachedToken {
  accessToken: string;
  /** Epoch ms when the token should be refreshed. */
  expiresAtMs: number;
}

interface InflightRefresh {
  epoch: number;
  promise: Promise<string>;
}

let cachedToken: CachedToken | null = null;
let refreshEpoch = 0;
let inflightRefresh: InflightRefresh | null = null;

function isCacheValid(now: number): boolean {
  return cachedToken !== null && now < cachedToken.expiresAtMs - REFRESH_BUFFER_MS;
}

/** Clears cached M2M token and invalidates any in-flight refresh epoch. */
export function clearTokenCache(): void {
  cachedToken = null;
  refreshEpoch += 1;
  inflightRefresh = null;
}

/**
 * Returns a Bearer access token for License Service calls.
 * Concurrent requests share a single in-flight Auth0 fetch per instance.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (isCacheValid(now)) {
    return cachedToken!.accessToken;
  }

  const epoch = refreshEpoch;
  if (inflightRefresh?.epoch === epoch) {
    return inflightRefresh.promise;
  }

  const promise = fetchAndCacheToken(now, epoch);
  inflightRefresh = { epoch, promise };

  try {
    return await promise;
  } finally {
    if (inflightRefresh?.epoch === epoch) {
      inflightRefresh = null;
    }
  }
}

function mapAuth0HttpError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError("Auth0 rejected License Service client credentials", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status },
    });
  }

  if (status === 408 || status === 504) {
    return new AppError("Auth0 token request timed out", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status },
    });
  }

  if (status === 429) {
    return new AppError("Auth0 rate limit exceeded for License Service token", {
      statusCode: 503,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status },
    });
  }

  if (status >= 500) {
    return new AppError("Auth0 is temporarily unavailable", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status },
    });
  }

  return new AppError("Failed to obtain Auth0 token for License Service", {
    statusCode: 502,
    code: "INTERNAL_ERROR",
    details: { upstream_status: status },
  });
}

function parseExpiresInSec(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    logger.warn("Auth0 token response has invalid expires_in — using default TTL", {
      default_expires_in_sec: DEFAULT_EXPIRES_IN_SEC,
    });
    return DEFAULT_EXPIRES_IN_SEC;
  }

  return Math.floor(value);
}

async function fetchAuth0Token(config: ReturnType<typeof getLicenseAuth0Config>): Promise<Response> {
  const tokenUrl = `https://${config.domain}/oauth/token`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH0_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: config.audience,
        scope: config.scope,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AppError(
      aborted
        ? "Auth0 token request timed out"
        : "Failed to reach Auth0 for License Service token",
      {
        statusCode: 502,
        code: "INTERNAL_ERROR",
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAndCacheToken(startedAtMs: number, epoch: number): Promise<string> {
  const config = getLicenseAuth0Config();
  const tokenUrlHost = config.domain;

  logger.info("Auth0 M2M token request started", {
    domain: config.domain,
    audience: config.audience,
  });

  const response = await fetchAuth0Token(config);
  const responseText = await response.text();

  if (!response.ok) {
    logger.error("Auth0 M2M token request failed", {
      domain: tokenUrlHost,
      status: response.status,
    });
    throw mapAuth0HttpError(response.status);
  }

  let parsed: { access_token?: unknown; expires_in?: unknown };
  try {
    parsed = JSON.parse(responseText) as { access_token?: unknown; expires_in?: unknown };
  } catch (error) {
    throw new AppError("Auth0 returned invalid JSON for License Service token", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      cause: error,
    });
  }

  if (typeof parsed.access_token !== "string" || !parsed.access_token.trim()) {
    throw new AppError("Auth0 token response missing access_token", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
    });
  }

  const accessToken = parsed.access_token.trim();
  const expiresInSec = parseExpiresInSec(parsed.expires_in);
  const expiresAtMs = startedAtMs + expiresInSec * 1000;

  if (epoch === refreshEpoch) {
    cachedToken = { accessToken, expiresAtMs };
    logger.info("Auth0 M2M token refreshed", {
      expires_at: new Date(expiresAtMs).toISOString(),
      expires_in_sec: expiresInSec,
    });
  } else {
    logger.info("Auth0 M2M token fetched but not cached (cache was invalidated during fetch)", {
      expires_in_sec: expiresInSec,
    });
  }

  return accessToken;
}
