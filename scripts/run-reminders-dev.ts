/**
 * Local dev runner for onboarding reminder engine (Phase 1 Step C).
 *
 * Usage:
 *   deno task run:reminders
 *   deno task run:reminders -- --as-of=2026-06-22T12:00:00.000Z
 *   deno task run:reminders -- --invitation-uuid=<uuid>
 *
 * Requires: supabase start, .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Tip: backdate invited_at in SQL to simulate +2h/+48h without waiting:
 *   UPDATE patient_invitations SET invited_at = now() - interval '3 hours' WHERE uuid = '<uuid>';
 */

import { runDueOnboardingReminders } from "@shared/services/reminder.service.ts";

function parseArgs(argv: string[]): {
  asOf?: Date;
  invitationUuid?: string;
} {
  let asOf: Date | undefined;
  let invitationUuid: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--as-of=")) {
      const value = arg.slice("--as-of=".length).trim();
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        console.error(`Invalid --as-of value: ${value}`);
        Deno.exit(1);
      }
      asOf = parsed;
      continue;
    }

    if (arg.startsWith("--invitation-uuid=")) {
      invitationUuid = arg.slice("--invitation-uuid=".length).trim();
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: deno task run:reminders [-- --as-of=ISO] [--invitation-uuid=UUID]`);
      Deno.exit(0);
    }
  }

  return { asOf, invitationUuid };
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env or pass --env-file=.env`);
    Deno.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const { asOf, invitationUuid } = parseArgs(Deno.args);

  const summary = await runDueOnboardingReminders({
    asOf,
    invitationUuid,
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
