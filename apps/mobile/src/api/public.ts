/**
 * المحتوى العام للصفحة الرئيسية — نفس نقاط النهاية اللي يستهلكها الموقع.
 *
 * كل دالة هِنا **تتحقّق من شكل البيانات** قبل ما ترجّعها: خادم يرجّع غلافاً
 * ناجحاً بمحتوى مغلوط لازم يفشل بصوت عالي، موش يرسم شاشة فارغة.
 */
import { apiGet, apiGetEnvelope, apiSendData, type RequestOptions } from './client';
import { ApiError } from './errors';

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

/* ── جاهزية الخادم: «أي كود قاعد يخدم فعلاً» ──────────────────────────────── */

/**
 * `/api/ready` **موش** داخل غلاف `{data:…}` (كيما AYWEBs): نقراوه بـ
 * `apiGetEnvelope`. اللي يعنينا هنا: `commit` — الرقم اللي يفرّق بين «تحدّث
 * التطبيق» و«تحدّث الخادم». `local` تعني خادم تشغيل محلي، موش منشور من Git.
 */
export interface ServerReadiness {
  status: string;
  database: string;
  version: string;
  commit: string;
  /** الفرع المنشور (`unknown` كان الخادم ما يعلنش عليه) — «أي كود يخدم؟». */
  branch: string;
}

export function parseServerReadiness(payload: unknown): ServerReadiness | null {
  if (!isRecord(payload)) return null;
  const status = str(payload.status).trim();
  if (!status) return null;
  return {
    status,
    database: str(payload.database).trim(),
    version: str(payload.version).trim(),
    commit: str(payload.commit).trim(),
    branch: str(payload.branch).trim(),
  };
}

/**
 * هل الخادم هذا يعرف عميل الموبايل؟
 *
 * `x-ayrovi-client` (وإعطاء `session_token` في جسم الردّ) موجود في الفرع وحدو.
 * الخادم القديم ما عندوش حتى حقل `branch` في `/api/ready` — يعني **حضور
 * الحقل** هو العلامة: كان غايب، الدخول غادي يفشل برسالة `SESSION_NOT_ISSUED`.
 *
 * `unknown` = ما خواناش الخادم (طايح، ولا ما لمسناهش) — نسكتو، والضغطة على
 * «دخول» تقول الحقيقة أحسن من لافتة مخمّنة.
 */
export type MobileSessionSupport = 'supported' | 'legacy' | 'unknown';

export function mobileSessionSupport(readiness: ServerReadiness | null | undefined): MobileSessionSupport {
  if (!readiness) return 'unknown';
  if (!readiness.status) return 'unknown';
  // الحقل موجود (حتى بـ`unknown`) ⇒ الخادم فيه كود الفرع ⇒ الدخول مدعوم.
  return readiness.branch ? 'supported' : 'legacy';
}

/** `malformed` كان الخادم جاوب بلا الحقول اللي نعتمدوا عليها — بلا تخمين. */
export async function fetchServerReadiness(options?: RequestOptions): Promise<ServerReadiness> {
  const payload = await apiGetEnvelope<unknown>('/api/ready', options);
  const parsed = parseServerReadiness(payload);
  if (!parsed) throw new ApiError('malformed', 'GET /api/ready : réponse inattendue.');
  return parsed;
}

/* ── Carrousel Hero (piloté Admin, servi par `/api/public/hero-*`) ─────────── */

/**
 * Une carte du carrousel, telle que la renvoie `GET /api/public/hero-slides`.
 * Les deux langues voyagent : le choix se fait à l'affichage, pas au cache.
 */
export interface HeroSlide {
  id: string;
  image: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  cta: string;
  ctaAr: string;
  /** Route interne (`/…`) ou URL `https://` — vide si aucune destination valide. */
  href: string;
  destinationType: string;
  /** Couleur de fond adaptative (palette extraite serveur) — vide = repli thème. */
  background: string;
  dominant: string;
  /** Visuel embarqué dans l'APK (mode démo) — prioritaire sur `image`. */
  localImage?: number;
}

/** Réglages du carrousel (`GET /api/public/hero-carousel-settings`). */
export interface HeroCarouselSettings {
  enabled: boolean;
  maxCards: number;
  autoplay: boolean;
  autoplayIntervalMs: number;
  transitionMs: number;
  paginationVisible: boolean;
}

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  (Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback);

/**
 * Lien de carte : défense en profondeur. Le serveur ne publie que des routes
 * du contrat fermé, mais le client ne fait pas confiance à un champ `href`:
 * interne (`/…`) ou `https://` — jamais `javascript:`, jamais de protocole
 * douteux. Sans lien valide ⇒ chaîne vide ⇒ la carte n'est pas cliquable.
 */
export function safeHeroHref(href: unknown): string {
  const value = str(href).trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\/[^\s]+$/i.test(value) ? value : '';
}

/** Cartes publiables uniquement : un `id` et un `href` sûr — jamais de carte morte. */
export function parseHeroSlides(payload: unknown): HeroSlide[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    if (!isRecord(row)) return [];
    const id = idOf(row.id);
    const href = safeHeroHref(row.href);
    if (!id || !href) return [];
    return [{
      id,
      image: str(row.image).trim(),
      title: str(row.title),
      titleAr: str(row.titleAr),
      subtitle: str(row.subtitle),
      subtitleAr: str(row.subtitleAr),
      cta: str(row.cta).trim(),
      ctaAr: str(row.ctaAr).trim(),
      href,
      destinationType: str(row.destinationType).trim(),
      background: str(row.background).trim(),
      dominant: str(row.dominant).trim(),
    }];
  });
}

/**
 * Réglages : les bornes sont celles du serveur (Admin clamp déjà), le client
 * re-clamp par sécurité — un dépassement ne doit jamais casser le rendu.
 * Valeurs par défaut = « carrousel actif, sobre, sans autoplay ».
 */
export function parseHeroCarouselSettings(payload: unknown): HeroCarouselSettings {
  if (!isRecord(payload)) {
    return {
      enabled: true, maxCards: 6, autoplay: false,
      autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true,
    };
  }
  return {
    enabled: payload.enabled !== false,
    maxCards: clamp(num(payload.maxCards, 6), 1, 12, 6),
    autoplay: payload.autoplay === true,
    autoplayIntervalMs: clamp(num(payload.autoplayIntervalMs, 5000), 1000, 60000, 5000),
    transitionMs: clamp(num(payload.transitionMs, 300), 100, 2000, 300),
    paginationVisible: payload.paginationVisible !== false,
  };
}

export async function fetchHeroSlides(options?: RequestOptions): Promise<HeroSlide[]> {
  const { data } = await apiGet<unknown>('/api/public/hero-slides', options);
  return parseHeroSlides(data);
}

export async function fetchHeroCarouselSettings(options?: RequestOptions): Promise<HeroCarouselSettings> {
  const { data } = await apiGet<unknown>('/api/public/hero-carousel-settings', options);
  return parseHeroCarouselSettings(data);
}

/**
 * Télémétrie du carrousel (impression / clic) — **fire-and-forget** : mesurer
 * ne doit jamais casser l'expérience, ni ralentir le rendu. Le serveur répond
 * toujours 200 ; en cas d'échec réseau, on avale silencieusement.
 */
export function trackHeroEvent(
  cardId: string,
  event: 'impression' | 'click',
  destinationType = '',
  locale = '',
): void {
  if (!cardId) return;
  apiSendData('POST', '/api/public/hero-events', {
    body: { cardId, event, destinationType, locale },
  }).catch(() => {});
}
