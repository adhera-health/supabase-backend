/**
 * Resolves invitation tenant ids for DB storage + license snapshot.
 *
 * Clients/programs live only in Adhera Core and are identified by integers. The
 * integer IS the tenant identity — it is stored verbatim as its string form
 * ("36"), with no internal UUID and no mapping. The license snapshot is built
 * directly from the integers. String inputs (already-normalized ids echoed back)
 * pass through unchanged.
 */

import type { InvitationLicenseSnapshot } from "@domain/license-snapshot.ts";
import type { TenantIdInput } from "@domain/tenant-id.ts";
import { BadRequestError } from "@shared/utils/errors.ts";

export interface NormalizedInvitationTenantIds {
  client_id: string;
  program_id: string;
  licenseSnapshot?: InvitationLicenseSnapshot;
}

function isIntegerTenantId(value: TenantIdInput): value is number {
  return typeof value === "number";
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
      "client_id and program_id must both be integers or both be strings.",
    );
  }

  // String pass-through (already-stored ids echoed back). No license snapshot;
  // the caller falls back to resolveInvitationLicenseSnapshot if needed.
  if (!clientIsInt) {
    return {
      client_id: String(clientId),
      program_id: String(programId),
    };
  }

  // Integer path: the Adhera Core integer is the identity, stored as its string.
  const clientInt = clientId as number;
  const programInt = programId as number;

  return {
    client_id: String(clientInt),
    program_id: String(programInt),
    licenseSnapshot: {
      license_client_id: clientInt,
      license_program_id: programInt,
      core_api_host: resolveCoreApiHost(),
    },
  };
}
