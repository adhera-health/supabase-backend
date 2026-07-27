/**
 * Resolves invitation tenant ids for DB storage + license snapshot.
 *
 * Clients/programs live only in Adhera Core (integer ids); there is no internal
 * list to seed. So an integer id deterministically DERIVES its internal tenant
 * UUID — the integer fully determines the UUID, with no lookup, env map, or seed
 * data. The same integer always yields the same UUID, so invitations, consent
 * documents, and onboarding all line up. UUID inputs (echoed back by the patient
 * app from a stored invitation) pass through unchanged.
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

// Distinct namespaces so client N and program N never derive the same UUID.
const CLIENT_NAMESPACE = "00000001";
const PROGRAM_NAMESPACE = "00000002";

function isIntegerTenantId(value: TenantIdInput): value is number {
  return typeof value === "number";
}

/**
 * Deterministic UUID for an Adhera Core integer id.
 * Format: `<namespace>-0000-4000-8000-<id as 48-bit hex>` — a valid UUID
 * (version nibble 4, variant nibble 8) that encodes the id reversibly.
 */
function toTenantUuid(namespace: string, id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("client_id and program_id must be positive integers.");
  }
  const hex = id.toString(16);
  if (hex.length > 12) {
    throw new BadRequestError("client_id/program_id is too large.");
  }
  return `${namespace}-0000-4000-8000-${hex.padStart(12, "0")}`;
}

function resolveCoreApiHost(): string {
  const host = Deno.env.get("LICENSE_CORE_API_HOST")?.trim() ||
    Deno.env.get("ADHERA_CORE_BASE_URL")?.trim();
  if (!host) {
    throw new BadRequestError(
      "Set ADHERA_CORE_BASE_URL (or LICENSE_CORE_API_HOST) to send invitations.",
    );
  }
  return host;
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

  // UUID pass-through (patient-app / resumed flows echoing stored ids).
  if (!clientIsInt) {
    const clientUuid = clientId as string;
    const programUuid = programId as string;
    if (!UUID_PATTERN.test(clientUuid) || !UUID_PATTERN.test(programUuid)) {
      throw new BadRequestError("client_id and program_id must be valid UUIDs.");
    }
    return { client_id: clientUuid, program_id: programUuid };
  }

  // Integer path: derive UUIDs + license snapshot straight from the ids.
  const clientInt = clientId as number;
  const programInt = programId as number;

  return {
    client_id: toTenantUuid(CLIENT_NAMESPACE, clientInt),
    program_id: toTenantUuid(PROGRAM_NAMESPACE, programInt),
    licenseSnapshot: {
      license_client_id: clientInt,
      license_program_id: programInt,
      core_api_host: resolveCoreApiHost(),
    },
  };
}
