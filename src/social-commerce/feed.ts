import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { readPublishedSocial } from '../magazine/publicSocialReads';
import { publicProductsByContent } from '../services/contentProducts';
import { linkedProductFromJoin, LINKED_PRODUCT_JOIN_SELECT } from '../services/shoppableContent';
import { isSocialFilter, isSocialId, type SocialEdition, type SocialFeedItem, type SocialFeedFilter, type SocialFeedPage, type SocialProduct } from '../../shared/socialCommerce';
import { isRecentProduct } from '../services/publicationBlocks';
import { activeEdition, readEditionState } from './editions';

const PAGE_SIZE = 8;
const SOURCE_LIMIT = 24;
const CURSOR_TTL_MS = 60 * 60 * 1000;
const sources = ['reel', 'editorial', 'story'] as const;
type Source = (typeof sources)[number];
type Position = { at: string; id: string };
type Cursor = {
  at: string; filter: SocialFeedFilter; edition: string;
  positions: Partial<Record<'reel' | 'story', Position>>; editorial: number;
  nextSource: number; lastKind: SocialFeedItem['kind'] | null; recentBrands: string[][];
};
type Candidate = { item: SocialFeedItem; position?: Position; brands: string[] };

export class SocialFeedRequestError extends Error {
  constructor(readonly code: 'INVALID_SOCIAL_PAGE' | 'SOCIAL_FEED_CHANGED') { super(code); }
}
const validAt = (at: unknown): at is string => typeof at === 'string' && at.length <= 40 && Number.isFinite(Date.parse(at));
const kinds = ['reel', 'story', 'article', 'look', 'pick'];
function parsePage(rawFilter: unknown, rawCursor: unknown, now: string, edition: string): Cursor {
  const filter = rawFilter ?? 'all';
  if (!isSocialFilter(filter)) throw new SocialFeedRequestError('INVALID_SOCIAL_PAGE');
  if (rawCursor === undefined) return { filter, edition, at: now, positions: {}, editorial: 0, nextSource: 0, lastKind: null, recentBrands: [] };
  try {
    if (typeof rawCursor !== 'string' || rawCursor.length > 5700 || !/^[\w-]+$/.test(rawCursor)) throw new Error();
    const cursor = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as Cursor;
    if (!validAt(cursor.at) || cursor.at > now || cursor.filter !== filter || !Number.isInteger(cursor.editorial) || cursor.editorial < 0 || cursor.editorial > 32 ||
      !Number.isInteger(cursor.nextSource) || cursor.nextSource < 0 || cursor.nextSource > 2 || (cursor.lastKind !== null && !kinds.includes(cursor.lastKind)) ||
      !Array.isArray(cursor.recentBrands) || cursor.recentBrands.length > 9 || cursor.recentBrands.some((row) => !Array.isArray(row) || row.length > 6 || row.some((brand) => typeof brand !== 'string' || !/^[0-9a-f]{12}$/.test(brand))) ||
      !cursor.positions || Object.entries(cursor.positions).some(([key, val]) => !['reel', 'story'].includes(key) || !val || !isSocialId(val.id) || !validAt(val.at))) throw new Error();
    if (Date.parse(now) - Date.parse(cursor.at) > CURSOR_TTL_MS || cursor.edition !== edition) throw new SocialFeedRequestError('SOCIAL_FEED_CHANGED');
    return cursor;
  } catch (error) {
    if (error instanceof SocialFeedRequestError) throw error;
    throw new SocialFeedRequestError('INVALID_SOCIAL_PAGE');
  }
}

