/**
 * Analytics query filters — scope lists become `IN` conditions.
 *
 * Kept separate from `analytics.query.ts` so these stay unit-testable: that
 * module imports the Supabase client, which requires env at import time.
 */

import { assertEquals } from "@std/assert";
import {
  analyticsScopeSelectsNothing,
  applyAnalyticsFilters,
} from "@shared/database/queries/analytics-filters.ts";

interface RecordedCall {
  method: string;
  // deno-lint-ignore no-explicit-any
  args: any[];
}

/** Minimal PostgREST-shaped builder that records the calls made on it. */
function stubQuery() {
  const calls: RecordedCall[] = [];
  const builder = {
    calls,
    // deno-lint-ignore no-explicit-any
    eq(...args: any[]) {
      calls.push({ method: "eq", args });
      return builder;
    },
    // deno-lint-ignore no-explicit-any
    in(...args: any[]) {
      calls.push({ method: "in", args });
      return builder;
    },
    // deno-lint-ignore no-explicit-any
    gte(...args: any[]) {
      calls.push({ method: "gte", args });
      return builder;
    },
    // deno-lint-ignore no-explicit-any
    lte(...args: any[]) {
      calls.push({ method: "lte", args });
      return builder;
    },
  };
  return builder;
}

Deno.test("scope list restricts clients with IN", () => {
  const q = stubQuery();

  applyAnalyticsFilters(q, { allowedClientIds: ["36", "37"] });

  assertEquals(q.calls, [{ method: "in", args: ["client_id", ["36", "37"]] }]);
});

Deno.test("scope list and explicit filter are both applied", () => {
  const q = stubQuery();

  applyAnalyticsFilters(q, { clientId: "36", allowedClientIds: ["36", "37"] });

  assertEquals(q.calls, [
    { method: "in", args: ["client_id", ["36", "37"]] },
    { method: "eq", args: ["client_id", "36"] },
  ]);
});

Deno.test("program scope restricts with IN", () => {
  const q = stubQuery();

  applyAnalyticsFilters(q, { allowedProgramIds: ["7"] });

  assertEquals(q.calls, [{ method: "in", args: ["program_id", ["7"]] }]);
});

Deno.test("unscoped filters add no IN conditions", () => {
  const q = stubQuery();

  applyAnalyticsFilters(q, { clientId: "36", programId: "7" });

  assertEquals(q.calls, [
    { method: "eq", args: ["client_id", "36"] },
    { method: "eq", args: ["program_id", "7"] },
  ]);
});

Deno.test("date bounds cover whole days in UTC", () => {
  const q = stubQuery();

  applyAnalyticsFilters(q, { dateFrom: "2026-01-01", dateTo: "2026-01-31" });

  assertEquals(q.calls, [
    { method: "gte", args: ["invited_at", "2026-01-01T00:00:00.000Z"] },
    { method: "lte", args: ["invited_at", "2026-01-31T23:59:59.999Z"] },
  ]);
});

Deno.test("an empty scope list selects nothing", () => {
  assertEquals(analyticsScopeSelectsNothing({ allowedClientIds: [] }), true);
  assertEquals(analyticsScopeSelectsNothing({ allowedProgramIds: [] }), true);
  assertEquals(analyticsScopeSelectsNothing({ allowedClientIds: ["36"] }), false);
  assertEquals(analyticsScopeSelectsNothing({}), false);
});
