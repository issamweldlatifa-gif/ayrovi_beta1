/** Authored, opt-in Publication layouts. Old template IDs keep their rendering. */
export const PUBLICATION_CAMPAIGN_LAYOUTS = ['campaign_orange', 'campaign_red'] as const;
export type PublicationCampaignLayout = (typeof PUBLICATION_CAMPAIGN_LAYOUTS)[number];
export function isPublicationCampaign(value: unknown): value is PublicationCampaignLayout {
  return value === 'campaign_orange' || value === 'campaign_red';
}
