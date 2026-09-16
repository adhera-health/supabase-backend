/**
 * SEC-02 / SEC-03 — shared-secret gates must be awaited at every call site.
 *
 * Regression guard: both gates became async (constant-time comparison), and the
 * rate-limits-cleanup handler kept calling `assertCronAuth` without `await`. A
 * failed check then surfaced as an unhandled rejection while the handler kept
 * running, so the gate no longer stopped the cleanup run.
 *
 * The handlers can't be imported here (every function entrypoint pulls in the
 * database client, which requires Supabase env at module load), so this scans
 * the function sources instead.
 */

import { assertEquals } from "@std/assert";

/** Async gates that only protect a route when their rejection is awaited. */
const ASYNC_GATES = ["assertCronAuth", "assertLicenseReservationSecret"] as const;

const FUNCTIONS_DIR = new URL("../../../supabase/functions/", import.meta.url);

const UNAWAITED_GATE_CALL = new RegExp(
  `(?<!\\bawait\\s+)\\b(${ASYNC_GATES.join("|")})\\s*\\(`,
);

async function collectTypeScriptFiles(dir: URL): Promise<URL[]> {
  const files: URL[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const entryUrl = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, dir);

    if (entry.isDirectory) {
      files.push(...await collectTypeScriptFiles(entryUrl));
    } else if (entry.name.endsWith(".ts")) {
      files.push(entryUrl);
    }
  }

  return files;
}

Deno.test("every async secret gate call in supabase/functions is awaited", async () => {
  const violations: string[] = [];

  for (const file of await collectTypeScriptFiles(FUNCTIONS_DIR)) {
    const lines = (await Deno.readTextFile(file)).split("\n");

    lines.forEach((line, index) => {
      const match = UNAWAITED_GATE_CALL.exec(line);
      if (match) {
        const relativePath = file.pathname.slice(FUNCTIONS_DIR.pathname.length);
        violations.push(`${relativePath}:${index + 1} ${match[1]}(...) is not awaited`);
      }
    });
  }

  assertEquals(violations, []);
});
