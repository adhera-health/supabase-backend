/**
 * SEC-09 — ENVIRONMENT must fail closed to production on anything unrecognised.
 */

import { assertEquals } from "@std/assert";
import {
  getAppEnvironment,
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from "@shared/utils/environment.ts";

/** Runs `body` with ENVIRONMENT set to `value` (undefined = unset), then restores. */
function withEnvironment(value: string | undefined, body: () => void): void {
  const previous = Deno.env.get("ENVIRONMENT");

  try {
    if (value === undefined) {
      Deno.env.delete("ENVIRONMENT");
    } else {
      Deno.env.set("ENVIRONMENT", value);
    }
    body();
  } finally {
    if (previous === undefined) {
      Deno.env.delete("ENVIRONMENT");
    } else {
      Deno.env.set("ENVIRONMENT", previous);
    }
  }
}

Deno.test("recognised environments resolve to themselves", () => {
  for (const value of ["development", "test", "staging", "production"]) {
    withEnvironment(value, () => {
      assertEquals(getAppEnvironment(), value);
    });
  }
});

Deno.test("unset ENVIRONMENT fails closed to production", () => {
  withEnvironment(undefined, () => {
    assertEquals(getAppEnvironment(), "production");
    assertEquals(isProductionEnvironment(), true);
    assertEquals(isDevelopmentEnvironment(), false);
  });
});

Deno.test("misspelled ENVIRONMENT fails closed to production", () => {
  for (const value of ["dev", "prod", "developement", "PRODUCTON", " "]) {
    withEnvironment(value, () => {
      assertEquals(isProductionEnvironment(), true, `expected fail-closed for "${value}"`);
    });
  }
});

Deno.test("ENVIRONMENT is trimmed and case-insensitive", () => {
  withEnvironment("  Development  ", () => {
    assertEquals(getAppEnvironment(), "development");
    assertEquals(isDevelopmentEnvironment(), true);
  });
});

Deno.test("isDevelopmentEnvironment is true only for explicit development", () => {
  withEnvironment("staging", () => {
    assertEquals(isDevelopmentEnvironment(), false);
    assertEquals(isProductionEnvironment(), false);
  });
});
