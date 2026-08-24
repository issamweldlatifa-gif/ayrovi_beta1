import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { QatafoDatabase } from '../db/database';

/**
 * نظام Hero — Evergreen Hero Visual
 * المحتوى (Headline/Description) ثابت في الواجهة ولا يُدار من هنا.
 * الخدمة تدير Visual واحداً نشطاً + جدولة مستقبلية + كاش قصير مع إبطال فوري.
 */

export interface HeroVisualImage {
  url: string;
  width: number;
  height: number;
  srcset?: Array<{ url: string; width: number }>;
}

export interface ActiveHeroVisual {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  srcset: Array<{ url: string; width: number }>;
  mobileImageUrl: string;
  mobileSrcset: Array<{ url: string; width: number }>;
  altText: string;
  focalX: number;
  focalY: number;
  mobileFocalX: number;
  mobileFocalY: number;
  overlayMode: 'AUTO' | 'MANUAL';
  overlayStrength: number | null;
  analysis: { luminance: number; brightness: string; dominantColor: string } | null;
  publishedAt: string | null;
  isDefault: boolean;
}

/** الافتراضي — لا يعود الـ Hero فارغاً أو مكسوراً أبداً (المواصفة #20) */
export const DEFAULT_HERO_VISUAL: ActiveHeroVisual = {
  imageUrl: '/media/hero-default.jpg',
  imageWidth: 1312,
  imageHeight: 816,
  srcset: [
    { url: '/media/hero-default_640.webp', width: 640 },
    { url: '/media/hero-default_1024.webp', width: 1024 },
    { url: '/media/hero-default_1600.webp', width: 1600 },
  ],
  mobileImageUrl: '',
  mobileSrcset: [],
  altText: 'Sélectionner un produit en ligne et se faire livrer en Tunisie par AYROVI',
  focalX: 0.5,
  focalY: 0.45,
  mobileFocalX: 0.5,
  mobileFocalY: 0.45,
  overlayMode: 'AUTO',
  overlayStrength: null,
  analysis: { luminance: 0.16, brightness: 'dark', dominantColor: '#302926' },
  publishedAt: null,
  isDefault: true,
};

const CACHE_TTL_MS = 30_000;
let heroCache: { value: ActiveHeroVisual; expiresAt: number } | null = null;

export function invalidateHeroVisualCache(): void {
  heroCache = null;
}

function clampFocal(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function srcsetFor(baseUrl: string, widths: number[]): Array<{ url: string; width: number }> {
  return widths.map((width) => ({ url: baseUrl.replace(/(\.[a-z]+)$/i, `_${width}.webp`), width }));
}

function serializeHeroVisual(row: any): ActiveHeroVisual {
  const widths = [640, 1024, 1600];
  return {
    imageUrl: String(row.image_url || ''),
    imageWidth: Number(row.image_width || 0),
    imageHeight: Number(row.image_height || 0),
    srcset: srcsetFor(String(row.image_url || ''), widths).filter((entry) => entry.url !== row.image_url),
    mobileImageUrl: String(row.mobile_image_url || ''),
    mobileSrcset: row.mobile_image_url ? srcsetFor(String(row.mobile_image_url), widths) : [],
    altText: String(row.alt_text || ''),
    focalX: clampFocal(row.focal_x, 0.5),
    focalY: clampFocal(row.focal_y, 0.5),
    mobileFocalX: clampFocal(row.mobile_focal_x, 0.5),
    mobileFocalY: clampFocal(row.mobile_focal_y, 0.5),
    overlayMode: row.overlay_mode === 'MANUAL' ? 'MANUAL' : 'AUTO',
    overlayStrength: row.overlay_strength === null || row.overlay_strength === undefined ? null : Math.min(1, Math.max(0, Number(row.overlay_strength))),
    analysis: (() => { try { const parsed = JSON.parse(row.analysis_json || 'null'); return parsed && typeof parsed.luminance === 'number' ? parsed : null; } catch { return null; } })(),
    publishedAt: row.published_at || null,
    isDefault: false,
  };
}

/**
 * Resolve Active Hero Visual:
 * 1) Visual منشور ومجدول صالح للفترة الحالية (أعلى priority ثم الأحدث نشراً)
 * 2) وإلا: آخر Visual منشور
 * 3) وإلا: الافتراضي — أبداً null.
 */
export function resolveActiveHeroVisual(db: QatafoDatabase): ActiveHeroVisual {
  if (heroCache && heroCache.expiresAt > Date.now()) return heroCache.value;
  const now = new Date().toISOString();
  const scheduled = db.get<any>(
    `SELECT * FROM hero_visuals WHERE status='PUBLISHED' AND start_date IS NOT NULL AND end_date IS NOT NULL
      AND start_date<=? AND end_date>=? ORDER BY priority DESC, published_at DESC LIMIT 1`,
    now, now,
  );
  const latest = db.get<any>(
    `SELECT * FROM hero_visuals WHERE status='PUBLISHED' ORDER BY published_at DESC LIMIT 1`,
  );
  const resolved = (scheduled || latest) ? serializeHeroVisual(scheduled || latest) : DEFAULT_HERO_VISUAL;
  heroCache = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
  return resolved;
}

/* ============ الرفع والتحقق ============ */

const UPLOADS_DIR = path.resolve(process.cwd(), 'data/uploads/hero');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_WIDTH = 640;

export interface HeroUploadResult {
  url: string;
  width: number;
  height: number;
  format: string;
  srcset: Array<{ url: string; width: number }>;
  warnings: string[];
  analysis: HeroImageAnalysis;
}

export interface HeroImageAnalysis {
  luminance: number;
  brightness: 'dark' | 'mid' | 'light';
  dominantColor: string;
}

/** تحليل تلقائي: luminance + اللون السائد — يحدد الـoverlay والتكيف (AUTO) */
async function analyzeHeroImage(buffer: Buffer): Promise<HeroImageAnalysis> {
  const { data, info } = await sharp(buffer).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  let red = 0, green = 0, blue = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    red += data[index]; green += data[index + 1]; blue += data[index + 2];
  }
  red /= pixels; green /= pixels; blue /= pixels;
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const brightness: HeroImageAnalysis['brightness'] = luminance < 0.35 ? 'dark' : luminance > 0.6 ? 'light' : 'mid';
  return { luminance: Math.round(luminance * 100) / 100, brightness, dominantColor: `#${hex(red)}${hex(green)}${hex(blue)}` };
}

