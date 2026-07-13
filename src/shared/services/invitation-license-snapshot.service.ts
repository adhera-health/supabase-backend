/**
 * Resolves License Service payload fields at invitation send time.
 */

import type { InvitationLicenseSnapshot } from "@domain/license-snapshot.ts";
import { AppError } from "@shared/utils/errors.ts";

function parsePositiveInt(value: string | undefined, label: string): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`Invalid ${label}: must be a positive integer`, {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }
  return parsed;
}

function resolveFromEnv(): InvitationLicenseSnapshot | null {
  const licenseClientId = parsePositiveInt(Deno.env.get("LICENSE_CLIENT_ID"), "LICENSE_CLIENT_ID");
  const licenseProgramId = parsePositiveInt(
    Deno.env.get("LICENSE_PROGRAM_ID"),
    "LICENSE_PROGRAM_ID",
  );
  const coreApiHost = Deno.env.get("LICENSE_CORE_API_HOST")?.trim() ?? null;

  if (licenseClientId === null || licenseProgramId === null || !coreApiHost) {
    return null;
  }

  return {
    license_client_id: licenseClientId,
    license_program_id: licenseProgramId,
    core_api_host: coreApiHost,
  };
}

function resolveDevAdminMapping(
  clientId: string,
  programId: string,
): InvitationLicenseSnapshot | null {
  const envClientId = Deno.env.get("DEV_ADMIN_CLIENT_ID")?.trim();
  const envProgramId = Deno.env.get("DEV_ADMIN_PROGRAM_ID")?.trim();
  if (!envClientId || !envProgramId) return null;
  if (clientId !== envClientId || programId !== envProgramId) return null;

  const licenseClientId = parsePositiveInt(
    Deno.env.get("DEV_ADMIN_LICENSE_CLIENT_ID"),
    "DEV_ADMIN_LICENSE_CLIENT_ID",
  );
  const licenseProgramId = parsePositiveInt(
    Deno.env.get("DEV_ADMIN_LICENSE_PROGRAM_ID"),
    "DEV_ADMIN_LICENSE_PROGRAM_ID",
  );
  const coreApiHost = Deno.env.get("LICENSE_CORE_API_HOST")?.trim() ?? null;

  if (licenseClientId === null || licenseProgramId === null || !coreApiHost) {
    return null;
  }

  return {
    license_client_id: licenseClientId,
    license_program_id: licenseProgramId,
    core_api_host: coreApiHost,
  };
}

export async function resolveInvitationLicenseSnapshot(
  clientId: string,
  programId: string,
): Promise<InvitationLicenseSnapshot> {
  const fromEnv = resolveFromEnv();
  if (fromEnv) return fromEnv;

  if (Deno.env.get("ENVIRONMENT") !== "production") {
    const devSnapshot = resolveDevAdminMapping(clientId, programId);
    if (devSnapshot) return devSnapshot;

    const envClientId = Deno.env.get("DEV_ADMIN_CLIENT_ID")?.trim();
    const envProgramId = Deno.env.get("DEV_ADMIN_PROGRAM_ID")?.trim();
    if (envClientId === clientId && envProgramId === programId) {
      return {
        license_client_id: parsePositiveInt(
          Deno.env.get("DEV_ADMIN_LICENSE_CLIENT_ID"),
          "DEV_ADMIN_LICENSE_CLIENT_ID",
        ) ?? 1,
        license_program_id: parsePositiveInt(
          Deno.env.get("DEV_ADMIN_LICENSE_PROGRAM_ID"),
          "DEV_ADMIN_LICENSE_PROGRAM_ID",
        ) ?? 1,
        core_api_host: Deno.env.get("LICENSE_CORE_API_HOST")?.trim() ?? "https://dev-stub.local",
      };
    }
  }

  throw new AppError(
    "License snapshot is not configured for this client and program. Set LICENSE_CLIENT_ID, LICENSE_PROGRAM_ID, and LICENSE_CORE_API_HOST.",
    {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    },
  );
}
