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
  /** Fond du carrousel : couleur de la BORDURE SUPÉRIEURE de la photo (voir `backgroundFromEdge`). */
  background: string;
  /** Luminance relative de la dominante (0..1). */
  luminance: number;
  /** Version du calcul : `PALETTE_VERSION` pour une palette à jour, absente ou plus ancienne sinon. */
  version?: number;
}

/**
 * Version 2 (2026-10-10) : le fond vient de la BORDURE supérieure de la photo, pas
 * de la moyenne de l'image, et n'est plus délavé. Une palette v1 est recalculée au démarrage.
 */
export const PALETTE_VERSION = 2;

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

/** Luminance relative WCAG (0..1) d'une couleur sRGB. */
export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

/**
 * Fond du carrousel = couleur de la bordure supérieure de la photo, pour que la
 * photo se fonde dans le fond (référence Amazon). La teinte et la saturation sont
 * conservées. Seule exception : si la couleur est trop sombre pour l'encre noire
 * de l'en-tête (contraste < 4,5 : luminance relative < 0,18), on l'éclaircit juste
 * assez.
 */
export function backgroundFromEdge(edgeHex: string): string {
  const rgb = hexToRgb(edgeHex);
  if (!rgb) return '#F4F1EC';
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  let current = rgb;
  let lightness = l;
  for (let guard = 0; relativeLuminance(current) < 0.18 && guard < 60; guard += 1) {
    lightness = Math.min(0.97, lightness + 0.01);
    current = hslToRgb(h, s, lightness);
  }
  return rgbToHex(current.r, current.g, current.b);
}

/** Vrai si la palette stockée a été calculée avec la version courante. */
export function isCurrentPalette(raw: unknown): boolean {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Boolean(parsed) && typeof parsed === 'object' && (parsed as { version?: unknown }).version === PALETTE_VERSION;
  } catch {
    return false;
  }
}

/**
 * Fond doux : même teinte que la dominante, saturation maîtrisée, clarté 0.93.
 * Conservé comme repli pour les palettes sans fond (n'est plus utilisé pour l'extraction).
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
    // Bordure supérieure (2 premières lignes de la miniature) : c'est elle que le fond doit reprendre.
    let er = 0, eg = 0, eb = 0, edgePixels = 0;
    for (let y = 0; y < Math.min(2, info.height); y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const index = (y * info.width + x) * info.channels;
        er += data[index];
        eg += data[index + 1];
        eb += data[index + 2];
        edgePixels += 1;
      }
    }
    const edge = edgePixels > 0
      ? rgbToHex(er / edgePixels, eg / edgePixels, eb / edgePixels)
      : rgbToHex(r / pixels, g / pixels, b / pixels);
    r = Math.round(r / pixels);
    g = Math.round(g / pixels);
    b = Math.round(b / pixels);
    const dominant = rgbToHex(r, g, b);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return {
      dominant,
      background: backgroundFromEdge(edge),
      luminance: Math.round(luminance * 100) / 100,
      version: PALETTE_VERSION,
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

/**
 * Au démarrage : recalcule les palettes qui ne sont pas à la version courante
 * (cartes créées avant la version 2). Tolérant : une image manquante est ignorée.
 */
export async function refreshStaleHeroPalettes(db: QatafoDatabase): Promise<number> {
  const rows = db.all<{ id: string; image: string; palette: string }>(
    "SELECT id,image,palette FROM hero_slides WHERE image IS NOT NULL AND image != ''",
  );
  let refreshed = 0;
  for (const row of rows) {
    if (isCurrentPalette(row.palette)) continue;
    await refreshHeroSlidePalette(db, { id: row.id, image: row.image });
    refreshed += 1;
  }
  return refreshed;
}
