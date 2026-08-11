/**
 * Integration tests against a real local Supabase Postgres instance
 * (`supabase start`). Named exports can't be mocked in Deno — module
 * namespace properties are non-configurable — and this repo has no
 * existing convention for faking the Supabase client, so these tests
 * exercise the actual acquire_rate_limit_bucket RPC. That's also what
 * caught the real bugs this suite guards against: a missing `await` at
 * call sites silently no-ops the check, and the RPC itself had an
 * insert race plus an ambiguous column reference that broke every call
 * past the first in a window.
 *
 * Run with: deno test --env-file=.env --allow-env --allow-net src/shared/utils/rate-limit.test.ts
 */

import { assertEquals, assertRejects } from "@std/assert";
import { assertRateLimit } from "@shared/utils/rate-limit.ts";
import { RateLimitError } from "@shared/utils/errors.ts";
import { getServiceClient } from "@shared/database/client.ts";

function uniqueKey(label: string): string {
  return `test:${label}:${crypto.randomUUID()}`;
}

async function cleanupKey(key: string): Promise<void> {
  await getServiceClient().from("rate_limits").delete().eq("key", key);
}

Deno.test("assertRateLimit allows requests up to the configured max", async () => {
  const key = uniqueKey("allow");
  try {
    for (let i = 0; i < 3; i++) {
      await assertRateLimit({ key, max: 3, windowMs: 60_000 });
    }
  } finally {
    await cleanupKey(key);
  }
});

Deno.test("assertRateLimit rejects with RateLimitError once the max is exceeded", async () => {
  const key = uniqueKey("reject");
  try {
    for (let i = 0; i < 3; i++) {
      await assertRateLimit({ key, max: 3, windowMs: 60_000 });
    }

    await assertRejects(
      () => assertRateLimit({ key, max: 3, windowMs: 60_000 }),
      RateLimitError,
      "Too many requests",
    );
  } finally {
    await cleanupKey(key);
  }
});

/**
 * Fixed-window buckets are aligned to absolute wall-clock time, not to the
 * first call, so two back-to-back calls can straddle a window boundary by
 * pure chance. Wait until we're safely inside a fresh window before firing
 * the "same window" assertions, so the test is deterministic rather than
 * occasionally flaky depending on when it happens to run.
 */
async function waitForFreshWindow(windowMs: number): Promise<void> {
  while (Date.now() % windowMs > windowMs * 0.2) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

Deno.test("assertRateLimit resets the count once the window rolls over", async () => {
  const key = uniqueKey("rollover");
  const windowMs = 300;
  try {
    await waitForFreshWindow(windowMs);
    await assertRateLimit({ key, max: 1, windowMs });

    await assertRejects(
      () => assertRateLimit({ key, max: 1, windowMs }),
      RateLimitError,
    );

    await new Promise((resolve) => setTimeout(resolve, windowMs + 100));

    await assertRateLimit({ key, max: 1, windowMs });
  } finally {
    await cleanupKey(key);
  }
});

Deno.test("assertRateLimit stays correct under concurrent calls to a brand-new key", async () => {
  const key = uniqueKey("concurrent");
  try {
    const results = await Promise.allSettled(
      Array.from(
        { length: 5 },
        () => assertRateLimit({ key, max: 3, windowMs: 60_000 }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");

    assertEquals(fulfilled, 3);
    assertEquals(rejected.length, 2);
    for (const r of rejected) {
      assertEquals(
        r.status === "rejected" && r.reason instanceof RateLimitError,
        true,
      );
    }
  } finally {
    await cleanupKey(key);
  }
});

Deno.test("assertRateLimit returns a genuine Promise that must be awaited to observe rejection", async () => {
  const key = uniqueKey("must-await");
  try {
    await assertRateLimit({ key, max: 1, windowMs: 60_000 });

    const result = assertRateLimit({ key, max: 1, windowMs: 60_000 });
    assertEquals(result instanceof Promise, true);
    await assertRejects(() => result, RateLimitError);
  } finally {
    await cleanupKey(key);
  }
});
