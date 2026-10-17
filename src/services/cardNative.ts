/*
 * CARTE PRODUIT « NATIVE » (16/10/2026) — montrer la photo marchande TELLE QUELLE
 * quand c'est visuellement propre, et réserver l'isolation d'arrière-plan aux cas
 * où elle apporte clairement quelque chose.
 *
 * Décision (commande client du 16/10/2026) :
 *   • fond BLANC  → recadrage sur le contenu (trim couleur) + canvas blanc ;
 *   • fond UNIFORME (gris clair…) → trim + canvas = couleur du bord de la photo ;
 *   • fond COMPLEXE (coloré, décor) → photo ENTIÈRE (contain, aucun rognage) posée
 *     sur un fond obtenu en étirant/floutant ses propres bords : aucun rectangle
 *     visible, aucune isolation ;
 *   • fond complexe ET photo très loin du ratio 9/13 (le contain laisserait de
 *     grandes bandes) → cas D : on rend la main à la composition (isolation),
 *     seule situation où l'isolation reste justifiée.
 *
 * Ce module ne connaît NI la segmentation NI PhotoRoom : structurellement, aucune
 * opération d'isolation ne peut partir d'ici (un test de contrat le vérifie).
 * Tout échec renvoie `{ file: null }` : la route retombe sur la composition puis
 * sur le letterbox — jamais d'image cassée, jamais d'hôte externe exposé.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { pruneDiskCache } from './diskCache';
import { analyzeEdges, fetchRemoteImage, type IsolationKind, type RawImage } from './imageIsolation';
import {
  frameSizeFor, MAX_UPSCALE, OPTICAL_CENTER_Y, SAFE_BOTTOM, SAFE_INLINE, SAFE_TOP, type Size,
} from './imageComposition';
import { UnsafeUrlError } from './safeUrl';

/** Version du rendu : changer cette valeur invalide le cache disque. */
export const NATIVE_CARD_VERSION = 1;

/** Canvas imposé par la commande client pour les photos à fond blanc. */
export const WHITE_CANVAS = { r: 255, g: 255, b: 255 } as const;

/**
 * En dessous de cette couverture du cadre par un contain, le fond complexe part
 * en composition (cas D) : les bandes seraient plus grandes que le produit.
 */
export const MIN_CONTAIN_COVERAGE = 0.55;

/** Écart par canal au-delà duquel un pixel compte comme « contenu » (trim). */
export const TRIM_TOLERANCE = 24;

export type NativeMode = 'trim' | 'extend';

export interface NativePlan {
  mode: NativeMode;
  canvas: { r: number; g: number; b: number };
}

export interface NativeCardMeta {
  file: string | null;
  mode?: NativeMode;
  kind?: IsolationKind | 'unreadable';
  type?: 'jpeg';
  checks?: Record<string, boolean>;
}

/** Part du cadre couverte par un contain (photo entière, aucun rognage). */
export function containCoverage(imageAspect: number, frameAspect: number): number {
  if (!(imageAspect > 0) || !(frameAspect > 0)) return 0;
  return Math.min(imageAspect / frameAspect, frameAspect / imageAspect);
}

/**
 * Plan d'affichage SANS isolation, depuis le verdict d'analyse des bords.
 * `null` = cas D : l'isolation (composition) reste visiblement meilleure.
 */
export function planNativeCard(
  kind: IsolationKind,
  edgeColor: { r: number; g: number; b: number },
  imageAspect: number,
  frameAspect: number,
): NativePlan | null {
  if (kind === 'white') return { mode: 'trim', canvas: { ...WHITE_CANVAS } };
  if (kind === 'uniform') return { mode: 'trim', canvas: { ...edgeColor } };
  if (kind === 'complex' || kind === 'segmented') {
    if (containCoverage(imageAspect, frameAspect) >= MIN_CONTAIN_COVERAGE) {
      return { mode: 'extend', canvas: { ...edgeColor } };
    }
  }
  return null;
}

