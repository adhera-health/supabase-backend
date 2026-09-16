/**
 * Reminder log filters — tenant scope becomes an `IN` on the joined invitation.
 *
 * Regression guard: `GET /reminders/logs` applied no scope at all, so any staff
 * actor could read every tenant's reminder history, patient emails included.
 *
 * Kept separate from `reminder.query.ts` so these stay unit-testable: that
 * module imports the Supabase client, which requires env at import time.
 */

import { assertEquals } from "@std/assert";
import {
  applyReminderLogFilters,
  reminderLogScopeSelectsNothing,
} from "@shared/database/queries/reminder-log-filters.ts";

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
  };
  return builder;
}

const paging = { page: 1, perPage: 20 };

Deno.test("client scope restricts logs through the joined invitation", () => {
  const q = stubQuery();

  applyReminderLogFilters(q, { ...paging, allowedClientIds: ["36", "37"] });

  assertEquals(q.calls, [
    { method: "in", args: ["patient_invitations.client_id", ["36", "37"]] },
  ]);
});

Deno.test("program scope restricts logs through the joined invitation", () => {
  const q = stubQuery();

  applyReminderLogFilters(q, { ...paging, allowedProgramIds: ["7"] });

  assertEquals(q.calls, [
    { method: "in", args: ["patient_invitations.program_id", ["7"]] },
  ]);
});

Deno.test("scope applies alongside an invitation filter", () => {
  const q = stubQuery();

  applyReminderLogFilters(q, {
    ...paging,
    invitationUuid: "11111111-1111-4111-8111-111111111111",
    allowedClientIds: ["36"],
  });

  assertEquals(q.calls, [
    { method: "in", args: ["patient_invitations.client_id", ["36"]] },
    {
      method: "eq",
      args: ["patient_invitations.uuid", "11111111-1111-4111-8111-111111111111"],
    },
  ]);
});

Deno.test("unscoped actor filtering by invitation adds no IN conditions", () => {
  const q = stubQuery();

  applyReminderLogFilters(q, {
    ...paging,
    invitationUuid: "11111111-1111-4111-8111-111111111111",
  });

  assertEquals(q.calls, [
    {
      method: "eq",
      args: ["patient_invitations.uuid", "11111111-1111-4111-8111-111111111111"],
    },
  ]);
});

Deno.test("an empty scope list selects nothing", () => {
  assertEquals(
    reminderLogScopeSelectsNothing({ ...paging, allowedClientIds: [] }),
    true,
  );
  assertEquals(
    reminderLogScopeSelectsNothing({ ...paging, allowedProgramIds: [] }),
    true,
  );
  assertEquals(
    reminderLogScopeSelectsNothing({ ...paging, allowedClientIds: ["36"] }),
    false,
  );
  assertEquals(reminderLogScopeSelectsNothing(paging), false);
});