function catalogueCards(db: QatafoDatabase, ids: string[], now: string): Map<string, SocialProduct> {
  if (!ids.length) return new Map();
  const rows = db.all<Omit<SocialProduct, 'available' | 'currency' | 'isNew'> & { created_at: string }>(`SELECT p.id,p.name,COALESCE(p.brand_name,'') brand,COALESCE(p.image,'') image,
    p.final_price price,CASE WHEN p.compare_at_price>p.final_price THEN p.compare_at_price END compareAtPrice,p.stock_status stockStatus,p.created_at FROM products p
    WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.status='ACTIVE' AND p.final_price>0
      AND p.stock_status IN ('AVAILABLE','LIMITED')
      AND (
        (NOT EXISTS(SELECT 1 FROM catalogue_variants v WHERE v.product_id=p.id AND v.status='ACTIVE')
          AND (NOT EXISTS(SELECT 1 FROM inventory_stock_items i WHERE i.product_id=p.id AND i.status='ACTIVE')
            OR EXISTS(SELECT 1 FROM inventory_stock_items i WHERE i.product_id=p.id AND i.status='ACTIVE' AND i.variant_id IS NULL AND i.quantity>0)))
        OR EXISTS (SELECT 1 FROM catalogue_variants v JOIN inventory_stock_items i ON i.product_id=v.product_id AND i.variant_id=v.id
          WHERE v.product_id=p.id AND v.status='ACTIVE' AND i.status='ACTIVE' AND i.quantity>0)
      )`, ...ids);
  return new Map(rows.map(({ created_at, ...row }) => [row.id, { ...row, available: true, currency: 'TND', isNew: isRecentProduct(created_at, new Date(now)) }]));
}

const brandKeys = (products: SocialProduct[]) => [...new Set(products.map(({ brand }) => brand.trim().toLowerCase()).filter(Boolean))].slice(0, 6)
  .map((brand) => createHash('sha256').update(brand).digest('hex').slice(0, 12));

function storyRows(db: QatafoDatabase, now: string, page: Cursor) {
  const position = page.positions.story;
  return db.all<Record<string, any>>(`SELECT s.id,s.media_type,s.media_url,s.title,s.description,s.title_ar,s.description_ar,s.cta,s.target_url,
    s.product_id,s.arrival_id,s.promotion_id,s.publish_at,s.expires_at,s.priority,s.status,s.content_mode,${LINKED_PRODUCT_JOIN_SELECT}
    FROM stories s LEFT JOIN products p ON p.id=s.product_id
    WHERE s.status='PUBLISHED' AND s.publish_at<=? AND (s.expires_at IS NULL OR s.expires_at>?) AND TRIM(s.media_url)<>''
      ${position ? 'AND (s.publish_at<? OR (s.publish_at=? AND s.id<?))' : ''}
    ORDER BY s.publish_at DESC,s.id DESC LIMIT ?`, page.at, now, ...(position ? [position.at, position.at, position.id] : []), SOURCE_LIMIT + 1);
}

