/**
 * Audit log database queries — insert-only.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type { InsertAuditLogInput } from "@domain/audit.ts";

export async function insertAuditLogRow(input: InsertAuditLogInput): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("audit_logs").insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action: input.action,
    actor_user_id: input.actor_user_id ?? null,
    actor_ip: input.actor_ip ?? null,
    metadata_json: input.metadata_json ?? null,
  });

  if (error) raiseDbError("Failed to write audit log", error);
}
