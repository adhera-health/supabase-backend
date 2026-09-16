/**
 * Reminder log listing carries the actor's tenant scope into the query.
 *
 * `GET /reminders/logs` takes no client filter, so scope is the only thing
 * keeping one tenant's patient emails away from another tenant's staff.
 */

import { assertEquals } from "@std/assert";
import { buildReminderLogFilters } from "@shared/services/reminder-log-scope.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";

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

const input = { page: 2, per_page: 50 };

Deno.test("unscoped actor keeps full visibility", () => {
  const filters = buildReminderLogFilters(actor(null), input);

  assertEquals(filters.allowedClientIds, undefined);
  assertEquals(filters.allowedProgramIds, undefined);
});

Deno.test("scoped actor is restricted to their clients", () => {
  const filters = buildReminderLogFilters(actor(["36", "37"]), input);

  assertEquals(filters.allowedClientIds, ["36", "37"]);
});

Deno.test("actor scoped to no clients sees nothing", () => {
  const filters = buildReminderLogFilters(actor([]), input);

  assertEquals(filters.allowedClientIds, []);
});

Deno.test("program scope is carried through", () => {
  const filters = buildReminderLogFilters(actor(null, ["7"]), input);

  assertEquals(filters.allowedProgramIds, ["7"]);
});

Deno.test("paging and invitation filter pass through", () => {
  const filters = buildReminderLogFilters(actor(["36"]), {
    ...input,
    invitation_id: "11111111-1111-4111-8111-111111111111",
  });

  assertEquals(filters.page, 2);
  assertEquals(filters.perPage, 50);
  assertEquals(filters.invitationUuid, "11111111-1111-4111-8111-111111111111");
});
