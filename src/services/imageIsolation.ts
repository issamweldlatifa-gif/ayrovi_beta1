/* Optional product-photo processing: classify first, isolate only clear studio
 * evidence, retain original URLs on all failures. Never cut lifestyle imagery.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { segmentBuffer } from './segmentation';
import { fetchSafeRemote, parsePublicHttpUrl } from './safeUrl';

const MAX_DIMENSION = 900;
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
/** Écart-type maximal par canal pour considérer le fond « uniforme ». */
/** Distance couleur du fond en dessous de laquelle un pixel est retiré (cœur). */
const CORE_TOLERANCE = 26;
/** Distance où le pixel est à demi-retiré (anticrénelage des bords). */
export const FEATHER_TOLERANCE = 44;
/** Au-dessus de ce niveau de gris moyen, on considère le fond « blanc ». */
const WHITE_LEVEL = 241;

export type IsolationKind = 'white' | 'uniform' | 'complex' | 'segmented' | 'transparent';

export interface EdgeAnalysis {
  kind: IsolationKind;
  color: { r: number; g: number; b: number };
  spread: number;
}

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 4;
}

/* ── 1. Analyse des bords — PURE ─────────────────────────────────── */
export function analyzeEdges(image: RawImage): EdgeAnalysis {
  const { data, width, height } = image;
  const band = 3; // on goûte plusieurs pixels d'épaisseur pour résister au bruit JPEG
  const top: Array<[number, number, number]> = [];
  const bottom: Array<[number, number, number]> = [];
  const left: Array<[number, number, number]> = [];
  const right: Array<[number, number, number]> = [];
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
      push(x, y, top); push(x, height - 1 - y, bottom);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64))) {
      push(x, y, left); push(width - 1 - x, y, right);
    }
  }
  function push(x: number, y: number, into: Array<[number, number, number]>) {
    const offset = (y * width + x) * 4;
    if (offset + 2 < data.length) into.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  // ROBUSTE + PAR CÔTÉ (fix 24/09/2026) : sur un vrai packshot, les pieds du
  // produit TOUCHENT souvent le bord bas — côté bas pollué ne doit pas disqualifier
  // l'image entière (l'ancienne moyenne globale la classait « complexe » et le
  // fond restait non isolé). Verdict : uniforme si ≥3 côtés sur 4 le sont,
  // médiane par côté pour ignorer badges/ombres douces.
  const sides = [top, bottom, left, right];
  const medians = sides.map((side) => ([0, 1, 2] as const).map((channel) => {
    const column = side.map((sample) => sample[channel]).sort((a, b) => a - b);
    return column[Math.floor(column.length / 2)] ?? 0;
  }));
  const tolerance = 18;
  const sideStats = sides.map((side, index) => {
    const median = medians[index];
    const close = side.filter((sample) => Math.max(Math.abs(sample[0] - median[0]), Math.abs(sample[1] - median[1]), Math.abs(sample[2] - median[2])) <= tolerance).length;
    return { median, uniform: side.length > 0 && close / side.length >= 0.9 };
  });
  // Three individually flat sides with THREE DIFFERENT colors are a composed
  // photograph, not a solid background. Require a consensus around one color.
  const agree = (left: number[], right: number[]) =>
    Math.max(...left.map((channel, i) => Math.abs(channel - right[i]))) <= 18;
  const cluster = sideStats.map((reference) => sideStats.filter(stat => stat.uniform
    && reference.uniform && agree(stat.median, reference.median))).sort((a, b) => b.length - a.length)[0] || [];
  if (cluster.length < 3) return { kind: 'complex', color: { r: 0, g: 0, b: 0 }, spread: 255 };
  const median = ([0, 1, 2] as const).map(channel => {
    const values = cluster.map(stat => stat.median[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const color = { r: median[0], g: median[1], b: median[2] };
  if (color.r >= WHITE_LEVEL && color.g >= WHITE_LEVEL && color.b >= WHITE_LEVEL) return { kind: 'white', color, spread: 0 };
  return { kind: 'uniform', color, spread: 0 };
}

/* ── 2. Chroma-key CONNECTÉ (fix 24/09/2026 — «الصورة تتشوه») ─────────────
 * L'ancien chroma-key GLOBAL retirait TOUT pixel proche du fond, y compris le
 * PRODUIT lui-même : un article blanc/gris clair sur fond studio clair devenait
 * un fantôme translucide. Désormais on ne retire que les pixels RELIÉS AU BORD
 * de l'image (flood-fill) : le fond est contigu au cadre, le produit non —
 * un tee-shirt blanc au centre reste donc opaque même s'il a la couleur du fond.
 */
export function chromaKeyConnected(
  image: RawImage,
  background: { r: number; g: number; b: number },
  coreTolerance = CORE_TOLERANCE,
  featherTolerance = FEATHER_TOLERANCE,
): void {
  const { data, width, height } = image;
  const total = width * height;
  const distanceOf = (pixel: number): number => {
    const offset = pixel * 4;
    return Math.max(
      Math.abs(data[offset] - background.r),
      Math.abs(data[offset + 1] - background.g),
      Math.abs(data[offset + 2] - background.b),
    );
  };
  const isBackground = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const push = (pixel: number) => {
    if (!isBackground[pixel] && distanceOf(pixel) <= coreTolerance) {
      isBackground[pixel] = 1;
      queue[tail++] = pixel;
    }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) push(pixel - 1);
    if (x < width - 1) push(pixel + 1);
    if (y > 0) push(pixel - width);
    if (y < height - 1) push(pixel + width);
  }
  // Le fond connecté devient transparent…
  for (let pixel = 0; pixel < total; pixel++) {
    if (isBackground[pixel]) data[pixel * 4 + 3] = 0;
  }
  // …et UNE seule bande de flou sur la vraie frontière (anticrénelage).
  for (let pixel = 0; pixel < total; pixel++) {
    if (isBackground[pixel]) continue;
    const offset = pixel * 4;
    if (data[offset + 3] === 0) continue;
    const x = pixel % width;
    const touchesBackground = (x > 0 && isBackground[pixel - 1])
      || (x < width - 1 && isBackground[pixel + 1])
      || (pixel >= width && isBackground[pixel - width])
      || (pixel + width < total && isBackground[pixel + width]);
    if (!touchesBackground) continue;
    const distance = distanceOf(pixel);
    if (distance <= coreTolerance) data[offset + 3] = 0;
    else if (distance <= featherTolerance) data[offset + 3] = Math.round((data[offset + 3] * (distance - coreTolerance)) / (featherTolerance - coreTolerance));
  }
}

/** Part (0..1) de pixels quasi identiques au fond — détecte les produits clairs sur fond clair. */
export function backgroundLikeShare(image: RawImage, background: { r: number; g: number; b: number }, tolerance = FEATHER_TOLERANCE): number {
  const { data } = image;
  let close = 0;
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 16) {
    count += 1;
    const distance = Math.max(
      Math.abs(data[offset] - background.r),
      Math.abs(data[offset + 1] - background.g),
      Math.abs(data[offset + 2] - background.b),
    );
    if (distance <= tolerance) close += 1;
  }
  return count ? close / count : 0;
}

/**
 * TRIM TRANSPARENT (fix 24/09 18:35 — «المنتج يملأ البطاقة») : بعد العزل،
 * هوامش الشفافية الميتة حول المنتج تُقصّ — البطاقة (object-fit contain على
 * كانفاس ‎#f6f6f6‎) تكبّر المنتج إلى أقصى الحد بدل عرض صورة التاجر بهوامشها
 * الفارغة. لا يغيّر البكسلات داخل المنتج — فقط يحذف الفراغ الميت.
 */
export async function trimTransparentMargins(png: Buffer): Promise<Buffer> {
  try {
    const original = await sharp(png).metadata();
    const trimmed = await sharp(png).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 }).toBuffer();
    const result = await sharp(trimmed).metadata();
    if (!result.width || !result.height || !original.width || !original.height) return png;
    // A thin edge can be the actual product, its shadow or an accessory.
    // Very small detected objects are safer in their original composition.
    if (result.width < original.width * 0.18 || result.height < original.height * 0.18) return png;
    if (result.width > original.width * 0.94 && result.height > original.height * 0.94) return png;
    const padX = Math.max(2, Math.ceil(result.width * 0.045));
    const padY = Math.max(2, Math.ceil(result.height * 0.045));
    return sharp(trimmed).extend({ left: padX, right: padX, top: padY, bottom: padY,
      background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  } catch {
    return png;
  }
}

/**
 * GARDE ANTI-FUITE (fix 24/09/2026 — captures «taches blanches DANS le produit») :
 * des zones transparentes ENFERMÉES dans le produit (aucun contact avec le bord
 * de l'image) signifient que le chroma-key a remonté DANS le produit via une
 * frontière douce — un produit gris sur fond gris, typiquement. Détection pure
 * : composantes 4-voisines des pixels alpha≈0 qui ne touchent PAS le cadre.
 */
export function hasEnclosedTransparency(image: RawImage, minArea = 64): boolean {
  const { data, width, height } = image;
  const total = width * height;
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (seen[start] || data[start * 4 + 3] !== 0) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    let touchesBorder = false;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      size += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        pixel >= width ? pixel - width : -1,
        pixel + width < total ? pixel + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && !seen[neighbour] && data[neighbour * 4 + 3] === 0) {
          seen[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      }
    }
    if (!touchesBorder && size >= minArea) return true;
  }
  return false;
}

