/**
 * HTTP client for License Service (Bearer from Auth0 M2M).
 * Retries once on HTTP 401 after clearing the Auth0 token cache.
 */

import {
  clearTokenCache,
  getAccessToken,
} from "./auth0.ts";
import { getLicenseServiceConfig } from "./config.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("license-http");

function truncateForLog(value: string, max = 400): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export interface LicenseServiceRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function mapUpstreamHttpError(status: number, path: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError("License Service authentication failed", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status, upstream_path: path },
    });
  }

  if (status === 404) {
    return new AppError("License Service endpoint not found", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status, upstream_path: path },
    });
  }

  if (status === 408 || status === 504) {
    return new AppError("License Service request timed out", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status, upstream_path: path },
    });
  }

  if (status === 429) {
    return new AppError("License Service rate limit exceeded", {
      statusCode: 503,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status, upstream_path: path },
    });
  }

  if (status >= 500) {
    return new AppError("License Service is temporarily unavailable", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      details: { upstream_status: status, upstream_path: path },
    });
  }

  return new AppError(`License Service error (HTTP ${status})`, {
    statusCode: 502,
    code: "INTERNAL_ERROR",
    details: { upstream_status: status, upstream_path: path },
  });
}

async function executeLicenseFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AppError(
      aborted
        ? "License Service request timed out"
        : "License Service request failed",
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

/**
 * Authenticated request against License Service. Returns parsed JSON.
 */
export async function licenseServiceRequest(
  options: LicenseServiceRequestOptions,
): Promise<unknown> {
  const config = getLicenseServiceConfig();
  const url = joinUrl(config.baseUrl, options.path);
  const method = options.method ?? "GET";

  let body: string | undefined;
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) {
    baseHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  logger.info("License Service request", { method, path: options.path });

  let accessToken = await getAccessToken();
  let response = await executeLicenseFetch(
    url,
    method,
    { ...baseHeaders, Authorization: `Bearer ${accessToken}` },
    body,
    config.timeoutMs,
  );

  if (response.status === 401) {
    logger.warn("License Service returned 401 — invalidating Auth0 token cache and retrying once", {
      path: options.path,
    });
    clearTokenCache();
    accessToken = await getAccessToken();
    response = await executeLicenseFetch(
      url,
      method,
      { ...baseHeaders, Authorization: `Bearer ${accessToken}` },
      body,
      config.timeoutMs,
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    const bodySnippet = responseText.trim() ? truncateForLog(responseText.trim()) : null;
    logger.error("License Service non-success status", {
      method,
      path: options.path,
      status: response.status,
      body_snippet: bodySnippet,
    });
    throw mapUpstreamHttpError(response.status, options.path);
  }

  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    throw new AppError("License Service returned invalid JSON", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      cause: error,
    });
  }
}
