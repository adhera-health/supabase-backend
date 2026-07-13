/**
 * Builds outbound auth headers for Adhera Core external APIs (env-driven).
 */

import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("adhera-core-auth");

export function buildAdheraCoreAuthHeaders(): Record<string, string> {
  const mode = (Deno.env.get("ADHERA_CORE_AUTH_MODE")?.trim() || "none").toLowerCase();

  if (mode === "none") {
    return {};
  }

  if (mode === "bearer") {
    const token = Deno.env.get("ADHERA_CORE_API_TOKEN")?.trim();
    if (!token) {
      logger.warn("ADHERA_CORE_AUTH_MODE=bearer but ADHERA_CORE_API_TOKEN is empty");
      return {};
    }
    return { Authorization: `Bearer ${token}` };
  }

  if (mode === "api_key_header") {
    const key = Deno.env.get("ADHERA_CORE_API_KEY")?.trim();
    const headerName =
      Deno.env.get("ADHERA_CORE_API_KEY_HEADER")?.trim() || "X-Api-Key";
    if (!key) {
      logger.warn("ADHERA_CORE_AUTH_MODE=api_key_header but ADHERA_CORE_API_KEY is empty");
      return {};
    }
    return { [headerName]: key };
  }

  logger.warn("Unknown ADHERA_CORE_AUTH_MODE; sending no auth headers", { mode });
  return {};
}
