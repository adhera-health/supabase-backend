/**
 * Postgres-backed fixed-window rate limiter for public edge routes.
 * Shared across all edge function instances via the rate_limits table
 * and the acquire_rate_limit_bucket RPC, so limits hold under horizontal
 * scaling instead of resetting per instance.
 */

import { RateLimitError } from "@shared/utils/errors.ts";
import { getServiceClient } from "@shared/database/client.ts";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export interface RateLimitOptions {
  key: string;
  max?: number;
  windowMs?: number;
}

/** Throws RateLimitError when the key exceeds its configured window budget. */
export async function assertRateLimit(options: RateLimitOptions): Promise<void> {
  const max = options.max ??
    parsePositiveInt(Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_MAX"), 60);
  
  const windowMs = options.windowMs ??
    parsePositiveInt(Deno.env.get("RATE_LIMIT_VALIDATE_TOKEN_WINDOW_MS"), 60_000);

  const now = Date.now();
  const windowStart = getWindowStart(now, windowMs);
  
  const client = getServiceClient();
  const { data, error } = await client.rpc("acquire_rate_limit_bucket", {
    p_key: options.key,
    p_window_start: windowStart,
    p_max: max,
  });

  if (error) {
    throw new RateLimitError("Unable to enforce rate limit right now.");
  }

  const allowed = data?.[0]?.allowed === true;
  if (!allowed) {
    throw new RateLimitError("Too many requests. Please try again later.");
  }
}