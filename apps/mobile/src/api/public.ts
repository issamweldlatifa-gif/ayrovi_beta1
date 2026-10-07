/**
 * المحتوى العام للصفحة الرئيسية — نفس نقاط النهاية اللي يستهلكها الموقع.
 *
 * كل دالة هِنا **تتحقّق من شكل البيانات** قبل ما ترجّعها: خادم يرجّع غلافاً
 * ناجحاً بمحتوى مغلوط لازم يفشل بصوت عالي، موش يرسم شاشة فارغة.
 */
import { apiGet, type RequestOptions } from './client';

/* ── الأنواع (مطابقة لما يرسله `src/public/routes.ts`) ─────────────────────── */

export interface HeroContent {
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  accentColor: string;
  elementOrder: string;
  enabled: boolean;
}

export interface HeroVisual {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  srcset: Array<{ url: string; width: number }>;
  mobileImageUrl: string;
  altText: string;
  focalX: number;
  focalY: number;
  /** `true` = aucune visuelle publiée : le visuel par défaut du serveur. */
  isDefault: boolean;
}

export interface NavLink {
  id: string;
  destination: string;
  href: string;
  labelFr: string;
  labelAr: string;
  order: number;
}

export interface Announcement {
  id: string;
  text: string;
}

/* ── التحقّق ───────────────────────────────────────────────────────────────── */

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Identifiant venu de SQLite : entier ou texte, toujours rendu en chaîne. */
const idOf = (value: unknown): string =>
  (typeof value === 'string' ? value
    : typeof value === 'number' && Number.isFinite(value) ? String(value)
      : '');
const num = (value: unknown, fallback: number): number =>
  (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** يحوّل صفّ الـ hero كما هو مُعرَّف في القاعدة، أو `null` إذا الخادم ما عندوش محتوى. */
export function parseHeroContent(payload: unknown): HeroContent | null {
  if (!isRecord(payload)) return null;
  return {
    eyebrow: str(payload.eyebrow).trim(),
    title: str(payload.title),
    highlight: str(payload.highlight).trim(),
    description: str(payload.description).trim(),
    ctaLabel: str(payload.ctaLabel).trim(),
    ctaUrl: str(payload.ctaUrl).trim(),
    accentColor: str(payload.accentColor).trim(),
    elementOrder: str(payload.elementOrder).trim(),
    // `enabled` غائب = مفعّل: الغياب ما هوش تعطيل.
    enabled: payload.enabled !== false,
  };
}

export function parseHeroVisual(payload: unknown): HeroVisual | null {
  if (!isRecord(payload)) return null;
  const imageUrl = str(payload.imageUrl).trim();
  if (!imageUrl) return null;
  const srcset = Array.isArray(payload.srcset)
    ? payload.srcset.flatMap((entry) => (isRecord(entry) && str(entry.url).trim()
      ? [{ url: str(entry.url).trim(), width: num(entry.width, 0) }]
      : []))
    : [];
  return {
    imageUrl,
    imageWidth: num(payload.imageWidth, 0),
    imageHeight: num(payload.imageHeight, 0),
    srcset,
    mobileImageUrl: str(payload.mobileImageUrl).trim(),
    altText: str(payload.altText).trim(),
    focalX: num(payload.focalX, 0.5),
    focalY: num(payload.focalY, 0.45),
    isDefault: payload.isDefault === true,
  };
}

/**
 * روابط الشريط العام: نقبل كان ما له معنى — مسار داخلي وليبل واحد على الأقل.
 * نفس شرط الموقع (`PublicPageLinks`) حتى لا يظهر زر لا يوصّل لشي.
 */
export function parseNavigation(payload: unknown): NavLink[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    if (!isRecord(row)) return [];
    const href = str(row.href).trim();
    const labelFr = str(row.labelFr).trim();
    const labelAr = str(row.labelAr).trim() || labelFr;
    if (!href.startsWith('/') || !(labelFr || labelAr)) return [];
    return [{
      id: idOf(row.id),
      destination: str(row.destination),
      href,
      labelFr: labelFr || labelAr,
      labelAr,
      order: num(row.order, 0),
    }];
  }).sort((a, b) => a.order - b.order);
}

export function parseAnnouncements(payload: unknown): Announcement[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    if (!isRecord(row)) return [];
    const text = str(row.text).trim();
    return text ? [{ id: idOf(row.id), text }] : [];
  });
}

/* ── نقاط النهاية ─────────────────────────────────────────────────────────── */

export async function fetchHeroContent(options?: RequestOptions): Promise<HeroContent | null> {
  const { data } = await apiGet<unknown>('/api/public/hero-content', options);
  return parseHeroContent(data);
}

export async function fetchHeroVisual(options?: RequestOptions): Promise<HeroVisual | null> {
  const { data } = await apiGet<unknown>('/api/public/hero/active', options);
  return parseHeroVisual(data);
}

export async function fetchNavigation(options?: RequestOptions): Promise<NavLink[]> {
  const { data } = await apiGet<unknown>('/api/public/navigation', options);
  return parseNavigation(data);
}

export async function fetchAnnouncements(options?: RequestOptions): Promise<Announcement[]> {
  const { data } = await apiGet<unknown>('/api/public/announcement-messages', options);
  return parseAnnouncements(data);
}
