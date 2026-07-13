/**
 * Audit logging service — append-only critical actions.
 */

import { insertAuditLogRow } from "@shared/database/queries/audit.query.ts";
import { createLogger } from "@shared/utils/logger.ts";
import type { InsertAuditLogInput } from "@domain/audit.ts";

const logger = createLogger("audit");

export async function logAuditEvent(input: InsertAuditLogInput): Promise<void> {
  try {
    await insertAuditLogRow(input);
  } catch (error) {
    logger.error("Failed to persist audit log", {
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
