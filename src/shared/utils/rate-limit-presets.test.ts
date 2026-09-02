/**
 * Integration tests against a real local Supabase Postgres instance
 * (`supabase start`) — see rate-limit.test.ts for why these presets are
 * exercised through the real rate_limits table/RPC rather than mocks.
 *
 * Run with: deno test --env-file=.env --allow-env --allow-net src/shared/utils/rate-limit-presets.test.ts
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  assertOnboardingSignInNotLockedOut,
  assertOnboardingSignInRateLimit,
  recordOnboardingSignInFailure,
} from "@shared/utils/rate-limit-presets.ts";
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

async function cleanupLockout(invitationId: number): Promise<void> {
  await getServiceClient()
    .from("rate_limits")
    .delete()
    .eq("key", `onboarding-signin-lockout:${invitationId}`);
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

/**
 * Fixed-window buckets are aligned to absolute wall-clock time, not to the
 * first call — see rate-limit.test.ts for why this wait is needed to keep
 * rollover assertions deterministic.
 */
async function waitForFreshWindow(windowMs: number): Promise<void> {
  while (Date.now() % windowMs > windowMs * 0.2) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

Deno.test("assertOnboardingSignInNotLockedOut allows attempts below the failure threshold", async () => {
  const invitationId = uniqueInvitationId();
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES", "3");
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 2; i++) {
      await assertOnboardingSignInNotLockedOut(invitationId);
      await recordOnboardingSignInFailure(invitationId);
    }

    // Third attempt: still under the max-3 threshold (2 failures recorded so far).
    await assertOnboardingSignInNotLockedOut(invitationId);
  } finally {
    await cleanupLockout(invitationId);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInNotLockedOut rejects once failures reach the threshold", async () => {
  const invitationId = uniqueInvitationId();
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES", "3");
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 3; i++) {
      await recordOnboardingSignInFailure(invitationId);
    }

    await assertRejects(
      () => assertOnboardingSignInNotLockedOut(invitationId),
      RateLimitError,
      "Too many failed sign-in attempts",
    );
  } finally {
    await cleanupLockout(invitationId);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInNotLockedOut tracks failures independently per invitation", async () => {
  const invitationA = uniqueInvitationId();
  const invitationB = invitationA + 1;
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES", "1");
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS", "60000");
  try {
    await recordOnboardingSignInFailure(invitationA);

    await assertRejects(
      () => assertOnboardingSignInNotLockedOut(invitationA),
      RateLimitError,
    );

    // A different invitation's lockout budget must be untouched by A's exhaustion.
    await assertOnboardingSignInNotLockedOut(invitationB);
  } finally {
    await cleanupLockout(invitationA);
    await cleanupLockout(invitationB);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS");
  }
});

Deno.test("assertOnboardingSignInNotLockedOut clears once the lockout window rolls over", async () => {
  const invitationId = uniqueInvitationId();
  const windowMs = 300;
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES", "1");
  Deno.env.set("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS", String(windowMs));
  try {
    await waitForFreshWindow(windowMs);
    await recordOnboardingSignInFailure(invitationId);

    await assertRejects(
      () => assertOnboardingSignInNotLockedOut(invitationId),
      RateLimitError,
    );

    await new Promise((resolve) => setTimeout(resolve, windowMs + 100));

    await assertOnboardingSignInNotLockedOut(invitationId);
  } finally {
    await cleanupLockout(invitationId);
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_MAX_FAILURES");
    Deno.env.delete("RATE_LIMIT_ONBOARDING_LOCKOUT_WINDOW_MS");
  }
});
