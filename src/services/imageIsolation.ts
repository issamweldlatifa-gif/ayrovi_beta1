/*
 * ISOLATION D'ARRIÈRE-PLAN (décision client 24/09/2026 — « يعزل خلفية المنتج »).
 * Pipeline serveur, gratuit, avec cache disque :
 *  1. l'image marchand est téléchargée (garde SSRF : hôtes privés bloqués) ;
 *  2. les BORDS sont analysés (fonction pure, testée) ;
 *  3. fond UNIFORME non blanc → chroma-key : les pixels proches de la couleur
 *     du fond deviennent transparents (PNG alpha) → le produit vit sur notre
 *     canvas blanc, quelle que soit la couleur d'origine du studio marchand ;
 *  4. fond BLANC → rien à faire (le mix-blend-mode: multiply de la carte
 *     s'en charge déjà) → redirection vers l'original ;
 *  5. fond COMPLEXE (photo/scène) → hors périmètre du chroma-key : redirection
 *     vers l'original (l'étape AI payante reste une décision à part).
 * Le résultat est mis en cache par URL — on ne paie jamais deux fois le travail.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { segmentBuffer } from './segmentation';

const MAX_DIMENSION = 900;
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
/** Écart-type maximal par canal pour considérer le fond « uniforme ». */
const UNIFORM_SPREAD = 10;
/** Distance couleur du fond en dessous de laquelle un pixel est retiré (cœur). */
const CORE_TOLERANCE = 26;
/** Distance où le pixel est à demi-retiré (anticrénelage des bords). */
export const FEATHER_TOLERANCE = 44;
/** Au-dessus de ce niveau de gris moyen, on considère le fond « blanc ». */
const WHITE_LEVEL = 241;

export type IsolationKind = 'white' | 'uniform' | 'complex' | 'segmented';

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
      push(y * width, y, left); push(y * width + width - 1, y, right);
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
  const uniformCount = sideStats.filter((stat) => stat.uniform).length;
  const reference = medians[0];
  const median = ([0, 1, 2] as const).map((channel) => Math.round(
    medians.filter((_, index) => sideStats[index].uniform)
      .map((values) => values[channel])
      .sort((a, b) => a - b)
      .at(Math.floor(medians.filter((_, index) => sideStats[index].uniform).length / 2)) ?? reference[channel],
  ));
  const color = { r: median[0], g: median[1], b: median[2] };
  if (uniformCount < 3) return { kind: 'complex', color, spread: 255 };
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
      if (segmented) return { kind: 'segmented', png: segmented };
    } catch { /* repli chroma-key ci-dessous */ }
  }
  chromaKeyConnected(image, analysis.color, coreUsed, light ? 26 : FEATHER_TOLERANCE);
  // Dernier filet : des trous transparents ENFERMÉS = fuite confirmée → on tente
  // la segmentation, et sans filet disponible on ne livre RIEN (l'original
  // intact vaut mieux qu'un produit griffé de taches transparentes).
  if (hasEnclosedTransparency(image)) {
    try {
      const segmented = await segmentBuffer(buffer);
      if (segmented) return { kind: 'segmented', png: segmented };
    } catch { /* pas de filet */ }
    return { kind: 'uniform', png: null };
  }
  const png = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { kind: 'uniform', png };
}

/* ── 4. Téléchargement protégé (SSRF) ───────────────────────────── */
export function isPublicHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === '::1' || host === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchRemoteImage(rawUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(rawUrl, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'AyroviBot/1.0 (+https://ayrovi.com)' } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const array = new Uint8Array(await response.arrayBuffer());
    if (array.byteLength > MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
    return Buffer.from(array);
  } finally {
    clearTimeout(timeout);
  }
}

/* ── 5. Cache disque — un URL, un travail ───────────────────────── */
function cacheDir(): string {
  return process.env.AYROVI_ISOLATED_CACHE_DIR || path.resolve(process.cwd(), 'data', 'media-isolated');
}

export interface CachedIsolation {
  kind: IsolationKind;
  file: string | null;
}

export async function getIsolatedImage(rawUrl: string): Promise<CachedIsolation> {
  const key = crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 32);
  const dir = cacheDir();
  const metaPath = path.join(dir, `${key}.meta.json`);
  const pngPath = path.join(dir, `${key}.png`);
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CachedIsolation;
    if (meta.file && fs.existsSync(path.join(dir, meta.file))) return meta;
    return meta;
  } catch { /* pas encore en cache */ }
  const buffer = await fetchRemoteImage(rawUrl);
  let result = await isolateBuffer(buffer);
  // 3ᵉ couche (24/09/2026) : fond COMPLEXE (pièce, miroir, extérieur) → le modèle
  // local u2netp prend le relais. Absence du runtime/modèle → null silencieux et
  // le comportement historique (original intact) s'applique.
  if (result.kind === 'complex' && !result.png) {
    try {
      const segmented = await segmentBuffer(buffer);
      if (segmented) result = { kind: 'segmented', png: segmented };
    } catch { /* repli : original */ }
  }
  const meta: CachedIsolation = { kind: result.kind, file: null };
  if (result.png) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(pngPath, result.png);
    meta.file = `${key}.png`;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  return meta;
}

/** Chauffe le cache en arrière-plan — le premier visiteur ne paie plus le travail. */
export function warmIsolation(urls: Array<string | null | undefined>, limit = 6): void {
  const targets = urls.filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))).slice(0, limit);
  for (const url of targets) {
    void getIsolatedImage(url).catch(() => { /* chauffe best-effort */ });
  }
}

export function readCachedPng(file: string): Buffer {
  return fs.readFileSync(path.join(cacheDir(), path.basename(file)));
}
