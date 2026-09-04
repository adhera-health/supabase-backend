/**
 * Local dev runner for rate_limits cleanup.
 *
 * Usage:
 *   deno task run:rate-limits-cleanup
 *
 * Requires: supabase start, .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { cleanupStaleRateLimits } from "@shared/services/rate-limit-cleanup.service.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env or pass --env-file=.env`);
    Deno.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const summary = await cleanupStaleRateLimits();

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
