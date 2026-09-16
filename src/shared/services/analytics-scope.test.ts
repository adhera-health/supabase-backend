/**
 * Analytics tenant scope — a scoped actor must never see other clients' data.
 *
 * Regression guard: `assertAdminListFiltersAllowed` only validated the filters a
 * caller *asked* for, so a scoped actor who requested no `client_id` got totals
 * across every tenant. Scope must also be applied when no filter is given.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { buildAnalyticsQueryFilters } from "@shared/services/analytics-scope.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";

function actor(
  clientIds: string[] | null,
  programIds: string[] | null = null,
): AuthenticatedUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "staff@example.com",
    role: clientIds === null ? "admin" : "recruiter",
    clientIds,
    programIds,
  };
}

Deno.test("unscoped actor keeps full visibility", () => {
  const filters = buildAnalyticsQueryFilters(actor(null), {});

  assertEquals(filters.allowedClientIds, undefined);
  assertEquals(filters.allowedProgramIds, undefined);
  assertEquals(filters.clientId, undefined);
  assertEquals(filters.programId, undefined);
});

Deno.test("scoped actor without a filter is restricted to their clients", () => {
  const filters = buildAnalyticsQueryFilters(actor(["36", "37"]), {});

  assertEquals(filters.allowedClientIds, ["36", "37"]);
  assertEquals(filters.clientId, undefined);
});

Deno.test("scoped actor may filter within their own scope", () => {
  const filters = buildAnalyticsQueryFilters(actor(["36", "37"]), {
    client_id: "36",
  });

  assertEquals(filters.clientId, "36");
  assertEquals(filters.allowedClientIds, ["36", "37"]);
});

Deno.test("scoped actor cannot filter by another client", () => {
  assertThrows(
    () => buildAnalyticsQueryFilters(actor(["36"]), { client_id: "99" }),
    ForbiddenError,
  );
});

Deno.test("scoped actor cannot filter by another program", () => {
  assertThrows(
    () => buildAnalyticsQueryFilters(actor(null, ["7"]), { program_id: "8" }),
    ForbiddenError,
  );
});

Deno.test("actor scoped to no clients sees nothing", () => {
  const filters = buildAnalyticsQueryFilters(actor([]), {});

  assertEquals(filters.allowedClientIds, []);
});

Deno.test("program scope restricts without a filter", () => {
  const filters = buildAnalyticsQueryFilters(actor(null, ["7"]), {});

  assertEquals(filters.allowedProgramIds, ["7"]);
});

Deno.test("date bounds pass through untouched", () => {
  const filters = buildAnalyticsQueryFilters(actor(null), {
    date_from: "2026-01-01",
    date_to: "2026-01-31",
  });

  assertEquals(filters.dateFrom, "2026-01-01");
  assertEquals(filters.dateTo, "2026-01-31");
});