/** قوة الـOverlay المحسوبة تلقائياً من الإضاءة */
export function autoOverlayStrength(analysis: HeroImageAnalysis | null | undefined): number {
  if (!analysis) return 0.3;
  if (analysis.brightness === 'dark') return 0.18;
  if (analysis.brightness === 'light') return 0.5;
  return 0.32;
}

function saveVariants(buffer: Buffer, baseName: string): Promise<Array<{ url: string; width: number }>> {
  const widths = [640, 1024, 1600];
  return Promise.all(widths.map(async (width) => {
    const fileName = `${baseName}_${width}.webp`;
    await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOADS_DIR, fileName));
    return { url: `/uploads/hero/${fileName}`, width };
  }));
}

/** يتحقق من الصورة (نوع/أبعاد/سلامة) ويخزّنها مع نسخ WebP متجاوبة — بلا تخزين داخل قاعدة البيانات */
export async function storeHeroImage(file: Express.Multer.File, visualId: string, role: 'desktop' | 'mobile'): Promise<HeroUploadResult> {
  if (!file || !file.buffer || !file.buffer.length) throw new Error('Aucun fichier reçu.');
  if (file.size > MAX_BYTES) throw new Error('Image trop lourde (maximum 8 Mo).');
  if (!ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) throw new Error('Format non supporté — utilisez JPEG, PNG, WebP ou AVIF.');
  const meta = await (async () => {
    try { return await sharp(file.buffer).metadata(); } catch { return null; }
  })();
  if (!meta) throw new Error('Fichier image invalide ou corrompu.');
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) throw new Error('Dimensions d’image illisibles.');
  if (width < MIN_WIDTH) throw new Error(`Largeur insuffisante (${width}px) — minimum ${MIN_WIDTH}px.`);

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const stamp = Date.now().toString(36);
  const baseName = `${role === 'mobile' ? 'm' : 'd'}_${visualId}_${stamp}`;
  // إعادة ترميز موحدة: تنظف الميتاداتا وتوحّد الصيغة (أمان + تناسق)
  const normalized = await sharp(file.buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const fileName = `${baseName}.jpg`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), normalized);
  const srcset = await saveVariants(normalized, baseName);
  const analysis = await analyzeHeroImage(normalized);

  const aspect = width / height;
  const warnings: string[] = [];
  if (width < 1600) warnings.push('Résolution faible — 1600px de large ou plus sont recommandés.');
  if (aspect < 1.15) warnings.push('Image presque carrée/portrait — risque de recadrage vertical sur Desktop.');
  if (aspect > 2.2) warnings.push('Image très large — risque de recadrage sur Mobile.');
  if (file.size > 3 * 1024 * 1024) warnings.push('Fichier lourd — des versions WebP allégées ont été générées automatiquement.');
  return { url: `/uploads/hero/${fileName}`, width, height, format: String(meta.format || ''), srcset, warnings, analysis };
}

/** حذف ملفات الـ visual (الأصل + النسخ) — best-effort */
export function deleteHeroVisualFiles(imageUrl: string, mobileImageUrl: string): void {
  for (const url of [imageUrl, mobileImageUrl]) {
    if (!url || !url.startsWith('/uploads/hero/')) continue;
    const base = path.basename(url).replace(/\.[a-z0-9]+$/i, '');
    try {
      const entries = fs.readdirSync(UPLOADS_DIR).filter((entry) => entry.startsWith(`${base}_`) || entry === path.basename(url));
      for (const entry of entries) fs.unlinkSync(path.join(UPLOADS_DIR, entry));
    } catch { /* تجاهل */ }
  }
}

export function newHeroVisualId(): string {
  return `hero_${randomUUID()}`;
}

/** تواريخ الجدولة: ISO بداية/نهاية اليوم، مع تحقق الترتيب */
export function normalizeSchedule(startRaw: unknown, endRaw: unknown): { startDate: string | null; endDate: string | null } {
  const toStartOfDay = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  const toEndOfDay = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value.length <= 10 ? `${value}T23:59:59.999Z` : value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  let startDate = toStartOfDay(startRaw);
  let endDate = toEndOfDay(endRaw);
  if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];
  return { startDate, endDate };
}
