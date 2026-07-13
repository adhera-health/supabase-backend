/**
 * Adhera Core — Client Programs integration service.
 * Calls external API via http.client; maps with Zod. No invitation business logic.
 */

import { buildClientProgramsPath } from "./config.ts";
import { adheraCoreGet } from "./http.client.ts";
import { mapClientProgramsResponse } from "./program.mapper.ts";
import type { ProgramOption } from "@domain/adhera-core.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("adhera-core-programs");

/**
 * Fetches programs for a client from Adhera Core and maps to dropdown DTOs.
 *
 * Pagination: assumes a complete list from one response.
 * TODO: If the external API paginates later, aggregate pages inside http.client /
 * this service and still return ProgramOption[] so the route contract stays unchanged.
 */
export async function listProgramsForClient(clientId: number): Promise<ProgramOption[]> {
  const path = buildClientProgramsPath(clientId);
  const raw = await adheraCoreGet(path);
  return mapClientProgramsResponse(raw, logger);
}
