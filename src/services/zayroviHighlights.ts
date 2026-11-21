import { DEFAULT_HIGHLIGHTS, normalizeHighlights, ZAYROVI_HIGHLIGHTS_KEY, type HighlightSettings } from '../../shared/zayroviHighlights';
import type { QatafoDatabase } from '../db/database';
import { socialTotalSql } from '../db/socialTotals';
import { publicProductsByContent, type ContentForProducts } from './contentProducts';
import { viewerContentReactions } from '../magazine/socialInteractions';

type HighlightReel = ContentForProducts & {
  title: string; channel_id: string; description: string; video_url: string; poster_url: string; duration_seconds: number; publish_at: string; views: number; likes: number;
};
export function readHighlightsSettings(db: QatafoDatabase): HighlightSettings {
  const row = db.get<{ setting_value: string }>('SELECT setting_value FROM settings WHERE setting_key=?', ZAYROVI_HIGHLIGHTS_KEY);
  if (!row) return DEFAULT_HIGHLIGHTS;
  try { return normalizeHighlights(JSON.parse(row.setting_value)) ?? { enabled: false, slots: [] }; }
  catch { return { enabled: false, slots: [] }; }
}

// Same publication rules and canonical product/stock data as the regular Reel feed.
// Restrict to the official publisher because this template uses its avatar and profile.
function readReels(db: QatafoDatabase, now: string, ids?: string[], query = '') {
  if (ids && !ids.length) return [];
  const filter = ids ? `r.id IN (${ids.map(() => '?').join(',')})` : `(instr(lower(r.title),lower(?))>0 OR instr(r.id,?)>0)`;
  const rows = db.all<HighlightReel>(`SELECT r.id,r.title,r.channel_id,r.description,r.video_url,r.poster_url,r.duration_seconds,r.publish_at,r.content_mode,r.product_id,
    ${socialTotalSql('r.id', 'view')} views, (${socialTotalSql('r.id', 'like')} + ${socialTotalSql('r.id', 'love')}) likes
    FROM reels r WHERE r.status='publie' AND r.publish_at<=? AND r.channel_id='pub_zayrovi'
      AND r.content_mode='shoppable' AND TRIM(COALESCE(r.video_url,''))<>'' AND TRIM(COALESCE(r.poster_url,''))<>'' AND ${filter}
    ORDER BY r.publish_at DESC,r.id DESC LIMIT 24`, now, ...(ids ?? [query, query]));
  const products = publicProductsByContent(db, 'reel', rows);
  return rows.map(({ product_id: _productId, content_mode: _mode, ...row }) => ({ ...row, products: products.get(row.id) ?? [] }));
}

const eligibleProduct = (product: { image: string; available: boolean }) => product.available && Boolean(product.image);
export function pickHighlightReels(db: QatafoDatabase, query: string, now = new Date().toISOString()) {
  const pinned = readHighlightsSettings(db).slots.map(slot => slot.reelId);
  const rows = new Map([...readReels(db, now, undefined, query.trim().slice(0, 80)), ...readReels(db, now, pinned)].map(row => [row.id, row]));
  return [...rows.values()].map(row => ({ id: row.id, title: row.title, products: row.products.filter(eligibleProduct).map(({ id, name }) => ({ id, name })) }));
}
export function saveHighlightsSettings(db: QatafoDatabase, raw: unknown, now: string) {
  const settings = normalizeHighlights(raw);
  if (!settings) return null;
  if (settings.enabled) {
    const reels = new Map(readReels(db, now, settings.slots.map(slot => slot.reelId)).map(row => [row.id, row]));
    if (settings.slots.some(slot => !reels.get(slot.reelId)?.products.some(product => eligibleProduct(product) && (!slot.productId || slot.productId === product.id)))) return null;
  }
  db.run(`INSERT INTO settings(id,category,setting_key,setting_value,value_type,label,updated_at) VALUES (?,'INTERFACE',?,?,'JSON','Zayrovi Highlights (mobile)',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`, ZAYROVI_HIGHLIGHTS_KEY, ZAYROVI_HIGHLIGHTS_KEY, JSON.stringify(settings), now);
  return settings;
}
export function readPublicHighlights(db: QatafoDatabase, accountId: string, now = new Date().toISOString()) {
  const settings = readHighlightsSettings(db);
  if (!settings.enabled) return [];
  const reels = new Map(readReels(db, now, settings.slots.map(slot => slot.reelId)).map(row => [row.id, row]));
  const mine = accountId && reels.size ? viewerContentReactions(db, accountId, [...reels.keys()]) : {};
  return settings.slots.flatMap(slot => {
    const reel = reels.get(slot.reelId);
    if (!reel) return [];
    const product = reel.products.find(item => eligibleProduct(item) && (!slot.productId || slot.productId === item.id));
    // If the featured item is withdrawn, do not advertise its price or substitute another item.
    return [{ ...reel, product: product ?? null, ...(accountId ? { my_reaction: mine[reel.id] ?? null } : {}) }];
  });
}
