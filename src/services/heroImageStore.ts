/**
 * Stockage des images du Hero (et du visuel LENS) : validation, variantes WebP, analyse.
 * Extrait de l'ancien module `heroVisual` (table `hero_visuals`, supprimée le 2026-10-10).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

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
  orientation: 'landscape' | 'portrait' | 'square';
  topLuminance: number;
  bottomLuminance: number;
}

/** تحليل تلقائي: luminance + اللون السائد — يحدد الـoverlay والتكيف (AUTO) */
async function analyzeHeroImage(buffer: Buffer, width: number, height: number): Promise<HeroImageAnalysis> {
  const { data, info } = await sharp(buffer).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  let red = 0, green = 0, blue = 0;
  let topLum = 0, bottomLum = 0;
  for (let y = 0; y < info.height; y += 1) {
    const isTop = y < info.height / 2;
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index], g = data[index + 1], b = data[index + 2];
      red += r; green += g; blue += b;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (isTop) topLum += lum; else bottomLum += lum;
    }
  }
  red /= pixels; green /= pixels; blue /= pixels;
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const brightness: HeroImageAnalysis['brightness'] = luminance < 0.35 ? 'dark' : luminance > 0.6 ? 'light' : 'mid';
  // كشف الاتجاه من الأبعاد الأصلية — لا ratio مفروض على كل الصور
  const ratio = width / height;
  const orientation: HeroImageAnalysis['orientation'] = ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square';
  // إضاءة النصفين — تحدد موضع النص تلقائياً (فوق المنطقة الأدكن)
  const half = pixels / 2;
  const topLuminance = Math.round((topLum / half) * 100) / 100;
  const bottomLuminance = Math.round((bottomLum / half) * 100) / 100;
  return { luminance: Math.round(luminance * 100) / 100, brightness, dominantColor: `#${hex(red)}${hex(green)}${hex(blue)}`, orientation, topLuminance, bottomLuminance };
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
  const analysis = await analyzeHeroImage(normalized, width, height);

  const aspect = width / height;
  const warnings: string[] = [];
  if (width < 1600) warnings.push('Résolution faible — 1600px de large ou plus sont recommandés.');
  if (aspect < 1.15) warnings.push('Image presque carrée/portrait — risque de recadrage vertical sur Desktop.');
  if (aspect > 2.2) warnings.push('Image très large — risque de recadrage sur Mobile.');
  if (file.size > 3 * 1024 * 1024) warnings.push('Fichier lourd — des versions WebP allégées ont été générées automatiquement.');
  return { url: `/uploads/hero/${fileName}`, width, height, format: String(meta.format || ''), srcset, warnings, analysis };
}