/* ── 2bis. Ancien chroma-key GLOBAL (conservé pour les tests purs) ────────── */
export function chromaKey(image: RawImage, background: { r: number; g: number; b: number }): Buffer {
  const { data } = image;
  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = Math.max(
      Math.abs(data[offset] - background.r),
      Math.abs(data[offset + 1] - background.g),
      Math.abs(data[offset + 2] - background.b),
    );
    if (distance <= CORE_TOLERANCE) data[offset + 3] = 0;
    else if (distance <= FEATHER_TOLERANCE) data[offset + 3] = Math.round((data[offset + 3] * (distance - CORE_TOLERANCE)) / (FEATHER_TOLERANCE - CORE_TOLERANCE));
  }
  return data;
}

/* ── 3. Pipeline complet sur un buffer ──────────────────────────── */
export async function isolateBuffer(buffer: Buffer): Promise<{ kind: IsolationKind; png: Buffer | null }> {
  const base = sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 }).rotate();
  const resized = base.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image: RawImage = { data, width: info.width, height: info.height, channels: 4 };
  // A banner, thumbnail, or already transparent packshot is not eligible for
  // destructive background removal. The original remains the fallback.
  const aspect = info.width / info.height;
  if (info.width < 80 || info.height < 80 || aspect > 2.25 || aspect < 0.42) return { kind: 'complex', png: null };
  let transparent = 0;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] < 250) transparent++;
  if (transparent / (info.width * info.height) > 0.03) return { kind: 'transparent', png: null };
  const analysis = analyzeEdges(image);
  if (analysis.kind !== 'uniform') return { kind: analysis.kind, png: null };
  // Adaptatif : produit CLAIR sur fond CLAIR (part élevée à seuil large) → seuils
  // resserrés ; le chroma-key CONNECTÉ ne retire de toute façon que le fond relié
  // au bord, jamais le produit au centre.
  const share = backgroundLikeShare(image, analysis.color);
  const light = share > 0.55;
  const coreUsed = light ? 12 : CORE_TOLERANCE;
  // Garde anti-fantôme (fix 24/09/2026) : si QUASI TOUTE l'image (produit compris)
  // est indistinguable du fond MÊME au seuil serré, isoler reviendrait à effacer
  // le produit → on ne touche à rien, l'original (multiply) est plus fidèle.
  if (backgroundLikeShare(image, analysis.color, coreUsed) > 0.97) return { kind: 'uniform', png: null };
  // Produit CLAIR sur fond CLAIR → le chroma-key, même connecté, risque de
  // remonter dans le produit (les captures «taches blanches») : on privilégie
  // la SEGMENTATION (produit réel) quand elle est disponible.
  if (light) {
    try {
      const segmented = await segmentBuffer(buffer);
      if (segmented) return { kind: 'segmented', png: await trimTransparentMargins(segmented) };
    } catch { /* repli chroma-key ci-dessous */ }
  }
  chromaKeyConnected(image, analysis.color, coreUsed, light ? 26 : FEATHER_TOLERANCE);
  // Dernier filet : des trous transparents ENFERMÉS = fuite confirmée → on tente
  // la segmentation, et sans filet disponible on ne livre RIEN (l'original
  // intact vaut mieux qu'un produit griffé de taches transparentes).
  if (hasEnclosedTransparency(image)) {
    try {
      const segmented = await segmentBuffer(buffer);
      if (segmented) return { kind: 'segmented', png: await trimTransparentMargins(segmented) };
    } catch { /* pas de filet */ }
    return { kind: 'uniform', png: null };
  }
  let foreground = 0;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 175) foreground++;
  if (foreground / (image.width * image.height) < 0.06 || foreground / (image.width * image.height) > 0.94)
    return { kind: 'uniform', png: null };
  const raw = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { kind: 'uniform', png: await trimTransparentMargins(raw) };
}

