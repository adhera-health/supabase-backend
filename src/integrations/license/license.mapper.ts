/**
 * Zod validation + mapping for License Service create response.
 * Accepts a single license object or a one-item array.
 */

import { z } from "zod";
import type { CreatedLicense } from "@domain/license.ts";
import { AppError } from "@shared/utils/errors.ts";
import type { Logger } from "@shared/utils/logger.ts";

const licenseItemSchema = z.object({
  code: z.string().trim().min(1),
  core_api_host: z.string().trim().min(1).optional(),
  client_id: z.coerce.number().int().positive().optional(),
  role: z.string().trim().min(1).optional(),
  is_available: z.boolean().optional(),
});

export function mapLicenseCreateResponse(
  raw: unknown,
  fallback: {
    core_api_host: string;
    license_client_id: number;
    license_program_id: number;
    role: string;
  },
  logger: Logger,
): CreatedLicense {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const parsed = licenseItemSchema.safeParse(candidate);

  if (!parsed.success) {
    logger.warn("License Service create response failed validation", {
      issues: parsed.error.issues.map((issue) => issue.message),
      was_array: Array.isArray(raw),
    });
    throw new AppError("License Service returned an invalid license record", {
      statusCode: 502,
      code: "INTERNAL_ERROR",
    });
  }

  const item = parsed.data;
  return {
    code: item.code,
    core_api_host: item.core_api_host ?? fallback.core_api_host,
    license_client_id: item.client_id ?? fallback.license_client_id,
    license_program_id: fallback.license_program_id,
    role: item.role ?? fallback.role,
    is_available: item.is_available ?? true,
    source: "license_service",
  };
}
