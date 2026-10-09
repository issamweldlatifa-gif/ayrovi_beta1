import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { QatafoDatabase } from '../db/database';

/**
 * Palette du carrousel Hero — extraction côté serveur, au moment de l'upload.
 *
 * Pourquoi serveur et pas téléphone : l'extraction (sharp) ne tourne JAMAIS sur
 * le thread UI du mobile, le résultat est mis en cache dans la colonne `palette`
 * de `hero_slides` (identifiant stable = la ligne), et il est recalculé à chaque
 * remplacement d'image — jamais retraité pour une image inchangée.
 *
 * Contrat de `background` : toujours un pastel CLAIR (clarté ~0.93) dérivé de la
 * teinte dominante — la carte Hero pose du texte sombre dessus, dans les deux
 * thèmes. Une extraction qui échoue laisse `palette` vide ⇒ repli neutre côté
 * client (`theme.colors.surface`), jamais de fond cassé.
 */

export interface HeroPalette {
  /** Couleur dominante de l'image (moyenne des pixels), `#rrggbb`. */
  dominant: string;
  /** Fond doux dérivé de la dominante (même teinte, désaturée, éclaircie). */
  background: string;
  /** Luminance relative de la dominante (0..1). */
  luminance: number;
}

export const isHexColor = (value: unknown): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(String(value ?? '').trim());

/* ── Math couleur (pur, testé) ────────────────────────────────────────────── */

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(hex ?? '').trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) value = value.split('').map((char) => char + char).join('');
  const int = parseInt(value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === red) h = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

/**
 * Fond doux : même teinte que la dominante, saturation maîtrisée, clarté 0.93.
 * Une dominante grise (s≈0) produit un neutre clair — jamais de surprise.
 */
export function softBackgroundFromDominant(dominantHex: string): string {
  const rgb = hexToRgb(dominantHex);
  if (!rgb) return '#F4F1EC';
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const softened = hslToRgb(h, Math.min(0.5, Math.max(0.12, s * 0.45)), 0.93);
  return rgbToHex(softened.r, softened.g, softened.b);
}

/* ── Extraction ───────────────────────────────────────────────────────────── */

export async function extractHeroPalette(buffer: Buffer): Promise<HeroPalette | null> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(10, 10, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0, g = 0, b = 0;
    for (let index = 0; index + 2 < data.length; index += info.channels) {
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
    }
    const pixels = info.width * info.height;
    if (pixels <= 0) return null;
    r = Math.round(r / pixels);
    g = Math.round(g / pixels);
    b = Math.round(b / pixels);
    const dominant = rgbToHex(r, g, b);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return {
      dominant,
      background: softBackgroundFromDominant(dominant),
      luminance: Math.round(luminance * 100) / 100,
    };
  } catch {
    return null;
  }
}

/** Lit une palette sérialisée, tolérante : n'importe quoi ⇒ `null`. */
export function parseHeroPalette(raw: unknown): HeroPalette | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (!isHexColor(record.dominant)) return null;
    const dominant = String(record.dominant).trim();
    const background = isHexColor(record.background)
      ? String(record.background).trim()
      : softBackgroundFromDominant(dominant);
    const luminance = typeof record.luminance === 'number' && Number.isFinite(record.luminance)
      ? record.luminance
      : 0;
    return { dominant, background, luminance };
  } catch {
    return null;
  }
}

/* ── Fichier média derrière une URL publique ──────────────────────────────── */

/**
 * `/uploads/…` → `data/uploads/…`, `/media/…` → build public (puis source client
 * en dev). Jamais de chemin hors de ces racines (`..` ⇒ `null`).
 */
export function resolveMediaFilePath(url: unknown): string | null {
  const value = String(url ?? '').trim();
  if (!value.startsWith('/')) return null;
  const clean = value.replace(/^\/+/, '');
  if (!clean || clean.includes('..')) return null;
  if (clean.startsWith('uploads/')) {
    return path.join(process.cwd(), 'data', clean);
  }
  if (clean.startsWith('media/')) {
    const candidates = [
      path.join(process.cwd(), 'public', clean),
      path.join(process.cwd(), 'client', 'public', clean),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }
  return null;
}

/**
 * Recalcule et met en cache la palette d'une slide. Ne jette JAMAIS : une image
 * illisible ou manquante laisse la colonne vide (repli neutre côté client).
 */
export async function refreshHeroSlidePalette(
  db: QatafoDatabase,
  slide: { id: string; image?: string | null },
): Promise<void> {
  try {
    const image = String(slide.image ?? '').trim();
    if (!image) return;
    const filePath = resolveMediaFilePath(image);
    if (!filePath || !fs.existsSync(filePath)) return;
    const palette = await extractHeroPalette(fs.readFileSync(filePath));
    if (!palette) return;
    db.run(
      'UPDATE hero_slides SET palette=?, updated_at=? WHERE id=?',
      JSON.stringify(palette),
      new Date().toISOString(),
      slide.id,
    );
  } catch (error) {
    console.error('[hero-carousel] extraction palette échouée:', error instanceof Error ? error.message : error);
  }
}
