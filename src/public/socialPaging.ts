/** Optional cursor protocol: legacy clients keep their array response. */
import type { SocialPage } from '../magazine/socialPagination';
export type { SocialCursor, SocialPage } from '../magazine/socialPagination';
export { socialCursor } from '../magazine/socialPagination';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id);
export function socialPage(query: Record<string, unknown>): SocialPage | undefined {
  if (query.limit === undefined && query.cursor === undefined && query.anchor === undefined) return;
  const limit = Number(query.limit ?? 12);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('INVALID_PAGE');
  const page: SocialPage = { limit };
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 512 || !/^[\w-]+$/.test(query.cursor)) throw new Error('INVALID_CURSOR');
    const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    if (!value || !validId(value.id) || typeof value.at !== 'string' || value.at.length > 40 || !Number.isFinite(Date.parse(value.at))) throw new Error('INVALID_CURSOR');
    page.cursor = { at: value.at, id: value.id };
  }
  if (query.anchor !== undefined) {
    if (!validId(query.anchor) || page.cursor) throw new Error('INVALID_ANCHOR');
    page.anchor = query.anchor;
  }
  return page;
}