export interface NativeBounds {
  x0: number; y0: number; x1: number; y1: number; width: number; height: number; empty: boolean;
}

/**
 * Boîte englobante du CONTENU : pixels qui s'écartent de la couleur de fond.
 * Analyse locale et gratuite (un parcours des pixels) — pas un service payant.
 * C'est elle qui retire les grands vides internes des photos studio (cas 6).
 */
export function colorBounds(
  image: RawImage,
  background: { r: number; g: number; b: number },
  tolerance = TRIM_TOLERANCE,
): NativeBounds {
  const { data, width, height } = image;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(data[i] - background.r);
      const dg = Math.abs(data[i + 1] - background.g);
      const db = Math.abs(data[i + 2] - background.b);
      if (Math.max(dr, dg, db) <= tolerance) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0, empty: true };
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, empty: false };
}

export interface NativeRender {
  body: Buffer;
  mode: NativeMode;
  checks: Record<string, boolean>;
}

/**
 * Rendu de la carte native dans le cadre officiel 9/13.
 *  • trim  : le contenu rogné au plus juste est posé (facteur unique, ratio
 *    conservé, jamais d'agrandissement au-delà de `MAX_UPSCALE`) sur un canvas
 *    uni — le produit remplit la zone sûre, les vides internes disparaissent ;
 *  • extend : la photo ENTIÈRE est centrée (contain) sur un fond obtenu en
 *    couvrant le cadre avec la photo fortement floutée : les bords raccordent,
 *    aucun rectangle visible, aucun pixel rogné.
 */
export async function renderNativeCard(
  buffer: Buffer,
  width: number,
  plan: NativePlan,
): Promise<NativeRender | null> {
  try {
    const frame = frameSizeFor(width);
    const source = sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 }).rotate();
    const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image: RawImage = { data, width: info.width, height: info.height, channels: 4 };
    if (image.width < 8 || image.height < 8) return null;

    if (plan.mode === 'trim') {
      const bounds = colorBounds(image, plan.canvas);
      const box = bounds.empty
        ? { x0: 0, y0: 0, width: image.width, height: image.height }
        : { x0: bounds.x0, y0: bounds.y0, width: bounds.width, height: bounds.height };
      const safeW = Math.round(frame.width * (1 - 2 * SAFE_INLINE));
      const safeH = Math.round(frame.height * (1 - SAFE_TOP - SAFE_BOTTOM));
      // Facteur UNIQUE (ratio conservé) et borné : on réduit la place plutôt que
      // d'inventer des pixels (commande client : aucune perte de qualité).
      const scale = Math.min(safeW / box.width, safeH / box.height, MAX_UPSCALE);
      const placeW = Math.max(1, Math.round(box.width * scale));
      const placeH = Math.max(1, Math.round(box.height * scale));
      const left = Math.round((frame.width - placeW) / 2);
      const top = Math.round((frame.height - placeH) * OPTICAL_CENTER_Y);
      const product = await sharp(data, { raw: { width: image.width, height: image.height, channels: 4 } })
        .extract({ left: box.x0, top: box.y0, width: box.width, height: box.height })
        .resize({ width: placeW, height: placeH, fit: 'fill' })
        .flatten({ background: plan.canvas })
        .png() // l'entrée est « raw » : sans format explicite sharp ressortirait du raw
        .toBuffer();
      const body = await sharp({
        create: { width: frame.width, height: frame.height, channels: 3, background: plan.canvas },
      })
        .jpeg()
        .toBuffer()
        .then((canvas) => sharp(canvas)
          .composite([{ input: product, left, top }])
          .jpeg({ quality: 84 })
          .toBuffer());
      return {
        body,
        mode: 'trim',
        checks: {
          no_crop: true,
          aspect_preserved: true,
          inside_safe_area: placeW <= safeW && placeH <= safeH,
          no_over_upscale: scale <= MAX_UPSCALE + 1e-6,
        },
      };
    }

    // extend : fond = la photo couvrante floutée, photo nette ENTIÈRE par-dessus.
    const backdrop = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: frame.width, height: frame.height, fit: 'cover' })
      .blur(Math.max(6, Math.round(frame.width * 0.06)))
      .toBuffer();
    const photo = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: frame.width, height: frame.height, fit: 'inside' })
      .toBuffer();
    const photoMeta = await sharp(photo).metadata();
    const pw = photoMeta.width ?? frame.width;
    const ph = photoMeta.height ?? frame.height;
    const body = await sharp(backdrop)
      .composite([{ input: photo, left: Math.round((frame.width - pw) / 2), top: Math.round((frame.height - ph) / 2) }])
      .jpeg({ quality: 84 })
      .toBuffer();
    return {
      body,
      mode: 'extend',
      checks: { no_crop: true, aspect_preserved: true, full_image: true },
    };
  } catch {
    return null;
  }
}

