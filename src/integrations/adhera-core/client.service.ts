/**
 * Adhera Core — Active Clients integration service.
 * Calls external API via http.client; maps with Zod. No invitation business logic.
 */

import { getAdheraCoreConfig } from "./config.ts";
import { mapActiveClientsResponse } from "./client.mapper.ts";
import { adheraCoreGet } from "./http.client.ts";
import type { ClientOption } from "@domain/adhera-core.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("adhera-core-clients");

/**
 * Fetches the full active-clients list from Adhera Core and maps to dropdown DTOs.
 *
 * Pagination: assumes a complete list from one response.
 * TODO: If the external API paginates later, aggregate pages inside http.client /
 * this service and still return ClientOption[] so GET /clients stays unchanged.
 */
export async function listActiveClients(): Promise<ClientOption[]> {
  const { activeClientsPath } = getAdheraCoreConfig();
  const raw = await adheraCoreGet(activeClientsPath);
  return mapActiveClientsResponse(raw, logger);
}
