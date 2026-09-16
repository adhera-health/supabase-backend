/**
 * Client/program dropdowns must respect the actor's tenant scope.
 *
 * Regression guard: `GET /invitations/clients` and
 * `GET /invitations/clients/:clientId/programs` returned every Adhera Core
 * client and program regardless of scope. Sending was already blocked, but the
 * dropdowns still disclosed every client organisation's name.
 *
 * Adhera Core ids are numbers; scope stores them as strings, so comparisons
 * must normalise.
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  assertClientInScope,
  filterClientsInScope,
  filterProgramsInScope,
} from "@shared/services/client-scope.ts";
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

const clients = [
  { id: 36, name: "Hospital A" },
  { id: 37, name: "Hospital B" },
  { id: 99, name: "Hospital C" },
];

const programs = [
  { id: 7, name: "Cardio" },
  { id: 8, name: "Diabetes" },
];

Deno.test("unscoped actor sees every client", () => {
  assertEquals(filterClientsInScope(actor(null), clients), clients);
});

Deno.test("scoped actor sees only their clients", () => {
  assertEquals(filterClientsInScope(actor(["36", "37"]), clients), [
    { id: 36, name: "Hospital A" },
    { id: 37, name: "Hospital B" },
  ]);
});

Deno.test("actor scoped to no clients sees an empty dropdown", () => {
  assertEquals(filterClientsInScope(actor([]), clients), []);
});

Deno.test("unscoped actor may list programs for any client", () => {
  assertClientInScope(actor(null), 36);
});

Deno.test("scoped actor may list programs for their own client", () => {
  assertClientInScope(actor(["36"]), 36);
});

Deno.test("scoped actor cannot list programs for another client", () => {
  assertThrows(() => assertClientInScope(actor(["36"]), 99), ForbiddenError);
});

Deno.test("actor scoped to no clients cannot list any programs", () => {
  assertThrows(() => assertClientInScope(actor([]), 36), ForbiddenError);
});

Deno.test("unscoped actor sees every program", () => {
  assertEquals(filterProgramsInScope(actor(null), programs), programs);
});

Deno.test("program scope filters the program dropdown", () => {
  assertEquals(filterProgramsInScope(actor(null, ["7"]), programs), [
    { id: 7, name: "Cardio" },
  ]);
});

Deno.test("actor scoped to no programs sees an empty program dropdown", () => {
  assertEquals(filterProgramsInScope(actor(null, []), programs), []);
});
