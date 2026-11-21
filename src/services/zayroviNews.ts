import { ZAYROVI_NEWS_GUIDES } from '../../shared/zayroviNewsGuides';
import type { QatafoDatabase } from '../db/database';
import { DEFAULT_ZAYROVI_NEWS, NEWS_SOURCES, ZAYROVI_NEWS_LIMIT, normalizeZayroviNews, type NewsCard, type NewsSource, type ZayroviDailyOffer, type ZayroviNewsFeed } from '../../shared/zayroviNews';
import { normalizeMediaLink } from '../../shared/mediaLinks';
import { resolvePromoForQuote, tunisIsoDay } from './promotions';
import { readPublicationFeedSettings } from './publicationFeedSettings';

export const ZAYROVI_NEWS_KEY = 'mobile_zayrovi_news';
export function readZayroviNews(db: QatafoDatabase) {
  const row = db.get<{ setting_value: string }>('SELECT setting_value FROM settings WHERE setting_key=?', ZAYROVI_NEWS_KEY);
  try { return (row && normalizeZayroviNews(JSON.parse(row.setting_value))) || DEFAULT_ZAYROVI_NEWS; }
  catch { return DEFAULT_ZAYROVI_NEWS; }
}
export function saveZayroviNews(db: QatafoDatabase, raw: unknown, now: string) {
  const data = normalizeZayroviNews(raw);
  if (!data) return null;
  db.run(`INSERT INTO settings(id,category,setting_key,setting_value,value_type,label,updated_at) VALUES (?,'INTERFACE',?,?,'JSON','Zayrovi News (mobile)',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`, ZAYROVI_NEWS_KEY, ZAYROVI_NEWS_KEY, JSON.stringify(data), now);
  return data;
}

// Identifiers in SQL come only from this fixed map, never from an editor or client.
const sources = {
  story: { table: 'stories', date: 'publish_at', status: "status='PUBLISHED'", extra: 'AND (expires_at IS NULL OR expires_at>?)', columns: 'title,title_ar,description AS body,description_ar AS body_ar,CASE WHEN media_type=\'IMAGE\' THEN media_url ELSE \'\' END AS image' },
  reel: { table: 'reels', date: 'publish_at', status: "status='publie'", extra: '', columns: "title,'' AS title_ar,description AS body,'' AS body_ar,poster_url AS image" },
  publication: { table: 'publications', date: 'publish_at', status: "status='publie'", extra: '', columns: "title,'' AS title_ar,subtitle AS body,'' AS body_ar,image_url AS image" },
  article: { table: 'news_items', date: 'published_at', status: "status IN ('PUBLISHED','SCHEDULED')", extra: '', columns: "title,'' AS title_ar,COALESCE(NULLIF(summary,''),substr(content,1,240)) AS body,'' AS body_ar,image" },
} as const;
type SourceRow = { id: string; title: string; title_ar: string; body: string; body_ar: string; image: string };
function sourceRows(db: QatafoDatabase, kind: NewsSource, now: string, ids: string[] | null, search = '') {
  if (ids && !ids.length) return [];
  if (kind === 'publication' && !readPublicationFeedSettings(db).enabled) return [];
  const source = sources[kind];
  const titleSearch = kind === 'story' ? "OR instr(COALESCE(title_ar,''),?)>0" : '';
  const restriction = ids ? `AND id IN (${ids.map(() => '?').join(',')})`
    : `AND (instr(lower(COALESCE(title,'')),lower(?))>0 OR instr(id,?)>0 ${titleSearch})`;
  const params = ids ?? (kind === 'story' ? [search, search, search] : [search, search]);
  return db.all<SourceRow>(`SELECT id,${source.columns} FROM ${source.table} WHERE ${source.status} AND ${source.date}<=? ${source.extra}
    ${restriction} ORDER BY ${source.date} DESC,id LIMIT ?`, now, ...(source.extra ? [now] : []), ...params, ZAYROVI_NEWS_LIMIT);
}
export function searchZayroviNewsSources(db: QatafoDatabase, kind: NewsSource, query: string, now = new Date().toISOString()) {
  return sourceRows(db, kind, now, null, query.trim().slice(0, 100)).map(({ id, title, title_ar }) => ({ id, title: title || title_ar || id }));
}
function dayOffer(db: QatafoDatabase, settings: ReturnType<typeof readZayroviNews>, now: Date): ZayroviDailyOffer {
  const promo = resolvePromoForQuote(db, { now });
  return { ...settings.daily, day: tunisIsoDay(now), percent: promo?.source === 'DAY' ? promo.percent : null };
}
export function readHomeDailyOffer(db: QatafoDatabase, now = new Date()) {
  const { showHome, title, teaser, cta, percent } = dayOffer(db, readZayroviNews(db), now);
  return { showHome, title, teaser, cta, percent };
}
export function readPublicZayroviNews(db: QatafoDatabase, now = new Date()): ZayroviNewsFeed {
  const settings = readZayroviNews(db);
  const active = settings.entries.filter(entry => entry.published);
  const rows = new Map<string, SourceRow>();
  const nowIso = now.toISOString();
  for (const kind of NEWS_SOURCES) {
    const ids = active.flatMap(entry => entry.kind === kind ? [entry.targetId] : []);
    for (const row of sourceRows(db, kind, nowIso, ids)) rows.set(`${kind}:${row.id}`, row);
  }
  const entries = active.flatMap((entry): NewsCard[] => {
    if (entry.kind === 'notice') return [{ id: entry.id, kind: entry.kind, title: entry.title, body: entry.body, image: entry.image, section: entry.section, summary: entry.summary, tool: entry.tool }];
    const source = rows.get(`${entry.kind}:${entry.targetId}`);
    if (!source) return [];
    const title = source.title || source.title_ar || '';
    if (!title) return [];
    const image = normalizeMediaLink(source.image || '', 'image');
    return [{ id: entry.id, kind: entry.kind, section: entry.section, targetId: entry.targetId, title: { fr: title.slice(0, 140), ar: source.title_ar?.slice(0, 140) || '' },
      body: { fr: source.body?.slice(0, 240) || '', ar: source.body_ar?.slice(0, 240) || '' }, image: image.ok ? image.url : '' }];
  });
  const authoredIds = new Set(settings.entries.map(entry => entry.id));
  const guides = settings.showGuides === false ? [] : ZAYROVI_NEWS_GUIDES.filter(guide => !authoredIds.has(guide.id));
  return { daily: dayOffer(db, settings, now), entries, guides };
}
