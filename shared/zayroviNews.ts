import { normalizeMediaLink } from './mediaLinks';

export const NEWS_SOURCES = ['story', 'reel', 'publication', 'article'] as const;
export type NewsSource = typeof NEWS_SOURCES[number];
export const ZAYROVI_NEWS_LIMIT = 20;
export type NewsCopy = { fr: string; ar: string };
export type NewsEntry = { id: string; published: boolean } & (
  { kind: 'notice'; title: NewsCopy; body: NewsCopy; image: string }
  | { kind: NewsSource; targetId: string }
);
export type ZayroviNewsSettings = {
  daily: { showHome: boolean; showNews: boolean; title: NewsCopy; teaser: NewsCopy; body: NewsCopy; cta: NewsCopy };
  entries: NewsEntry[];
};
export type NewsCard = { id: string; kind: NewsEntry['kind']; title: NewsCopy; image: string; body: NewsCopy; targetId?: string };
export type ZayroviDailyOffer = ZayroviNewsSettings['daily'] & { day: number; percent: number | null };
export type HomeDailyOffer = Pick<ZayroviDailyOffer, 'showHome' | 'title' | 'teaser' | 'cta' | 'percent'>;
export type ZayroviNewsFeed = {
  daily: ZayroviDailyOffer;
  entries: NewsCard[];
};

export const DEFAULT_ZAYROVI_NEWS: ZayroviNewsSettings = {
  daily: {
    showHome: true, showNews: true,
    title: { fr: 'L’offre du jour Zayrovi', ar: 'عرض اليوم من Zayrovi' },
    teaser: { fr: 'Une remise qui change selon le jour de la semaine.', ar: 'تخفيض يتبدّل حسب نهار الأسبوع.' },
    body: {
      fr: 'La remise suit le calendrier tunisien. Elle s’applique automatiquement au prix converti des produits éligibles, avant les frais éventuels. Le montant réel est affiché sur le devis, sans code à saisir. Une règle produit ou catégorie peut remplacer l’offre du jour. Ce dispositif est distinct de Black Friday et des codes promo.',
      ar: 'يتبدّل العرض حسب توقيت تونس. التخفيض يتطبّق آليًا على سعر المنتجات المؤهّلة بعد تحويل العملة وقبل المصاريف الإضافية. المبلغ الحقيقي يظهر في عرض السعر، من غير كود. قاعدة خاصة بمنتج أو بفئة تنجم تعوّض عرض اليوم. المنظومة هذي مختلفة على Black Friday وأكواد التخفيض.',
    },
    cta: { fr: 'Comment ça marche ?', ar: 'كيفاش يخدم؟' },
  },
  entries: [{ id: 'bienvenue', kind: 'notice', published: true, image: '',
    title: { fr: 'Bienvenue dans Zayrovi News', ar: 'مرحبا بيك في Zayrovi News' },
    body: { fr: 'Retrouvez ici les nouveautés, les explications sur nos services et une sélection de Stories, Reels et Publications.', ar: 'هنا تلقى آخر المستجدات، شرح خدماتنا ومختارات من الـStories والـReels والـPublications.' } }],
};
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const idMatch = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
export const isNewsSource = (value: unknown): value is NewsSource => (NEWS_SOURCES as readonly unknown[]).includes(value);
function localized(value: unknown, max: number): NewsCopy | null {
  const row = record(value);
  if (!row || typeof row.fr !== 'string' || typeof row.ar !== 'string' || !row.fr.trim() || !row.ar.trim() || row.fr.length > max || row.ar.length > max) return null;
  return { fr: row.fr.trim(), ar: row.ar.trim() };
}
function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  if (!value.trim()) return '';
  const media = normalizeMediaLink(value, 'image');
  if (!media.ok || !media.url) return null;
  if (media.url.startsWith('/')) {
    try {
      const path = decodeURIComponent(media.url.split(/[?#]/, 1)[0]!);
      if (!/^\/(media|uploads)\//.test(path) || /(?:^|\/)\.\.?(?:\/|$)|\\/.test(path)) return null;
    } catch { return null; }
  }
  return media.url;
}
export function normalizeZayroviNews(value: unknown): ZayroviNewsSettings | null {
  const settings = record(value);
  const daily = record(settings?.daily);
  if (!daily || typeof daily.showHome !== 'boolean' || typeof daily.showNews !== 'boolean' || !Array.isArray(settings?.entries) || settings.entries.length > ZAYROVI_NEWS_LIMIT) return null;
  const title = localized(daily.title, 80), teaser = localized(daily.teaser, 140), cta = localized(daily.cta, 48), body = localized(daily.body, 1800);
  if (!title || !teaser || !cta || !body) return null;
  const entries: NewsEntry[] = [];
  const ids = new Set<string>(), targets = new Set<string>();
  for (const raw of settings.entries) {
    const item = record(raw);
    if (!item || !idMatch(item.id, 48) || ids.has(item.id) || typeof item.published !== 'boolean') return null;
    const base = { id: item.id, published: item.published };
    ids.add(item.id);
    if (item.kind === 'notice') {
      const title = localized(item.title, 120), body = localized(item.body, 2400), image = imageUrl(item.image);
      if (!title || !body || image === null) return null;
      entries.push({ ...base, kind: 'notice', title, body, image });
    } else {
      if (!isNewsSource(item.kind) || !idMatch(item.targetId, item.kind === 'publication' ? 120 : 150)) return null;
      const key = `${item.kind}:${item.targetId}`;
      if (targets.has(key)) return null;
      targets.add(key);
      entries.push({ ...base, kind: item.kind, targetId: item.targetId });
    }
  }
  return { daily: { showHome: daily.showHome, showNews: daily.showNews, title, teaser, cta, body }, entries };
}
