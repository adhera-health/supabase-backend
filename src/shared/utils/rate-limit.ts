/**
 * In-memory fixed-window rate limiter for public edge routes.
 * Suitable for single-worker local dev and per-instance production limits.
 */

import { RateLimitError } from "@shared/utils/errors.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RateLimitOptions {
  key: string;
  max?: number;
  windowMs?: number;
}

/** Throws RateLimitError when the key exceeds its configured window budget. */
export function assertRateLimit(options: RateLimitOptions): void {
  const max = options.max ??
    parsePositiveInt(Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_MAX"), 60);
  const windowMs = options.windowMs ??
    parsePositiveInt(Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_WINDOW_MS"), 60_000);

  const now = Date.now();
  const existing = buckets.get(options.key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(options.key, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;

  if (existing.count > max) {
    throw new RateLimitError("Too many requests. Please try again later.");
  }
}

/** Clears all buckets — intended for tests only. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