/* ── Cache disque + point d'entrée ─────────────────────────────────────────── */

export function nativeCacheDir(): string {
  return process.env.AYROVI_NATIVE_CARD_CACHE_DIR || path.resolve(process.cwd(), 'data', 'media-native');
}

export function readNativeCard(file: string): Buffer {
  return fs.readFileSync(path.join(nativeCacheDir(), path.basename(file)));
}

function cacheKey(rawUrl: string, width: number): string {
  return crypto.createHash('sha256').update(`${width}|native${NATIVE_CARD_VERSION}|${rawUrl}`).digest('hex').slice(0, 32);
}

export interface NativeCardOptions {
  /** Injecté par les tests : aucun réseau réel. */
  fetcher?: (url: string) => Promise<Buffer>;
}

/**
 * Carte native pour une image marchande distante : analyse des bords (une seule
 * fois, mise en cache avec le verdict), rendu 9/13 sans isolation, cache disque
 * par (URL, largeur). `{ file: null }` ⇒ la route compose (cas D) ou letterbox.
 */
export async function getNativeCard(
  rawUrl: string,
  width: number,
  options: NativeCardOptions = {},
): Promise<NativeCardMeta> {
  if (process.env.AYROVI_NATIVE_CARD === 'false') return { file: null };
  const key = cacheKey(rawUrl, width);
  const dir = nativeCacheDir();
  const metaPath = path.join(dir, `${key}.meta.json`);
  const jpgPath = path.join(dir, `${key}.jpg`);
  try {
    const cached = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as NativeCardMeta;
    if (cached.file == null) return cached;
    if (cached.file === `${key}.jpg` && fs.existsSync(jpgPath)) return cached;
    fs.unlinkSync(metaPath);
  } catch { /* pas encore en cache */ }

  let meta: NativeCardMeta = { file: null };
  try {
    const buffer = options.fetcher ? await options.fetcher(rawUrl) : await fetchRemoteImage(rawUrl);
    const { data, info } = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
      .rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const analysis = analyzeEdges({ data, width: info.width, height: info.height, channels: 4 });
    const frame = frameSizeFor(width);
    const plan = planNativeCard(analysis.kind, analysis.color, info.width / info.height, frame.width / frame.height);
    meta = { file: null, kind: analysis.kind };
    if (plan) {
      const rendered = await renderNativeCard(buffer, width, plan);
      if (rendered) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(jpgPath, rendered.body);
        meta = { file: `${key}.jpg`, mode: rendered.mode, kind: analysis.kind, type: 'jpeg', checks: rendered.checks };
      }
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError || (error as { code?: string })?.code === 'UNSAFE_URL') throw error;
    meta = { file: null, kind: 'unreadable' };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    pruneDiskCache(dir, { maxBytes: 192 * 1024 * 1024, maxFiles: 4_000 });
  } catch { /* cache best-effort */ }
  return meta;
}
