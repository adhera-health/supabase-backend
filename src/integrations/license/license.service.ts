/**
 * License Service integration — create one patient license.
 */

import { getLicenseServiceConfig, isLicenseServiceConfigured } from "./config.ts";
import { licenseServiceRequest } from "./http.client.ts";
import { mapLicenseCreateResponse } from "./license.mapper.ts";
import {
  DEFAULT_PATIENT_LICENSE_ROLE,
  type CreatePatientLicenseInput,
  type CreatedLicense,
} from "@domain/license.ts";
import { isProductionEnvironment } from "@shared/utils/environment.ts";
import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("license-service");

function buildDevStubLicense(input: CreatePatientLicenseInput): CreatedLicense {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return {
    code: `dev-${suffix}`,
    core_api_host: input.core_api_host,
    license_client_id: input.license_client_id,
    license_program_id: input.license_program_id,
    role: input.role?.trim() || DEFAULT_PATIENT_LICENSE_ROLE,
    is_available: true,
    source: "dev_stub",
  };
}

/**
 * Creates a single license for a patient invitation snapshot.
 *
 * - Production: requires LICENSE_* + Auth0 env; calls License API.
 * - Non-production without config: returns a local `dev_stub` license.
 */
export async function createPatientLicense(
  input: CreatePatientLicenseInput,
): Promise<CreatedLicense> {
  const role = input.role?.trim() || DEFAULT_PATIENT_LICENSE_ROLE;
  const isProduction = isProductionEnvironment();

  if (!isLicenseServiceConfigured()) {
    if (isProduction) {
      throw new AppError(
        "License Service is not configured. Set LICENSE_SERVICE_BASE_URL and LICENSE_AUTH0_* variables.",
        { statusCode: 503, code: "INTERNAL_ERROR" },
      );
    }

    logger.warn("License Service not configured — returning dev_stub license", {
      license_client_id: input.license_client_id,
      license_program_id: input.license_program_id,
    });
    return buildDevStubLicense({ ...input, role });
  }

  const { batchPath } = getLicenseServiceConfig();

  const raw = await licenseServiceRequest({
    method: "POST",
    path: batchPath,
    body: {
      client_id: input.license_client_id,
      program_id: input.license_program_id,
      role,
      core_api_host: input.core_api_host,
    },
  });

  return mapLicenseCreateResponse(
    raw,
    {
      core_api_host: input.core_api_host,
      license_client_id: input.license_client_id,
      license_program_id: input.license_program_id,
      role,
    },
    logger,
  );
}
