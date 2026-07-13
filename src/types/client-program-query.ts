/** GET /api/v1/consents/latest — query params */
export interface LatestConsentQuery {
  program_id: string;
  client_id: string;
}

/** @deprecated Use LatestConsentQuery */
export type GetLatestConsentQuery = LatestConsentQuery;

/** POST /onboarding/mark-active — query params (patient JWT). */
export interface MarkInvitationActiveQuery {
  client_id: string;
  program_id: string;
}