/* ── 4. Téléchargement protégé (SSRF) ───────────────────────────── */
export function isPublicHttpUrl(rawUrl: string): boolean {
  try { parsePublicHttpUrl(rawUrl); return true; } catch { return false; }
}

/** Resolve public DNS at every redirect, bound the byte stream, and never read
 * an unbounded arrayBuffer into memory. Sharp separately enforces pixel limits.
 */
export async function fetchRemoteImage(rawUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchSafeRemote(rawUrl, { signal: controller.signal,
      headers: { 'user-agent': 'AyroviBot/1.0 (+https://ayrovi.com)' } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
      await response.body?.cancel(); throw new Error('IMAGE_TOO_LARGE');
    }
    const type = response.headers.get('content-type');
    if (type && !/^image\/(?:png|jpeg|webp|avif|gif|tiff|bmp)(?:[;\s]|$)/i.test(type)) {
      await response.body?.cancel(); throw new Error('NOT_AN_IMAGE');
    }
    if (!response.body) throw new Error('EMPTY_IMAGE');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('IMAGE_TOO_LARGE'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    if (!size) throw new Error('EMPTY_IMAGE');
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timeout); }
}

/* ── 5. Cache disque — un URL, un travail ───────────────────────── */
function cacheDir(): string {
  return process.env.AYROVI_ISOLATED_CACHE_DIR || path.resolve(process.cwd(), 'data', 'media-isolated');
}

