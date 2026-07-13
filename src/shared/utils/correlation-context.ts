/**
 * Per-request correlation ID for log tracing (X-Correlation-ID).
 * Stored in AsyncLocalStorage so createLogger() picks it up in services too.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export const CORRELATION_ID_HEADER = "X-Correlation-ID";

/** Safe client-supplied IDs: UUIDs, trace tokens, etc. */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/** Validates client header or generates a new UUID. */
export function resolveCorrelationId(headerValue: string | undefined): string {
  const trimmed = headerValue?.trim();

  if (trimmed && CORRELATION_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return crypto.randomUUID();
}

/** Active correlation ID for the current edge function request, if any. */
export function getRequestCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Runs async work with correlation ID available to loggers and response meta. */
export async function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return await storage.run({ correlationId }, fn);
}
