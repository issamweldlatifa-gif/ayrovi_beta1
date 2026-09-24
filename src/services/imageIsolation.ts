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

const MAX_DIMENSION = 900;
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
/** Écart-type maximal par canal pour considérer le fond « uniforme ». */
const UNIFORM_SPREAD = 10;
/** Distance couleur du fond en dessous de laquelle un pixel est retiré (cœur). */
const CORE_TOLERANCE = 26;
/** Distance où le pixel est à demi-retiré (anticrénelage des bords). */
const FEATHER_TOLERANCE = 44;
/** Au-dessus de ce niveau de gris moyen, on considère le fond « blanc ». */
const WHITE_LEVEL = 241;

export type IsolationKind = 'white' | 'uniform' | 'complex';

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
  const samples: Array<[number, number, number]> = [];
  const band = 3; // on goûte plusieurs pixels d'épaisseur pour résister au bruit JPEG
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
      push(x, y); push(x, height - 1 - y);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64))) {
      push(x, y); push(width - 1 - x, y);
    }
  }
  function push(x: number, y: number) {
    const offset = (y * width + x) * 4;
    if (offset + 2 < data.length) samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  const count = samples.length || 1;
  const mean = samples.reduce((acc, [r, g, b]) => [acc[0] + r / count, acc[1] + g / count, acc[2] + b / count] as [number, number, number], [0, 0, 0]);
  const variance = samples.reduce((acc, [r, g, b]) => acc + ((r - mean[0]) ** 2 + (g - mean[1]) ** 2 + (b - mean[2]) ** 2) / count, 0) / 3;
  const spread = Math.sqrt(variance);
  const color = { r: Math.round(mean[0]), g: Math.round(mean[1]), b: Math.round(mean[2]) };
  if (spread > UNIFORM_SPREAD) return { kind: 'complex', color, spread: Math.round(spread * 10) / 10 };
  if (color.r >= WHITE_LEVEL && color.g >= WHITE_LEVEL && color.b >= WHITE_LEVEL) return { kind: 'white', color, spread: Math.round(spread * 10) / 10 };
  return { kind: 'uniform', color, spread: Math.round(spread * 10) / 10 };
}

/* ── 2. Chroma-key — PURE : le fond uniforme devient transparent ── */
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
  const keyed = chromaKey(image, analysis.color);
  const png = await sharp(keyed, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
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
    if (meta.kind === 'uniform' && meta.file && fs.existsSync(path.join(dir, meta.file))) return meta;
    return meta;
  } catch { /* pas encore en cache */ }
  const buffer = await fetchRemoteImage(rawUrl);
  const result = await isolateBuffer(buffer);
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

export function readCachedPng(file: string): Buffer {
  return fs.readFileSync(path.join(cacheDir(), path.basename(file)));
}
