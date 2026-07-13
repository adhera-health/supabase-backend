/**
 * Adhera Core (Client/Program) API configuration from environment.
 */

import { AppError } from "@shared/utils/errors.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ACTIVE_CLIENTS_PATH = "/api/v1/active-clients";
/** `{clientId}` is replaced with the path param when calling the Program API. */
const DEFAULT_CLIENT_PROGRAMS_PATH_TEMPLATE = "/api/v1/clients/{clientId}/programs";

function requireBaseUrl(): string {
  const value = Deno.env.get("ADHERA_CORE_BASE_URL")?.trim();
  if (!value) {
    throw new AppError(
      "Missing required environment variable: ADHERA_CORE_BASE_URL",
      { statusCode: 500, code: "INTERNAL_ERROR" },
    );
  }
  return value.replace(/\/+$/, "");
}

function parseTimeoutMs(): number {
  const raw = Deno.env.get("ADHERA_CORE_TIMEOUT_MS")?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

export interface AdheraCoreConfig {
  baseUrl: string;
  timeoutMs: number;
  /** Path for active clients list (env-overridable until client docs finalize). */
  activeClientsPath: string;
  /**
   * Path template for programs of a client.
   * Must include `{clientId}` placeholder (env-overridable until client docs finalize).
   */
  clientProgramsPathTemplate: string;
}

function normalizePath(path: string): string {
  return path.replace(/^\/*/, "/");
}

/** Builds the external programs path for a given client id. */
export function buildClientProgramsPath(clientId: number): string {
  const template = (Deno.env.get("ADHERA_CORE_CLIENT_PROGRAMS_PATH_TEMPLATE")?.trim() ||
    DEFAULT_CLIENT_PROGRAMS_PATH_TEMPLATE);

  if (!template.includes("{clientId}")) {
    throw new AppError(
      "ADHERA_CORE_CLIENT_PROGRAMS_PATH_TEMPLATE must include {clientId}",
      { statusCode: 500, code: "INTERNAL_ERROR" },
    );
  }

  return normalizePath(template.replaceAll("{clientId}", String(clientId)));
}

export function getAdheraCoreConfig(): AdheraCoreConfig {
  return {
    baseUrl: requireBaseUrl(),
    timeoutMs: parseTimeoutMs(),
    activeClientsPath: normalizePath(
      Deno.env.get("ADHERA_CORE_ACTIVE_CLIENTS_PATH")?.trim() ||
        DEFAULT_ACTIVE_CLIENTS_PATH,
    ),
    clientProgramsPathTemplate: normalizePath(
      Deno.env.get("ADHERA_CORE_CLIENT_PROGRAMS_PATH_TEMPLATE")?.trim() ||
        DEFAULT_CLIENT_PROGRAMS_PATH_TEMPLATE,
    ),
  };
}
