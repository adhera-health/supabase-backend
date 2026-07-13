/**
 * Frontend-facing DTOs for Adhera Core gateway responses (invitation dropdowns).
 */

/** Hospital / client option for invitation UI. */
export interface ClientOption {
  id: number;
  name: string;
}

/** GET /invitations/clients */
export interface ListClientsResponse {
  clients: ClientOption[];
}

/** Program option for invitation UI (after hospital select). */
export interface ProgramOption {
  id: number;
  name: string;
}

/** GET /invitations/clients/:clientId/programs */
export interface ListClientProgramsResponse {
  programs: ProgramOption[];
}
