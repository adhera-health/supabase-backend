/**
 * Integration tests against a real local Supabase Postgres instance
 * (`supabase start`) — see rate-limit.test.ts for why these presets are
 * exercised through the real rate_limits table/RPC rather than mocks.
 *
 * Run with: deno test --env-file=.env --allow-env --allow-net src/shared/utils/rate-limit-presets.test.ts
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  assertLicenseReservationLookupRateLimit,
  assertOnboardingSignInRateLimit,
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

function uniqueLookupIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 255)}-${Date.now()}`;
}

async function cleanupLicenseLookup(clientIp: string): Promise<void> {
  await getServiceClient()
    .from("rate_limits")
    .delete()
    .eq("key", `license-reservation-lookup:${clientIp}`);
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

Deno.test("assertLicenseReservationLookupRateLimit allows attempts up to the configured max", async () => {
  const clientIp = uniqueLookupIp();
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_MAX", "3");
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 3; i++) {
      await assertLicenseReservationLookupRateLimit(clientIp);
    }
  } finally {
    await cleanupLicenseLookup(clientIp);
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_MAX");
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS");
  }
});

Deno.test("assertLicenseReservationLookupRateLimit rejects once the max is exceeded for one IP", async () => {
  const clientIp = uniqueLookupIp();
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_MAX", "3");
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS", "60000");
  try {
    for (let i = 0; i < 3; i++) {
      await assertLicenseReservationLookupRateLimit(clientIp);
    }

    await assertRejects(
      () => assertLicenseReservationLookupRateLimit(clientIp),
      RateLimitError,
      "Too many requests",
    );
  } finally {
    await cleanupLicenseLookup(clientIp);
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_MAX");
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS");
  }
});

Deno.test("assertLicenseReservationLookupRateLimit budgets are independent per IP", async () => {
  const ipA = uniqueLookupIp();
  const ipB = uniqueLookupIp();
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_MAX", "1");
  Deno.env.set("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS", "60000");
  try {
    await assertLicenseReservationLookupRateLimit(ipA);

    await assertRejects(
      () => assertLicenseReservationLookupRateLimit(ipA),
      RateLimitError,
    );

    // A different IP's budget must be untouched by A's exhaustion.
    await assertLicenseReservationLookupRateLimit(ipB);
  } finally {
    await cleanupLicenseLookup(ipA);
    await cleanupLicenseLookup(ipB);
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_MAX");
    Deno.env.delete("RATE_LIMIT_LICENSE_LOOKUP_WINDOW_MS");
  }
});