export interface CachedIsolation {
  kind: IsolationKind;
  file: string | null;
}

const inFlight = new Map<string, Promise<CachedIsolation>>();

export function getIsolatedImage(rawUrl: string): Promise<CachedIsolation> {
  // Preheating, result cards and detail can request the same image concurrently.
  // Share one download and processing attempt instead of racing cache writes.
  const existing = inFlight.get(rawUrl);
  if (existing) return existing;
  const pending = isolateAndCache(rawUrl);
  inFlight.set(rawUrl, pending);
  void pending.finally(() => { if (inFlight.get(rawUrl) === pending) inFlight.delete(rawUrl); }).catch(() => {});
  return pending;
}

async function isolateAndCache(rawUrl: string): Promise<CachedIsolation> {
  if (!isPublicHttpUrl(rawUrl)) throw new Error('INVALID_IMAGE_URL');
  const key = crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 32);
  const dir = cacheDir();
  const metaPath = path.join(dir, `${key}.meta.json`);
  const pngPath = path.join(dir, `${key}.png`);
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CachedIsolation;
    if (!meta.file || fs.existsSync(path.join(dir, path.basename(meta.file)))) return meta;
  } catch { /* not cached or invalid */ }
  const buffer = await fetchRemoteImage(rawUrl);
  const result = await isolateBuffer(buffer);
  // Complex scenes, lifestyle photos and banners are NEVER sent through a
  // saliency model: removing their setting can misrepresent the product.
  const meta: CachedIsolation = { kind: result.kind, file: null };
  fs.mkdirSync(dir, { recursive: true });
  if (result.png) {
    fs.writeFileSync(pngPath, result.png);
    meta.file = `${key}.png`;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  return meta;
}

/** Chauffe le cache en arrière-plan — le premier visiteur ne paie plus le travail. */
export function warmIsolation(urls: Array<string | null | undefined>, limit = 6): void {
  const targets = [...new Set(urls.filter((url): url is string => Boolean(url && isPublicHttpUrl(url))))].slice(0, limit);
  for (const url of targets) {
    void getIsolatedImage(url).catch(() => { /* chauffe best-effort */ });
  }
}

export function readCachedPng(file: string): Buffer {
  return fs.readFileSync(path.join(cacheDir(), path.basename(file)));
}
