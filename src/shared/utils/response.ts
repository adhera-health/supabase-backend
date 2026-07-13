/**
 * Standard HTTP response helpers for Edge Functions.
 * All API responses follow the same JSON envelope so the frontend stays consistent.
 *
 * CORS is applied per-request via createHonoApp middleware (see cors.ts).
 */

import type { ApiMeta } from "@domain/api-response.ts";
import { getRequestCorrelationId } from "./correlation-context.ts";
import { toAppError } from "./errors.ts";

export const JSON_CONTENT_HEADERS = {
  "Content-Type": "application/json",
} as const;

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
}

function createMeta(): ApiMeta {
  const correlationId = getRequestCorrelationId();

  return {
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlation_id: correlationId } : {}),
  };
}

/** Low-level helper — builds a JSON Response (CORS applied by Hono middleware). */
export function json<T>(body: T, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_CONTENT_HEADERS, ...extraHeaders },
  });
}

/** 200/201 success response: { success: true, data, meta } */
export function success<T>(data: T, status = 200): Response {
  const body: SuccessBody<T> = {
    success: true,
    data,
    meta: createMeta(),
  };
  return json(body, status);
}

/** Maps an AppError (or any thrown value) to a consistent error response. */
export function errorResponse(error: unknown): Response {
  const appError = toAppError(error);

  const body: ErrorBody = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
    meta: createMeta(),
  };

  return json(body, appError.statusCode);
}
