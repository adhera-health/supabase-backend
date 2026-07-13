/**
 * Shared API response building blocks.
 * All success payloads are nested under named resources inside `data`.
 */

import type { InvitationStatus } from "@domain/invitation-status.ts";

/** Response metadata included on every success and error response. */
export interface ApiMeta {
  timestamp: string;
  /** Request trace ID — matches X-Correlation-ID header and log correlationId. */
  correlation_id?: string;
}

/** Standard pagination block for list endpoints. */
export interface ApiPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/** Validation error details — field-level messages for 422 responses. */
export interface ApiValidationErrorDetails {
  field_errors: Record<string, string[]>;
}

/** Public invitation summary returned by most invitation endpoints. */
export interface InvitationResource {
  invitation_uuid: string;
  email: string;
  /** Tenant UUID (formerly hospital_id). */
  client_id: string;
  program_id: string;
  status: InvitationStatus;
  invited_at?: string;
  email_opened_at?: string | null;
  registered_at?: string | null;
}

/** Patient auth session returned after onboarding. */
export interface SessionResource {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/** Minimal patient identity. */
export interface UserResource {
  user_id: string;
  email: string;
}
