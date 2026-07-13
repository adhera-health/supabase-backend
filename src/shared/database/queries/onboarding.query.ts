/**
 * Onboarding database queries — Feature 1: complete-onboarding
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type { OnboardingAssignment } from "@domain/onboarding.ts";

function raiseOnboardingDbError(
  context: string,
  error: { message: string; code?: string },
): never {
  return raiseDbError(context, error, {
    conflictMessage: "An onboarding assignment already exists for this invitation",
  });
}

export interface NewOnboardingAssignment {
  user_id: string;
  invitation_id: number;
  client_id: string;
  program_id: string;
  assigned_at: string;
}

export async function getLatestAssignmentByUserId(
  userId: string,
): Promise<OnboardingAssignment | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_assignments")
    .select()
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    raiseOnboardingDbError("Failed to load onboarding assignment for user", error);
  }

  return data ? data as OnboardingAssignment : null;
}

export async function getAssignmentByInvitationId(
  invitationId: number,
): Promise<OnboardingAssignment | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_assignments")
    .select()
    .eq("invitation_id", invitationId)
    .maybeSingle();

  if (error) raiseOnboardingDbError("Failed to load onboarding assignment", error);
  return data ? data as OnboardingAssignment : null;
}

export async function getAssignmentByUserClientProgram(
  userId: string,
  clientId: string,
  programId: string,
): Promise<OnboardingAssignment | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_assignments")
    .select()
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .maybeSingle();

  if (error) {
    raiseOnboardingDbError("Failed to load onboarding assignment for consent access", error);
  }

  return data ? data as OnboardingAssignment : null;
}

export async function createOnboardingAssignmentRow(
  input: NewOnboardingAssignment,
): Promise<OnboardingAssignment> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_assignments")
    .insert({
      user_id: input.user_id,
      invitation_id: input.invitation_id,
      client_id: input.client_id,
      program_id: input.program_id,
      assigned_at: input.assigned_at,
    })
    .select()
    .single();

  if (error) raiseOnboardingDbError("Failed to create onboarding assignment", error);
  return data as OnboardingAssignment;
}
