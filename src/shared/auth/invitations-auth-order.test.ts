/**
 * Staff handlers must authenticate before reading the request body.
 *
 * Audit finding F1 (docs/staff-route-audit.md): `POST /invitations/send`,
 * `/:invitation_id/resend` and `/:invitation_id/drop-out` parsed and validated
 * the body first, so an unauthenticated caller got 400 schema errors instead of
 * 401 and spent server-side parsing on an unauthenticated request.
 *
 * The handlers can't be imported here (the function entrypoint pulls in the
 * database client, which requires Supabase env at module load), so this scans
 * the source, like `secret-gate-call-sites.test.ts` does for awaited gates.
 */

import { assertEquals } from "@std/assert";

const INVITATIONS_FUNCTION = new URL(
  "../../../supabase/functions/invitations/index.ts",
  import.meta.url,
);

const AUTH_CALL = /\b(requirePermission|requireAnyPermission)\s*\(/;
const BODY_READ = /\bc\.req\.json\s*\(/;

/** Splits the module into `async function handleX(...) { ... }` blocks. */
function handlerBlocks(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/async function (handle\w+)\s*\(/g)];

  return starts.map((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? starts[index + 1].index ?? source.length : source.length;
    return { name: match[1], body: source.slice(from, to) };
  });
}

Deno.test("invitations handlers authenticate before reading the body", async () => {
  const source = await Deno.readTextFile(INVITATIONS_FUNCTION);
  const violations: string[] = [];

  for (const handler of handlerBlocks(source)) {
    const auth = handler.body.search(AUTH_CALL);
    const body = handler.body.search(BODY_READ);

    // Only handlers that do both are relevant; public routes read no body,
    // and guarded routes without a body are fine either way.
    if (auth >= 0 && body >= 0 && body < auth) {
      violations.push(`${handler.name} reads the request body before authenticating`);
    }
  }

  assertEquals(violations, []);
});
