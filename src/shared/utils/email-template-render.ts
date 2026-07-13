/**
 * Placeholder rendering for stored invitation email templates.
 *
 * Supported placeholders in subject + html_body:
 *   {{onboarding_url}}, {{privacy_notice_url}}, {{expires_in_hours}}, {{patient_app_download_url}}
 */

export const INVITATION_EMAIL_PLACEHOLDERS = [
  "onboarding_url",
  "privacy_notice_url",
  "expires_in_hours",
  "patient_app_download_url",
] as const;

export type InvitationEmailPlaceholder =
  (typeof INVITATION_EMAIL_PLACEHOLDERS)[number];

export type InvitationEmailRenderVars = Record<InvitationEmailPlaceholder, string>;

const PLACEHOLDER_PATTERN = /\{\{([a-z_]+)\}\}/g;

/** Substitute {{key}} tokens. Unknown placeholders are left unchanged. */
export function renderEmailTemplate(
  template: string,
  vars: Partial<InvitationEmailRenderVars>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const value = vars[key as InvitationEmailPlaceholder];
    return value !== undefined ? value : match;
  });
}

/** Warn in logs when required invitation placeholders remain after render. */
export function findUnresolvedInvitationPlaceholders(content: string): string[] {
  const unresolved = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1];
    if (INVITATION_EMAIL_PLACEHOLDERS.includes(key as InvitationEmailPlaceholder)) {
      unresolved.add(key);
    }
  }
  return [...unresolved];
}
