/**
 * HTTP request helpers shared across edge functions.
 */

import type { Context } from "hono";

/**
 * Client IP from reverse-proxy headers.
 *
 * This project runs behind Cloudflare (Supabase Edge Functions execute as
 * Cloudflare Workers — see cf-ray/cf-worker/cdn-loop headers). Verified
 * empirically against the hosted project on 2026-08-11 via a temporary
 * debug endpoint:
 *  - A spoofed `X-Forwarded-For` value sent by the client never reaches the
 *    function unmodified or appended — it's discarded and the header is
 *    rebuilt from Cloudflare's own connection info. Its LAST entry is not
 *    the client's IP either: it's an unstable internal hop that changed
 *    between two consecutive requests from the same machine.
 *  - A spoofed `CF-Connecting-IP` doesn't reach the function at all —
 *    Cloudflare rejects the request outright with a 403 (Error 1000 /
 *    dns_loop) before invoking the Worker, because that header is
 *    Cloudflare-internal and can't be forged by an external client.
 *
 * So `cf-connecting-ip` is the trustworthy source here. `X-Forwarded-For`'s
 * FIRST entry matched it in testing and is kept as a fallback for
 * environments without Cloudflare in front (e.g. local dev), where neither
 * header carries a real trust guarantee anyway.
 */
export function getClientIp(c: Context): string | null {
  const cfConnectingIp = c.req.header("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return c.req.header("x-real-ip")?.trim() ?? null;
}
