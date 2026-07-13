/**
 * HTTP request helpers shared across edge functions.
 */

import type { Context } from "hono";

/** Best-effort client IP from reverse-proxy headers. */
export function getClientIp(c: Context): string | null {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return c.req.header("x-real-ip")?.trim() ?? null;
}
