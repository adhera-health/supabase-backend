/**
 * Patient attention flags — database queries (dashboard follow-up markers).
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type {
  InvitationAttentionFlagResource,
  PatientAttentionFlag,
  PatientAttentionFlagSeverity,
  PatientAttentionFlagType,
} from "@domain/attention.ts";
import type { InvitationStatus } from "@domain/invitation.ts";

interface PatientInvitationLifecycleRow {
  id: number;
  uuid: string;
  status: InvitationStatus;
  invited_at: string;
  email_opened_at: string | null;
  registered_at: string | null;
  consent_completed_at: string | null;
}

/** Statuses the lifecycle cron may age, expire, or flag. */
const LIFECYCLE_PROCESSABLE_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
  "email_opened",
  "onboarding_completed",
  "consent_viewed",
];

function toAttentionFlagResource(
  row: PatientAttentionFlag,
): InvitationAttentionFlagResource {
  return {
    flag_type: row.flag_type,
    severity: row.severity,
    detected_at: row.detected_at,
  };
}

export async function getActiveAttentionFlagByInvitationAndType(
  invitationId: number,
  flagType: PatientAttentionFlagType,
): Promise<PatientAttentionFlag | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_attention_flags")
    .select()
    .eq("invitation_id", invitationId)
    .eq("flag_type", flagType)
    .is("resolved_at", null)
    .maybeSingle();

  if (error) {
    raiseDbError("Failed to load active patient attention flag", error);
  }

  return (data as PatientAttentionFlag | null) ?? null;
}

export async function insertPatientAttentionFlagRow(input: {
  invitation_id: number;
  flag_type: PatientAttentionFlagType;
  severity?: PatientAttentionFlagSeverity;
  detected_at: string;
  metadata_json?: Record<string, unknown>;
}): Promise<{ row: PatientAttentionFlag; created: boolean }> {
  const existing = await getActiveAttentionFlagByInvitationAndType(
    input.invitation_id,
    input.flag_type,
  );

  if (existing) {
    return { row: existing, created: false };
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_attention_flags")
    .insert({
      invitation_id: input.invitation_id,
      flag_type: input.flag_type,
      severity: input.severity ?? "warning",
      detected_at: input.detected_at,
      metadata_json: input.metadata_json ?? null,
    })
    .select()
    .single();

  if (error) {
    raiseDbError("Failed to insert patient attention flag", error);
  }

  return { row: data as PatientAttentionFlag, created: true };
}

export async function resolveActiveAttentionFlagsForInvitation(
  invitationId: number,
  resolvedAt: string,
  flagTypes?: PatientAttentionFlagType[],
): Promise<number> {
  const db = getServiceClient();
  let query = db
    .from("patient_attention_flags")
    .update({ resolved_at: resolvedAt })
    .eq("invitation_id", invitationId)
    .is("resolved_at", null)
    .select("id");

  if (flagTypes?.length) {
    query = query.in("flag_type", flagTypes);
  }

  const { data, error } = await query;

  if (error) {
    raiseDbError("Failed to resolve patient attention flags", error);
  }

  return (data ?? []).length;
}

export async function listActiveAttentionFlagsByInvitationId(
  invitationId: number,
): Promise<InvitationAttentionFlagResource[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_attention_flags")
    .select()
    .eq("invitation_id", invitationId)
    .is("resolved_at", null)
    .order("detected_at", { ascending: true });

  if (error) {
    raiseDbError("Failed to list active patient attention flags", error);
  }

  return (data as PatientAttentionFlag[]).map(toAttentionFlagResource);
}

/** Batch-load active flags for invitation list rows (keyed by invitation id). */
export async function listActiveAttentionFlagsByInvitationIds(
  invitationIds: number[],
): Promise<Map<number, InvitationAttentionFlagResource[]>> {
  const result = new Map<number, InvitationAttentionFlagResource[]>();

  if (invitationIds.length === 0) {
    return result;
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_attention_flags")
    .select()
    .in("invitation_id", invitationIds)
    .is("resolved_at", null)
    .order("detected_at", { ascending: true });

  if (error) {
    raiseDbError("Failed to batch-load patient attention flags", error);
  }

  for (const row of (data ?? []) as PatientAttentionFlag[]) {
    const flags = result.get(row.invitation_id) ?? [];
    flags.push(toAttentionFlagResource(row));
    result.set(row.invitation_id, flags);
  }

  return result;
}

export async function listInvitationsForLifecycleProcessing(
  invitationUuid?: string,
): Promise<PatientInvitationLifecycleRow[]> {
  const db = getServiceClient();
  let query = db
    .from("patient_invitations")
    .select("id, uuid, status, invited_at, email_opened_at, registered_at, consent_completed_at")
    .in("status", LIFECYCLE_PROCESSABLE_STATUSES);

  if (invitationUuid) {
    query = query.eq("uuid", invitationUuid);
  }

  const { data, error } = await query;

  if (error) {
    raiseDbError("Failed to list invitations for lifecycle processing", error);
  }

  return (data ?? []) as PatientInvitationLifecycleRow[];
}

/** email_opened invitations eligible for post-click auto drop-out after +48h reminders. */
export async function listInvitationsForPostClickAutoDropout(
  invitationUuid?: string,
): Promise<PatientInvitationLifecycleRow[]> {
  const db = getServiceClient();
  let query = db
    .from("patient_invitations")
    .select("id, uuid, status, invited_at, email_opened_at, registered_at, consent_completed_at")
    .eq("status", "email_opened")
    .is("registered_at", null);

  if (invitationUuid) {
    query = query.eq("uuid", invitationUuid);
  }

  const { data, error } = await query;

  if (error) {
    raiseDbError("Failed to list invitations for post-click auto drop-out", error);
  }

  return (data ?? []) as PatientInvitationLifecycleRow[];
}
