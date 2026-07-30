/**
 * Application environment resolution (SEC-09).
 *
 * Security controls branch on the environment — CORS allowlist enforcement, the
 * shared-secret gates, and dev-only credential logging. An unset or misspelled
 * ENVIRONMENT must therefore never silently downgrade them, so anything outside
 * APP_ENVIRONMENTS resolves to `production`: the most restrictive mode. Each
 * unrecognised value is warned about once per isolate.
 *
 * Deliberately does not import the logger — logger.ts reads this module to pick
 * its minimum level, so importing it back would be circular.
 */

export const APP_ENVIRONMENTS = [
  "development",
  "test",
  "staging",
  "production",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Most restrictive mode — used whenever ENVIRONMENT is unset or unrecognised. */
const FAIL_CLOSED_ENVIRONMENT: AppEnvironment = "production";

/** Values already warned about, so a bad config logs once rather than per request. */
const warnedValues = new Set<string>();

function isAppEnvironment(value: string): value is AppEnvironment {
  return (APP_ENVIRONMENTS as readonly string[]).includes(value);
}

function warnOnce(rawValue: string, message: string): void {
  if (warnedValues.has(rawValue)) return;
  warnedValues.add(rawValue);

  // Pre-formatted JSON to match logger.ts output without importing it.
  console.warn(JSON.stringify({
    level: "warn",
    message,
    service: "environment",
    timestamp: new Date().toISOString(),
    context: {
      raw_value: rawValue,
      resolved_environment: FAIL_CLOSED_ENVIRONMENT,
      allowed_values: APP_ENVIRONMENTS,
    },
  }));
}

/**
 * Resolves the current environment, failing closed to `production`.
 * Read on each call (not cached) so tests can vary ENVIRONMENT.
 */
export function getAppEnvironment(): AppEnvironment {
  const raw = Deno.env.get("ENVIRONMENT")?.trim().toLowerCase();

  if (!raw) {
    warnOnce(
      "",
      "ENVIRONMENT is not set — resolving to production so security controls fail closed",
    );
    return FAIL_CLOSED_ENVIRONMENT;
  }

  if (!isAppEnvironment(raw)) {
    warnOnce(
      raw,
      "ENVIRONMENT is not a recognised value — resolving to production so security controls fail closed",
    );
    return FAIL_CLOSED_ENVIRONMENT;
  }

  return raw;
}

/** True in production, and in any environment we could not positively identify. */
export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === "production";
}

/** True only when ENVIRONMENT is explicitly `development`. Gates dev-only logging. */
export function isDevelopmentEnvironment(): boolean {
  return getAppEnvironment() === "development";
}
