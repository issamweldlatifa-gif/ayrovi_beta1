/** Public content read boundary. HTTP parsing and response/product mapping stay outside. */
import type { QatafoDatabase } from '../db/database';
import { LINKED_PRODUCT_JOIN_SELECT } from '../services/shoppableContent';
import { socialCursor, type SocialPage } from './socialPagination';
import { socialTotalSql } from '../db/socialTotals';
type ContentReader = Pick<QatafoDatabase, 'all' | 'get'>;
export type PublicSocialKind = 'publication' | 'reel';
export interface PublishedSocialRow { id: string; publish_at: string; [column: string]: any }
const sources = {
  publication: { table: 'publications', alias: 'pub', select: 'pub.id,pub.title,pub.subtitle,pub.channel_id,pub.image_url,pub.publish_at,pub.content_mode' },
  reel: { table: 'reels', alias: 'r', select: `r.id,r.title,r.channel_id,r.description,r.video_url,r.poster_url,r.duration_seconds,r.publish_at,r.content_mode,
    ${socialTotalSql('r.id', 'view')} views,
    ${socialTotalSql('r.id', 'like')} likes` },
} as const;
/** Plafond des lectures NON paginées (contrat historique : un tableau, les plus récents d'abord). */
export const LEGACY_UNPAGED_LIMIT = 100;
export function readPublishedSocial(db: ContentReader, kind: PublicSocialKind, now: string, page?: SocialPage): {
  items: PublishedSocialRow[]; nextCursor: string | null;
} {
  if (!Object.prototype.hasOwnProperty.call(sources, kind)) throw new RangeError('Invalid social content kind');
  if (page && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 30 || (page.anchor && page.cursor)))
    throw new RangeError('Invalid social page');
  const { table, alias, select } = sources[kind];
  const params: unknown[] = [now];
  let position = page?.cursor;
  if (page?.anchor) {
    const anchor = db.get<{ id: string; publish_at: string }>(`SELECT id,publish_at FROM ${table} WHERE id=? AND status='publie' AND publish_at<=?`, page.anchor, now);
    if (anchor) position = { id: anchor.id, at: anchor.publish_at };
  }
  let seek = '';
  if (position) {
    seek = ` AND (${alias}.publish_at < ? OR (${alias}.publish_at = ? AND ${alias}.id ${page?.anchor ? '<=' : '<'} ?))`;
    params.push(position.at, position.at, position.id);
  }
  // Sans pagination (anciennes versions de l'app, ancien site) : plafond fixe des
  // contenus les plus récents. Avant le 12/11 la liste était ENTIÈRE — 250 Ko et
  // 148 req/s/vCPU à 300 publications, et elle grossissait à chaque publication.
  params.push(page ? page.limit + 1 : LEGACY_UNPAGED_LIMIT);
  const selected = db.all<PublishedSocialRow>(`SELECT ${select},${LINKED_PRODUCT_JOIN_SELECT}
    FROM ${table} ${alias} LEFT JOIN products p ON p.id=${alias}.product_id
    WHERE ${alias}.status='publie' AND ${alias}.publish_at<=?${seek}
    ORDER BY ${alias}.publish_at DESC,${alias}.id DESC LIMIT ?`, ...params);
  const items = page ? selected.slice(0, page.limit) : selected;
  return { items, nextCursor: page && selected.length > page.limit ? socialCursor(items[items.length - 1]) : null };
}
