import { normalizeMediaLink } from './mediaLinks';

export const NEWS_SOURCES = ['story', 'reel', 'publication', 'article'] as const;
export type NewsSource = typeof NEWS_SOURCES[number];
export const ZAYROVI_NEWS_LIMIT = 20;
export const NEWS_SECTIONS = ['news', 'tools', 'about'] as const;
export const NEWS_TOOLS = ['lens', 'clean', 'aywebs'] as const;
export type NewsSection = typeof NEWS_SECTIONS[number];
export type NewsTool = typeof NEWS_TOOLS[number];
export type NewsCopy = { fr: string; ar: string };
export type NewsEntry = { id: string; published: boolean; section?: NewsSection } & (
  { kind: 'notice'; title: NewsCopy; body: NewsCopy; image: string; summary?: NewsCopy; tool?: NewsTool }
  | { kind: NewsSource; targetId: string }
);
export type ZayroviNewsSettings = {
  daily: { showHome: boolean; showNews: boolean; title: NewsCopy; teaser: NewsCopy; body: NewsCopy; cta: NewsCopy };
  entries: NewsEntry[];
  showGuides?: boolean;
};
export type NewsCard = { id: string; kind: NewsEntry['kind']; title: NewsCopy; image: string; body: NewsCopy; targetId?: string; section?: NewsSection; summary?: NewsCopy; tool?: NewsTool };
export type ZayroviDailyOffer = ZayroviNewsSettings['daily'] & { day: number; percent: number | null };
export type HomeDailyOffer = Pick<ZayroviDailyOffer, 'showHome' | 'title' | 'teaser' | 'cta' | 'percent'>;
export type ZayroviNewsFeed = {
  daily: ZayroviDailyOffer;
  entries: NewsCard[];
  guides?: readonly NewsCard[];
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
  entries: [{ id: 'bienvenue', kind: 'notice', published: true, image: '/media/publications/editorial-lifestyle.jpg',
    title: { fr: 'Bienvenue dans Zayrovi News', ar: 'مرحبا بيك في Zayrovi News' },
    summary: { fr: 'Les nouveautés, les outils et les coulisses de votre expérience Zayrovi.', ar: 'جديد Zayrovi، أدواتنا وكيفاش تستعملهم.' },
    body: {
      fr: '## Un espace pour s’informer\nVous trouverez ici les annonces de Zayrovi et les sélections de la rédaction. Cette rubrique est distincte du fil Social Shopping : on y prend le temps d’expliquer les services et les nouveautés.\n\n## Des outils, étape par étape\nDans Nos outils, découvrez comment utiliser Z Lens, poser une question à Clean et préparer un achat avec AYWEBs. La rubrique À propos explique comment ces services s’articulent avec le catalogue et la fiche produit.',
      ar: '## بلاصة للأخبار\nهنا تلقى إعلانات Zayrovi ومختارات فريق التحرير. القسم هذا مختلف على Social Shopping: فيه نفسّروا بالتفصيل الجديد والخدمات.\n\n## الأدوات خطوة بخطوة\nفي «أدواتنا» تلقى كيفاش تستعمل Z Lens، تسأل Clean وتحضّر شرا مع AYWEBs. في «على Zayrovi» نفسّروا كيفاش الخدمات هاذم يخدموا مع الكاتالوغ وفيشة المنتج.',
    } }],
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
  if (!title || !teaser || !cta || !body || (settings.showGuides !== undefined && typeof settings.showGuides !== 'boolean')) return null;
  const entries: NewsEntry[] = [];
  const ids = new Set<string>(), targets = new Set<string>();
  for (const raw of settings.entries) {
    const item = record(raw);
    if (!item || !idMatch(item.id, 48) || ids.has(item.id) || typeof item.published !== 'boolean') return null;
    if (item.section !== undefined && !NEWS_SECTIONS.includes(item.section as NewsSection)) return null;
    const base = { id: item.id, published: item.published, ...(item.section ? { section: item.section as NewsSection } : {}) };
    ids.add(item.id);
    if (item.kind === 'notice') {
      const title = localized(item.title, 120), body = localized(item.body, 6000), image = imageUrl(item.image);
      if (!title || !body || image === null) return null;
      const summary = item.summary === undefined ? undefined : localized(item.summary, 240);
      if (summary === null || (item.tool !== undefined && !NEWS_TOOLS.includes(item.tool as NewsTool))) return null;
      entries.push({ ...base, kind: 'notice', title, body, image, ...(summary ? { summary } : {}), ...(item.tool ? { tool: item.tool as NewsTool } : {}) });
    } else {
      if (!isNewsSource(item.kind) || !idMatch(item.targetId, item.kind === 'publication' ? 120 : 150)) return null;
      const key = `${item.kind}:${item.targetId}`;
      if (targets.has(key)) return null;
      targets.add(key);
      entries.push({ ...base, kind: item.kind, targetId: item.targetId });
    }
  }
  return { daily: { showHome: daily.showHome, showNews: daily.showNews, title, teaser, cta, body }, entries, ...(typeof settings.showGuides === 'boolean' ? { showGuides: settings.showGuides } : {}) };
}
