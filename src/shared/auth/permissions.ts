/**
 * Central permission registry for RBAC.
 *
 * Permissions are the stable authorization contract. Roles map to permission sets;
 * routes and services check permissions instead of hard-coded role names.
 */

import type { AppRole } from "@shared/auth/request-auth.ts";

export const PERMISSIONS = {
  // Staff user management
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_DELETE: "users.delete",
  USERS_UPDATE_ROLE: "users.update_role",

  // Invitations
  INVITATIONS_CLIENTS_LIST: "invitations.clients.list",
  INVITATIONS_SEND: "invitations.send",
  INVITATIONS_RESEND: "invitations.resend",
  INVITATIONS_VIEW_ALL: "invitations.view.all",
  INVITATIONS_VIEW_OWN: "invitations.view.own",
  INVITATIONS_DROP_OUT: "invitations.drop_out",
  INVITATIONS_ATTENTION_REASONS_VIEW: "invitations.attention_reasons.view",

  // Consent documents (admin)
  CONSENT_DOCUMENTS_MANAGE: "consent_documents.manage",

  // Email templates (admin)
  EMAIL_TEMPLATES_MANAGE: "email_templates.manage",

  // Dashboard
  DASHBOARD_ANALYTICS_VIEW: "dashboard.analytics.view",
  AUDIT_LOGS_VIEW: "audit_logs.view",

  // Patient onboarding
  CONSENTS_VIEW: "consents.view",
  CONSENTS_ACCEPT: "consents.accept",
  CONSENTS_WITHDRAW: "consents.withdraw",
  ONBOARDING_MARK_ACTIVE: "onboarding.mark_active",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

const ADMIN_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS;

const RECRUITER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.INVITATIONS_CLIENTS_LIST,
  PERMISSIONS.INVITATIONS_SEND,
  PERMISSIONS.INVITATIONS_RESEND,
  PERMISSIONS.INVITATIONS_VIEW_OWN,
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.INVITATIONS_VIEW_ALL,
  PERMISSIONS.INVITATIONS_ATTENTION_REASONS_VIEW,
  PERMISSIONS.INVITATIONS_DROP_OUT,
  PERMISSIONS.DASHBOARD_ANALYTICS_VIEW,
];

const PATIENT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CONSENTS_VIEW,
  PERMISSIONS.CONSENTS_ACCEPT,
  PERMISSIONS.CONSENTS_WITHDRAW,
  PERMISSIONS.ONBOARDING_MARK_ACTIVE,
];

/** Maps each application role to its granted permissions. */
export const ROLE_PERMISSIONS: Readonly<Record<AppRole, readonly Permission[]>> = {
  admin: ADMIN_PERMISSIONS,
  recruiter: RECRUITER_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  patient: PATIENT_PERMISSIONS,
  healthcare_professional: [],
};
