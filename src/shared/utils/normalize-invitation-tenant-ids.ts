/**
 * Maps invitation send tenant ids to UUIDs for DB storage and optional license snapshot.
 */

import type { InvitationLicenseSnapshot } from "@domain/license-snapshot.ts";
import type { TenantIdInput } from "@domain/tenant-id.ts";
import { BadRequestError } from "@shared/utils/errors.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NormalizedInvitationTenantIds {
  client_id: string;
  program_id: string;
  licenseSnapshot?: InvitationLicenseSnapshot;
}

interface ExternalTenantMapEntry {
  external_client_id: number;
  external_program_id: number;
  client_id: string;
  program_id: string;
  license_client_id?: number;
  license_program_id?: number;
  core_api_host?: string;
}

function isIntegerTenantId(value: TenantIdInput): value is number {
  return typeof value === "number";
}

function parseExternalTenantMap(): ExternalTenantMapEntry[] {
  const raw = Deno.env.get("INVITATION_EXTERNAL_TENANT_MAP")?.trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExternalTenantMapEntry[];
  } catch {
    return [];
  }
}

function requireCoreApiHost(): string {
  const host = Deno.env.get("LICENSE_CORE_API_HOST")?.trim();
  if (!host) {
    throw new BadRequestError(
      "LICENSE_CORE_API_HOST is required when using integer client_id and program_id.",
    );
  }
  return host;
}

function devAdminTenantUuids(): { client_id: string; program_id: string } | null {
  const client_id = Deno.env.get("DEV_ADMIN_CLIENT_ID")?.trim();
  const program_id = Deno.env.get("DEV_ADMIN_PROGRAM_ID")?.trim();
  if (!client_id || !program_id) return null;
  return { client_id, program_id };
}

function parseEnvPositiveInt(name: string): number | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveDevTenantFromLicensePair(
  licenseClientId: number,
  licenseProgramId: number,
): NormalizedInvitationTenantIds | null {
  const devLicenseClient = parseEnvPositiveInt("DEV_ADMIN_LICENSE_CLIENT_ID");
  const devLicenseProgram = parseEnvPositiveInt("DEV_ADMIN_LICENSE_PROGRAM_ID");
  if (devLicenseClient === null || devLicenseProgram === null) return null;
  if (licenseClientId !== devLicenseClient || licenseProgramId !== devLicenseProgram) {
    return null;
  }

  const tenant = devAdminTenantUuids();
  if (!tenant) return null;

  return {
    ...tenant,
    licenseSnapshot: {
      license_client_id: devLicenseClient,
      license_program_id: devLicenseProgram,
      core_api_host: requireCoreApiHost(),
    },
  };
}

function resolveFromExternalMap(
  externalClientId: number,
  externalProgramId: number,
): NormalizedInvitationTenantIds | null {
  const mapEntry = parseExternalTenantMap().find(
    (entry) =>
      entry.external_client_id === externalClientId &&
      entry.external_program_id === externalProgramId,
  );

  if (!mapEntry) return null;

  return {
    client_id: mapEntry.client_id,
    program_id: mapEntry.program_id,
    licenseSnapshot: {
      license_client_id: mapEntry.license_client_id ?? externalClientId,
      license_program_id: mapEntry.license_program_id ?? externalProgramId,
      core_api_host: mapEntry.core_api_host ?? requireCoreApiHost(),
    },
  };
}

function resolveFromLicenseEnv(
  externalClientId: number,
  externalProgramId: number,
): NormalizedInvitationTenantIds | null {
  const licenseClientId = parseEnvPositiveInt("LICENSE_CLIENT_ID");
  const licenseProgramId = parseEnvPositiveInt("LICENSE_PROGRAM_ID");
  if (licenseClientId === null || licenseProgramId === null) return null;
  if (licenseClientId !== externalClientId || licenseProgramId !== externalProgramId) {
    return null;
  }

  const tenant = devAdminTenantUuids();
  if (!tenant) return null;

  return {
    ...tenant,
    licenseSnapshot: {
      license_client_id: licenseClientId,
      license_program_id: licenseProgramId,
      core_api_host: requireCoreApiHost(),
    },
  };
}

function resolveIntegerTenantIds(
  externalClientId: number,
  externalProgramId: number,
): NormalizedInvitationTenantIds {
  const fromMap = resolveFromExternalMap(externalClientId, externalProgramId);
  if (fromMap) return fromMap;

  const fromDevLicense = resolveDevTenantFromLicensePair(externalClientId, externalProgramId);
  if (fromDevLicense) return fromDevLicense;

  const fromLicenseEnv = resolveFromLicenseEnv(externalClientId, externalProgramId);
  if (fromLicenseEnv) return fromLicenseEnv;

  throw new BadRequestError(
    "No tenant mapping for this client/program id pair. Use UUID tenant ids or configure INVITATION_EXTERNAL_TENANT_MAP.",
  );
}

export function normalizeInvitationTenantIds(
  clientId: TenantIdInput,
  programId: TenantIdInput,
): NormalizedInvitationTenantIds {
  const clientIsInt = isIntegerTenantId(clientId);
  const programIsInt = isIntegerTenantId(programId);

  if (clientIsInt !== programIsInt) {
    throw new BadRequestError(
      "client_id and program_id must both be UUIDs or both be positive integers.",
    );
  }

  if (!clientIsInt) {
    const clientUuid = clientId as string;
    const programUuid = programId as string;
    if (!UUID_PATTERN.test(clientUuid) || !UUID_PATTERN.test(programUuid)) {
      throw new BadRequestError("client_id and program_id must be valid UUIDs.");
    }
    return { client_id: clientUuid, program_id: programUuid };
  }

  return resolveIntegerTenantIds(clientId, programId as number);
}