export function readSocialFeed(db: QatafoDatabase, rawFilter: unknown, rawCursor: unknown, now = new Date().toISOString()): SocialFeedPage {
  const edition = activeEdition(readEditionState(db), now);
  const identity = edition ? createHash('sha256').update(JSON.stringify(edition)).digest('hex').slice(0, 16) : '';
  const cursor = parsePage(rawFilter, rawCursor, now, identity);
  const reel = cursor.filter === 'all' || cursor.filter === 'reels' ? readPublishedSocial(db, 'reel', cursor.at, { limit: SOURCE_LIMIT, cursor: cursor.positions.reel }) : null;
  const stories = cursor.filter === 'all' || cursor.filter === 'stories' ? storyRows(db, now, cursor) : [];
  const entries = cursor.filter === 'all' || cursor.filter === 'magazine' ? (edition?.entries ?? []).slice(cursor.editorial) : [];
  const withPrimary = (row: Record<string, any>) => ({ ...row, product: linkedProductFromJoin(row) });
  const reelLinks = publicProductsByContent(db, 'reel', (reel?.items ?? []).map(withPrimary) as any);
  const storyLinks = publicProductsByContent(db, 'story', stories.slice(0, SOURCE_LIMIT).map(withPrimary) as any);
  const ids = new Set<string>();
  for (const map of [reelLinks, storyLinks]) for (const links of map.values()) for (const link of links.slice(0, 6)) ids.add(link.id);
  const articles = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === 'article') articles.add(entry.newsId);
    else if (entry.kind === 'look') for (const pin of entry.pins) ids.add(pin.productId);
    else ids.add(entry.productId);
  }
  const productMap = catalogueCards(db, [...ids], now);
  const news = new Map<string, { id: string; title: string; summary: string; image: string; author: string }>();
  if (articles.size) for (const row of db.all<{ id: string; title: string; summary: string; image: string; author: string }>(
    `SELECT id,title,summary,image,author FROM news_items WHERE status='PUBLISHED' AND published_at<=? AND id IN (${[...articles].map(() => '?').join(',')})`, now, ...articles)) news.set(row.id, row);
  const available = (links: readonly { id: string }[] | undefined) => (links ?? []).slice(0, 6).flatMap(({ id }) => {
    const p = productMap.get(id); return p ? [p] : [];
  });
  const queues: Record<Source, Array<Candidate | null>> = {
    reel: (reel?.items ?? []).map((row) => {
      const products = available(reelLinks.get(row.id));
      const { id, title, channel_id, description, video_url, poster_url, duration_seconds, publish_at, views, likes } = row;
      return { position: { at: publish_at, id }, brands: brandKeys(products), item: { kind: 'reel', id, products,
        content: { id, title, channel_id, description, video_url, poster_url, duration_seconds, publish_at, views, likes } } };
    }),
    story: stories.slice(0, SOURCE_LIMIT).map((row) => {
      const products = available(storyLinks.get(row.id));
      const { id, title, description, title_ar, description_ar, media_type, media_url, arrival_id, promotion_id, publish_at, expires_at, priority, status } = row;
      // Never resurrect a dead product link via a legacy target_url on a shoppable story.
      const product = products[0];
      return { position: { at: publish_at, id }, brands: brandKeys(products), item: { kind: 'story', id,
        content: { id, title, description, title_ar, description_ar, media_type, media_url, arrival_id, promotion_id, publish_at, expires_at, priority, status,
          product_id: product?.id ?? null, product: product ?? null, cta: row.cta, target_url: row.product_id || row.content_mode === 'shoppable' ? '' : row.target_url } } };
    }),
    editorial: entries.map((entry) => {
      if (entry.kind === 'article') {
        const article = news.get(entry.newsId);
        return article ? { brands: [], item: { kind: 'article', id: entry.id, newsId: article.id, title: article.title, description: article.summary, image: article.image, author: article.author } } : null;
      }
      if (entry.kind === 'pick') {
        const product = productMap.get(entry.productId);
        return product ? { brands: brandKeys([product]), item: { kind: 'pick', id: entry.id, title: entry.title, description: entry.description, product } } : null;
      }
      const pins = entry.pins.flatMap(({ x, y, productId }) => {
        const product = productMap.get(productId);
        return product ? [{ x, y, product }] : [];
      });
      // An incomplete outfit is not published as a complete look.
      return pins.length === entry.pins.length ? { brands: brandKeys(pins.map((pin) => pin.product)), item: { kind: 'look', id: entry.id, title: entry.title, description: entry.description, image: entry.image, pins } } : null;
    }),
  };
  const items: SocialFeedItem[] = [];
  // Round robin across sources, preferring a different format. Progress, including skips for availability/diversity, travels in the cursor.
  while (items.length < PAGE_SIZE) {
    const ordered = sources.map((_, i) => (i + cursor.nextSource) % sources.length);
    const next = ordered.find(i => queues[sources[i]].length && queues[sources[i]][0]?.item.kind !== cursor.lastKind)
      ?? ordered.find(i => queues[sources[i]].length);
    if (next === undefined) break;
    const key = sources[next], candidate = queues[key].shift();
    if (key === 'editorial') cursor.editorial++;
    else if (candidate?.position) cursor.positions[key] = candidate.position;
    if (!candidate) continue;
    const conflict = candidate.brands.some(brand => cursor.recentBrands.some(recent => recent.includes(brand)));
    if (conflict) {
      // Keep the real editorial media, not the repeated purchase offer. Curated looks/picks are indivisible.
      if (candidate.item.kind === 'reel') candidate.item.products = [];
      else if (candidate.item.kind === 'story') candidate.item.content = { ...(candidate.item.content as object), product_id: null, product: null, target_url: '' };
      else continue;
    }
    cursor.nextSource = (next + 1) % sources.length;
    cursor.lastKind = candidate.item.kind;
    cursor.recentBrands = [...cursor.recentBrands, conflict ? [] : candidate.brands].slice(-9);
    items.push(candidate.item);
  }
  const hasMore = sources.some(key => queues[key].length) || Boolean(reel?.nextCursor) || stories.length > SOURCE_LIMIT;
  const header = edition && summarize(edition);
  return { items, edition: header, nextCursor: hasMore ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null };
}

function summarize({ number, title, subtitle, cover, startsAt, endsAt }: SocialEdition) {
  return { number, title, subtitle, cover, startsAt, endsAt };
}
