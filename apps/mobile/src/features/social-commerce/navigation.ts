import { isSocialFilter, SOCIAL_FEED_FILTERS, type SocialFeedFilter } from '../../../../../shared/socialCommerce';
export const SOCIAL_FILTERS = SOCIAL_FEED_FILTERS;
export type SocialFilter = SocialFeedFilter;

export function parseSocialFilter(raw: unknown): SocialFilter {
  return isSocialFilter(raw) ? raw : 'all';
}

export function socialHref(filter: SocialFilter = 'all') {
  return { pathname: '/(tabs)/social' as const, params: { filter } };
}
