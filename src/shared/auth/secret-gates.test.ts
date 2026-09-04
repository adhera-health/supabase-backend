/**
 * SEC-02 / SEC-03 / SEC-18 — shared-secret gates must fail closed in every
 * environment, and compare in constant time.
 *
 * Regression guard: both gates previously *allowed* the request when their secret
 * was unset and ENVIRONMENT was not "production", leaving a PII lookup and a batch
 * email trigger unauthenticated in dev and staging.
 */

import { assertEquals, assertRejects } from "@std/assert";
import type { Context } from "hono";
import { assertLicenseReservationSecret } from "@shared/auth/license-reservation-auth.ts";
import { assertCronAuth } from "@shared/auth/cron-auth.ts";
import { AppError, ForbiddenError, UnauthorizedError } from "@shared/utils/errors.ts";
import { timingSafeEqualStrings } from "@shared/utils/secret-compare.ts";

const SECRET = "test-secret-value";

/** Minimal Hono context — the gates only ever read request headers. */
function stubContext(headers: Record<string, string>): Context {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    req: { header: (name: string) => normalized.get(name.toLowerCase()) },
  } as unknown as Context;
}

/** Runs `body` with the given env vars applied, then restores all of them. */
async function withEnv(
  vars: Record<string, string | undefined>,
  body: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }

  try {
    await body();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
}

const GATES = [
  {
    name: "cron",
    secretVar: "CRON_SECRET",
    header: "x-cron-secret",
    assert: assertCronAuth,
  },
  {
    name: "license reservation",
    secretVar: "LICENSE_RESERVATION_SECRET",
    header: "x-license-reservation-secret",
    assert: assertLicenseReservationSecret,
  },
] as const;

for (const gate of GATES) {
  Deno.test(`${gate.name} gate rejects when secret is unconfigured, even in development`, async () => {
    await withEnv(
      { [gate.secretVar]: undefined, ENVIRONMENT: "development" },
      async () => {
        // A correct-looking header must not help: unconfigured means unavailable.
        await assertRejects(
          () => gate.assert(stubContext({ [gate.header]: SECRET })),
          AppError,
        );
      },
    );
  });

  Deno.test(`${gate.name} gate rejects a missing header`, async () => {
    await withEnv(
      { [gate.secretVar]: SECRET, ENVIRONMENT: "development" },
      async () => {
        await assertRejects(
          () => gate.assert(stubContext({})),
          UnauthorizedError,
        );
      },
    );
  });

  Deno.test(`${gate.name} gate rejects a wrong secret`, async () => {
    await withEnv(
      { [gate.secretVar]: SECRET, ENVIRONMENT: "development" },
      async () => {
        await assertRejects(
          () => gate.assert(stubContext({ [gate.header]: "wrong-secret" })),
          ForbiddenError,
        );
      },
    );
  });

  Deno.test(`${gate.name} gate accepts the configured secret`, async () => {
    await withEnv(
      { [gate.secretVar]: SECRET, ENVIRONMENT: "development" },
      async () => {
        await gate.assert(stubContext({ [gate.header]: SECRET }));
      },
    );
  });
}

Deno.test("cron gate accepts the secret via Authorization: Bearer", async () => {
  await withEnv(
    { CRON_SECRET: SECRET, ENVIRONMENT: "development" },
    async () => {
      await assertCronAuth(
        stubContext({ Authorization: `Bearer ${SECRET}` }),
      );
    },
  );
});

Deno.test("timingSafeEqualStrings matches only identical strings", async () => {
  assertEquals(await timingSafeEqualStrings(SECRET, SECRET), true);
  assertEquals(await timingSafeEqualStrings(SECRET, `${SECRET}x`), false);
  assertEquals(await timingSafeEqualStrings(SECRET, "x"), false);
  assertEquals(await timingSafeEqualStrings("", ""), true);
  assertEquals(await timingSafeEqualStrings("a", "b"), false);
});
