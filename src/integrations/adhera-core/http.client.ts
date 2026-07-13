/**
 * Shared HTTP client for Adhera Core external APIs.
 * Auth headers come from auth.ts — business services never set them.
 *
 * Pagination: v1 assumes a complete list in one response.
 * TODO: If the client API later paginates, aggregate pages here and still
 * return a full list to services so route contracts stay unchanged.
 */

import { buildAdheraCoreAuthHeaders } from "./auth.ts";
import { getAdheraCoreConfig } from "./config.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("adhera-core-http");

function truncateForLog(value: string, max = 400): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export interface AdheraCoreRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Extra headers merged after auth headers. */
  headers?: Record<string, string>;
  body?: unknown;
  /** Absolute path starting with `/`, relative to ADHERA_CORE_BASE_URL. */
  path: string;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Performs a request against Adhera Core and returns parsed JSON.
 * Throws AppError on network failure, non-2xx, or non-JSON body.
 */
export async function adheraCoreRequest(
  options: AdheraCoreRequestOptions,
): Promise<unknown> {
  const config = getAdheraCoreConfig();
  const url = joinUrl(config.baseUrl, options.path);
  const method = options.method ?? "GET";

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...buildAdheraCoreAuthHeaders(),
    ...(options.headers ?? {}),
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  logger.info("Adhera Core request", { method, path: options.path });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AppError(
      aborted
        ? "Adhera Core API request timed out"
        : "Adhera Core API request failed",
      {
        statusCode: 502,
        code: "INTERNAL_ERROR",
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();

  if (!response.ok) {
    const bodySnippet = responseText.trim() ? truncateForLog(responseText.trim()) : null;
    logger.error("Adhera Core API non-success status", {
      method,
      path: options.path,
      status: response.status,
      body_snippet: bodySnippet,
    });
    throw new AppError(
      `Adhera Core API error (HTTP ${response.status})`,
      {
        statusCode: 502,
        code: "INTERNAL_ERROR",
        details: {
          upstream_status: response.status,
          upstream_path: options.path,
        },
      },
    );
  }

  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    throw new AppError("Adhera Core API returned invalid JSON", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
      cause: error,
    });
  }
}

/** Convenience GET helper. */
export function adheraCoreGet(path: string): Promise<unknown> {
  return adheraCoreRequest({ path, method: "GET" });
}
