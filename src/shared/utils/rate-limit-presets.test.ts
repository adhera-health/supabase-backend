/**
 * Integration tests against a real local Supabase Postgres instance
 * (`supabase start`) — see rate-limit.test.ts for why these presets are
 * exercised through the real rate_limits table/RPC rather than mocks.
 *
 * Run with: deno test --env-file=.env --allow-env --allow-net src/shared/utils/rate-limit-presets.test.ts
 */

import { assertEquals, assertRejects } from "@std/assert";
import { assertOnboardingSignInRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { RateLimitError } from "@shared/utils/errors.ts";
import { getServiceClient } from "@shared/database/client.ts";

function uniqueInvitationId(): number {
  // Fits Postgres bigint/int4 range comfortably while staying unique per run.
  return Math.floor(Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
}

async function cleanupInvitation(invitationId: number): Promise<void> {
  await getServiceClient()
    .from("rate_limits")
    .delete()
    .eq("key", `onboarding-signin:${invitationId}`);
}

Deno.test("assertOnboardingSignInRateLimit allows attempts up to the configured max", async () => {
  const invitationId = uniqueInvitationId();
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_MAX", "3");
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 3; i++) {
      await assertOnboardingSignInRateLimit(invitationId);
    }
  } finally {
    await cleanupInvitation(invitationId);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_MAX");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInRateLimit rejects once the max is exceeded for one invitation", async () => {
  const invitationId = uniqueInvitationId();
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_MAX", "3");
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 3; i++) {
      await assertOnboardingSignInRateLimit(invitationId);
    }

    await assertRejects(
      () => assertOnboardingSignInRateLimit(invitationId),
      RateLimitError,
      "Too many requests",
    );
  } finally {
    await cleanupInvitation(invitationId);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_MAX");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInRateLimit budgets are independent per invitation", async () => {
  const invitationA = uniqueInvitationId();
  const invitationB = invitationA + 1;
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_MAX", "1");
  Deno.env.set("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS", "60000");
  try {
    await assertOnboardingSignInRateLimit(invitationA);

    await assertRejects(
      () => assertOnboardingSignInRateLimit(invitationA),
      RateLimitError,
    );

    // A different invitation's budget must be untouched by A's exhaustion —
    // this is the property that closes the IP-rotation gap: the cap tracks
    // the invitation being attacked, not the caller.
    await assertOnboardingSignInRateLimit(invitationB);
  } finally {
    await cleanupInvitation(invitationA);
    await cleanupInvitation(invitationB);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_MAX");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInRateLimit defaults to 5 attempts per 30 minutes when unset", async () => {
  const invitationId = uniqueInvitationId();
  assertEquals(Deno.env.get("RATE_LIMIT_ONBOARDING_SIGNIN_MAX"), undefined);
  assertEquals(Deno.env.get("RATE_LIMIT_ONBOARDING_SIGNIN_WINDOW_MS"), undefined);
  try {
    for (let i = 0; i < 5; i++) {
      await assertOnboardingSignInRateLimit(invitationId);
    }

    await assertRejects(
      () => assertOnboardingSignInRateLimit(invitationId),
      RateLimitError,
    );
  } finally {
    await cleanupInvitation(invitationId);
  }
});
