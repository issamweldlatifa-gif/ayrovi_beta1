/*
 * COMPOSITION D'IMAGE PRODUIT — MOTEUR GÉNÉRAL (phase 2, 25/09/2026).
 *
 * Origine : prototype visuel validé sur 6 cas réels (chaussure, sac, vêtement
 * porté, fond complexe multi-pièces, fond sombre, perspective 3/4).
 * Chaîne prouvée, appliquée ici à TOUTE image produit (Lens / SerpApi / CMS) :
 *
 *   Source → Isolation → Transparent Asset → AYROVI Mockup → Smart Scale
 *          → Smart Position → Final Card
 *
 * PRINCIPES NON NÉGOCIABLES (chaque règle est générique, exprimée en RATIOS) :
 *   • un SEUL facteur d'échelle pour X et Y → l'aspect ratio est conservé par
 *     construction (jamais d'étirement, jamais d'écrasement) ;
 *   • « contain-fit » dans une zone de sécurité → le rognage est structurellement
 *     impossible, aucune exception par image n'est nécessaire ;
 *   • aucune dimension codée en dur liée à une image particulière ;
 *   • le fond (mockup) et le produit restent DEUX COUCHES séparées jusqu'au
 *     composite final ;
 *   • si la source est trop petite, on réduit la RÉSOLUTION DE RENDU plutôt que
 *     d'interpoler au-delà de MAX_UPSCALE : même cadrage, zéro flou inventé.
 *
 * Les fonctions de géométrie sont PURES (aucune I/O) : elles sont testées
 * unitairement dans tests/image-composition.test.ts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchRemoteImage, isolateBuffer } from './imageIsolation';
import { segmentBuffer } from './segmentation';

/* ── Contrat visuel AYROVI — miroir de client/src/ayrovix/components/lens-product-card.css ──
 * .lens-card-media { aspect-ratio: 9/13; border-radius: 16..18px; background: #F0F2F2 }
 * Toute évolution du CSS doit être répercutée ici (et le test le vérifie). */
export const CARD_ASPECT_WIDTH = 9;
export const CARD_ASPECT_HEIGHT = 13;
export const CARD_CANVAS = { r: 0xf0, g: 0xf2, b: 0xf2 } as const;
/** 18 px pour un cadre de 760 px de large → ratio pur, valable à toute résolution. */
export const CARD_RADIUS_RATIO = 18 / 760;

/* ── Règles de composition (RATIOS, jamais des pixels) ───────────────────── */
/** Marge latérale de sécurité : 8,5 % de la largeur du cadre. */
export const SAFE_INLINE = 0.085;
/** Marge haute : 7 %. */
export const SAFE_TOP = 0.07;
/** Marge basse : 9 % (respiration optique — ce n'est PAS un recadrage). */
export const SAFE_BOTTOM = 0.09;
/** Centre optique vertical : légèrement au-dessus du centre géométrique. */
export const OPTICAL_CENTER_Y = 0.48;
/** Correction partielle vers le barycentre alpha (1 = correction totale → instable). */
export const CENTROID_PULL = 0.35;
/** Garde qualité : au-delà, on rend plus petit plutôt que d'interpoler. */
export const MAX_UPSCALE = 3.2;
/** Largeur de rendu idéale du cadre média. */
export const IDEAL_FRAME_WIDTH = 900;
/** Ombre de contact : sigma en part de la hauteur du produit, puis opacité. */
export const SHADOW_SIGMA_RATIO = 0.035;
export const SHADOW_OPACITY = 0.16;

export interface Size { width: number; height: number }
export interface Bounds { x0: number; y0: number; x1: number; y1: number; width: number; height: number; empty: boolean }

/* ══════════════════════════════════════════════════════════════════════════
 * 1. GÉOMÉTRIE PURE
 * ════════════════════════════════════════════════════════════════════════ */

/** Bounding box RÉELLE du produit (alpha > seuil) — base de tout le cadrage. */
export function alphaBounds(data: Uint8Array | Buffer, width: number, height: number, threshold = 3): Bounds {
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0, empty: true };
  return { x0, y0, x1: x1 + 1, y1: y1 + 1, width: x1 + 1 - x0, height: y1 + 1 - y0, empty: false };
}

/**
 * Barycentre de la MASSE ALPHA (et non centre de la boîte) : un ordinateur
 * portable en perspective, une chaussure de profil ou un mannequin décentré ont
 * une masse visuelle décalée — c'est elle que l'œil centre, pas la boîte.
 */
export function alphaCentroid(data: Uint8Array | Buffer, width: number, height: number): { x: number; y: number } {
  let total = 0; let sumX = 0; let sumY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (!alpha) continue;
      total += alpha; sumX += alpha * x; sumY += alpha * y;
    }
  }
  if (!total) return { x: width / 2, y: height / 2 };
  return { x: sumX / total, y: sumY / total };
}

/** Cadre média officiel pour une largeur donnée (ratio 9/13 imposé par le CSS). */
export function frameSizeFor(width: number): Size {
  return { width, height: Math.round((width * CARD_ASPECT_HEIGHT) / CARD_ASPECT_WIDTH) };
}

/**
 * Résolution de rendu bornée par la QUALITÉ (et non par une taille en dur) :
 * la mise en page étant décrite en pourcentages, elle est identique à toute
 * résolution. Une vignette 183×275 obtient donc le même équilibre visuel qu'un
 * packshot 2000 px — sans être interpolée au-delà de MAX_UPSCALE.
 */
export function qualityBoundedWidth(product: Size, idealWidth = IDEAL_FRAME_WIDTH): number {
  const frame = frameSizeFor(idealWidth);
  const safeWidth = frame.width * (1 - 2 * SAFE_INLINE);
  const safeHeight = frame.height * (1 - SAFE_TOP - SAFE_BOTTOM);
  const scale = Math.min(safeWidth / product.width, safeHeight / product.height);
  if (!Number.isFinite(scale) || scale <= MAX_UPSCALE) return idealWidth;
  return Math.max(320, Math.round((idealWidth * MAX_UPSCALE) / scale));
}

export interface Placement {
  /** Facteur UNIQUE appliqué à X et Y — la garantie mathématique du ratio. */
  scale: number;
  width: number;
  height: number;
  x: number;
  y: number;
  safeBox: { x0: number; y0: number; x1: number; y1: number };
  aspectIn: number;
  aspectOut: number;
  /** Écart de ratio en % : le contrat exige < 0,5 %. */
  aspectDeltaPercent: number;
  /** Vrai si une partie du produit sortirait du cadre — doit rester false. */
  cropped: boolean;
  /** Part du cadre réellement occupée par des pixels opaques. */
  coverage: number;
}

/**
 * SMART SCALE + SMART POSITION.
 * @param product taille de l'asset transparent (déjà rogné sur sa bbox réelle)
 * @param frame   taille du cadre média (9/13)
 * @param centroid barycentre alpha exprimé dans le repère de l'asset (px)
 */
export function smartPlacement(product: Size, frame: Size, centroid?: { x: number; y: number }, opaquePixels?: number): Placement {
  const safe = {
    x0: Math.round(frame.width * SAFE_INLINE),
    y0: Math.round(frame.height * SAFE_TOP),
    x1: frame.width - Math.round(frame.width * SAFE_INLINE),
    y1: frame.height - Math.round(frame.height * SAFE_BOTTOM),
  };
  const safeWidth = safe.x1 - safe.x0;
  const safeHeight = safe.y1 - safe.y0;
  // CONTAIN : le plus petit des deux facteurs → le produit entre toujours ENTIER.
  const scale = Math.min(safeWidth / product.width, safeHeight / product.height);
  const width = Math.max(1, Math.round(product.width * scale));
  const height = Math.max(1, Math.round(product.height * scale));

  const mass = centroid ?? { x: product.width / 2, y: product.height / 2 };
  const massX = mass.x * scale;
  const massY = mass.y * scale;
  const targetX = frame.width / 2;
  const targetY = frame.height * OPTICAL_CENTER_Y;
  const rawX = targetX - width / 2 - CENTROID_PULL * (massX - width / 2);
  const rawY = targetY - height / 2 - CENTROID_PULL * (massY - height / 2);
  const x = Math.round(Math.min(Math.max(rawX, safe.x0), safe.x1 - width));
  const y = Math.round(Math.min(Math.max(rawY, safe.y0), safe.y1 - height));

  const aspectIn = product.width / product.height;
  const aspectOut = width / height;
  return {
    scale,
    width,
    height,
    x,
    y,
    safeBox: safe,
    aspectIn,
    aspectOut,
    aspectDeltaPercent: Math.abs(aspectOut - aspectIn) / aspectIn * 100,
    cropped: x < 0 || y < 0 || x + width > frame.width || y + height > frame.height,
    coverage: opaquePixels === undefined
      ? (width * height) / (frame.width * frame.height)
      : (opaquePixels * scale * scale) / (frame.width * frame.height),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2. COUCHES RASTER PURES (aucune I/O — testables pixel par pixel)
 * ════════════════════════════════════════════════════════════════════════ */

/** Couche MOCKUP seule : canvas officiel + coins arrondis anticrénelés. */
export function paintMockupLayer(size: Size, radius = Math.round(size.width * CARD_RADIUS_RATIO)): Buffer {
  const { width, height } = size;
  const data = Buffer.alloc(width * height * 4);
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = CARD_CANVAS.r;
      data[offset + 1] = CARD_CANVAS.g;
      data[offset + 2] = CARD_CANVAS.b;
      data[offset + 3] = Math.round(255 * cornerCoverage(x, y, width, height, r));
    }
  }
  return data;
}

/** Couverture 0..1 d'un pixel par le rectangle arrondi (anticrénelage analytique). */
export function cornerCoverage(x: number, y: number, width: number, height: number, radius: number): number {
  if (radius <= 0) return 1;
  const cx = x + 0.5; const cy = y + 0.5;
  const nearestX = cx < radius ? radius : cx > width - radius ? width - radius : cx;
  const nearestY = cy < radius ? radius : cy > height - radius ? height - radius : cy;
  const dx = cx - nearestX; const dy = cy - nearestY;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius - 0.5) return 1;
  if (distance >= radius + 0.5) return 0;
  return radius + 0.5 - distance;
}

/** Flou « boîte » séparable (3 passes ≈ gaussien) sur un canal alpha — O(n). */
export function blurAlpha(alpha: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.round(sigma * 1.5));
  let current = alpha;
  for (let pass = 0; pass < 3; pass++) {
    current = boxPass(current, width, height, radius, true);
    current = boxPass(current, width, height, radius, false);
  }
  return current;
}

function boxPass(source: Float32Array, width: number, height: number, radius: number, horizontal: boolean): Float32Array {
  const output = new Float32Array(source.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const step = horizontal ? 1 : width;
  for (let o = 0; o < outer; o++) {
    const base = horizontal ? o * width : o;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= Math.min(radius, inner - 1); i++) { sum += source[base + i * step]; count += 1; }
    for (let i = 0; i < inner; i++) {
      output[base + i * step] = sum / count;
      const add = i + radius + 1;
      const remove = i - radius;
      if (add < inner) { sum += source[base + add * step]; count += 1; }
      if (remove >= 0) { sum -= source[base + remove * step]; count -= 1; }
    }
  }
  return output;
}

/** Composite « source-over » d'une couche RGBA sur une autre, à un décalage donné. */
export function compositeOver(base: Buffer, baseSize: Size, layer: Buffer, layerSize: Size, offsetX: number, offsetY: number): void {
  for (let y = 0; y < layerSize.height; y++) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= baseSize.height) continue;
    for (let x = 0; x < layerSize.width; x++) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= baseSize.width) continue;
      const source = (y * layerSize.width + x) * 4;
      const alpha = layer[source + 3] / 255;
      if (alpha <= 0) continue;
      const target = (targetY * baseSize.width + targetX) * 4;
      const baseAlpha = base[target + 3] / 255;
      const outAlpha = alpha + baseAlpha * (1 - alpha);
      for (let channel = 0; channel < 3; channel++) {
        const value = (layer[source + channel] * alpha + base[target + channel] * baseAlpha * (1 - alpha)) / (outAlpha || 1);
        base[target + channel] = Math.round(Math.max(0, Math.min(255, value)));
      }
      base[target + 3] = Math.round(outAlpha * 255);
    }
  }
}

/** Ombre de contact dérivée de l'alpha du produit — COUCHE SÉPARÉE, ne touche aucun pixel produit. */
export function buildContactShadow(product: Buffer, productSize: Size, frame: Size, offsetX: number, offsetY: number): Buffer {
  const field = new Float32Array(frame.width * frame.height);
  const drop = Math.round(productSize.height * 0.012);
  for (let y = 0; y < productSize.height; y++) {
    const targetY = y + offsetY + drop;
    if (targetY < 0 || targetY >= frame.height) continue;
    for (let x = 0; x < productSize.width; x++) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= frame.width) continue;
      field[targetY * frame.width + targetX] = product[(y * productSize.width + x) * 4 + 3] / 255;
    }
  }
  const blurred = blurAlpha(field, frame.width, frame.height, Math.max(2, productSize.height * SHADOW_SIGMA_RATIO));
  const layer = Buffer.alloc(frame.width * frame.height * 4);
  for (let i = 0; i < blurred.length; i++) {
    layer[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, blurred[i] * 255 * SHADOW_OPACITY)));
  }
  return layer;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3. PIPELINE COMPLET (sharp uniquement pour décoder / rééchantillonner / encoder)
 * ════════════════════════════════════════════════════════════════════════ */

export interface CompositionResult {
  png: Buffer;
  placement: Placement;
  frame: Size;
  asset: Size;
}

export interface CompositionOptions {
  /** Largeur de rendu idéale (bornée ensuite par la qualité). */
  idealWidth?: number;
  /** Ombre de contact (couche séparée) — activée par défaut. */
  shadow?: boolean;
}

/**
 * Compose un PNG produit DÉJÀ ISOLÉ (fond transparent) sur le mockup AYROVI.
 * Retourne null si l'entrée n'a pas d'alpha exploitable — l'appelant garde alors
 * son repli habituel (image d'origine), jamais d'image cassée.
 */
export async function composeOnMockup(isolatedPng: Buffer, options: CompositionOptions = {}): Promise<CompositionResult | null> {
  const decoded = await sharp(isolatedPng, { failOn: 'none', limitInputPixels: 40_000_000 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = { width: decoded.info.width, height: decoded.info.height };
  const bounds = alphaBounds(decoded.data, source.width, source.height);
  // Une image 100 % opaque n'est pas un asset détouré : on refuse plutôt que
  // de coller un rectangle de photo marchande sur notre canvas.
  if (bounds.empty || bounds.width < 8 || bounds.height < 8) return null;
  const opaqueRatio = countOpaque(decoded.data, source.width, source.height) / (source.width * source.height);
  if (opaqueRatio > 0.995) return null;

  // ÉTAPE 3 — asset transparent rogné sur sa bbox RÉELLE, à la résolution native.
  const asset = cropRgba(decoded.data, source, bounds);
  const assetSize = { width: bounds.width, height: bounds.height };

  // ÉTAPE 4 — couche mockup (indépendante), à une résolution bornée par la qualité.
  const frame = frameSizeFor(qualityBoundedWidth(assetSize, options.idealWidth ?? IDEAL_FRAME_WIDTH));
  const base = paintMockupLayer(frame);

  // ÉTAPES 5 & 6 — smart scale (facteur unique) puis smart position (barycentre).
  const centroid = alphaCentroid(asset, assetSize.width, assetSize.height);
  const opaquePixels = countOpaque(asset, assetSize.width, assetSize.height);
  const placement = smartPlacement(assetSize, frame, centroid, opaquePixels);

  const resized = await sharp(asset, { raw: { width: assetSize.width, height: assetSize.height, channels: 4 } })
    .resize({
      width: placement.width,
      height: placement.height,
      fit: 'fill',                         // dimensions déjà calculées au ratio exact
      kernel: placement.scale < 1 ? 'lanczos3' : 'lanczos3',
    })
    .raw()
    .toBuffer();
  const placedSize = { width: placement.width, height: placement.height };

  if (options.shadow !== false) {
    const shadow = buildContactShadow(resized, placedSize, frame, placement.x, placement.y);
    compositeOver(base, frame, shadow, frame, 0, 0);
  }
  compositeOver(base, frame, resized, placedSize, placement.x, placement.y);

  const png = await sharp(base, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, placement, frame, asset: assetSize };
}

export function countOpaque(data: Uint8Array | Buffer, width: number, height: number, threshold = 8): number {
  let count = 0;
  for (let i = 0; i < width * height; i++) if (data[i * 4 + 3] > threshold) count += 1;
  return count;
}

export function cropRgba(data: Uint8Array | Buffer, size: Size, bounds: Bounds): Buffer {
  const output = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const sourceStart = ((y + bounds.y0) * size.width + bounds.x0) * 4;
    (data as Buffer).copy(output, y * bounds.width * 4, sourceStart, sourceStart + bounds.width * 4);
  }
  return output;
}

/** Contrat d'acceptation exécutable — identique à celui validé sur le prototype. */
export function acceptComposition(result: CompositionResult): { pass: boolean; checks: Record<string, boolean> } {
  const { placement } = result;
  const checks = {
    aspect_ratio_preserved: placement.aspectDeltaPercent < 0.5,
    no_crop: !placement.cropped,
    inside_safe_area: placement.x >= placement.safeBox.x0 && placement.y >= placement.safeBox.y0
      && placement.x + placement.width <= placement.safeBox.x1
      && placement.y + placement.height <= placement.safeBox.y1,
    frame_ratio_official: Math.abs(result.frame.width / result.frame.height - CARD_ASPECT_WIDTH / CARD_ASPECT_HEIGHT) < 0.005,
    coverage_balanced: placement.coverage >= 0.08 && placement.coverage <= 0.85,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 4. POINT D'ENTRÉE PRODUIT — isolation + composition + cache disque
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Chaîne complète pour une image marchand DISTANTE :
 *   fetch → isolation (chroma-key connecté, sinon segmentation locale)
 *         → composition sur le mockup AYROVI → cache disque par (URL, largeur).
 *
 * Retourne null dès qu'une étape n'est pas CERTAINE (pas d'alpha exploitable,
 * contrat d'acceptation non tenu…) : l'appelant sert alors l'image d'origine.
 * Règle intangible du projet — jamais d'image cassée, jamais de produit déformé.
 */
export async function getComposedCard(rawUrl: string, idealWidth = IDEAL_FRAME_WIDTH): Promise<{ file: string | null; checks?: Record<string, boolean> }> {
  const key = crypto.createHash('sha256').update(`${idealWidth}|${rawUrl}`).digest('hex').slice(0, 32);
  const dir = composedCacheDir();
  const metaPath = path.join(dir, `${key}.meta.json`);
  const pngPath = path.join(dir, `${key}.png`);
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { file: string | null };
  } catch { /* pas encore en cache */ }

  let meta: { file: string | null; checks?: Record<string, boolean> } = { file: null };
  try {
    const buffer = await fetchRemoteImage(rawUrl);
    // ORDRE VALIDÉ PAR LE PROTOTYPE : la SEGMENTATION (saillance produit) d'abord.
    // Le chroma-key ne connaît que la couleur : sur une photo portée, un pantalon
    // clair sur fond clair disparaît. Le modèle, lui, raisonne « objet ». Le
    // chroma-key reste le repli quand le modèle est absent ou indécis.
    let isolated = await segmentBuffer(buffer);
    if (!isolated) isolated = (await isolateBuffer(buffer, { treatWhiteAsUniform: true })).png;
    if (isolated) {
      const composed = await composeOnMockup(isolated, { idealWidth });
      if (composed) {
        const verdict = acceptComposition(composed);
        if (verdict.pass) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(pngPath, composed.png);
          meta = { file: `${key}.png`, checks: verdict.checks };
        } else {
          meta = { file: null, checks: verdict.checks };
        }
      }
    }
  } catch {
    meta = { file: null };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(meta));
  } catch { /* cache best-effort */ }
  return meta;
}

export function composedCacheDir(): string {
  return process.env.AYROVI_COMPOSED_CACHE_DIR || path.resolve(process.cwd(), 'data', 'media-composed');
}

export function readComposedPng(file: string): Buffer {
  return fs.readFileSync(path.join(composedCacheDir(), path.basename(file)));
}

/**
 * PRÉCHAUFFAGE — les cartes composées sont calculées en arrière-plan dès que les
 * résultats Lens/SerpApi sont connus. Le premier visiteur ne paie donc pas
 * l'inférence : il reçoit une carte déjà en cache (ou l'original en repli).
 * Best-effort strict : aucune erreur ne remonte, aucune requête n'est bloquée.
 */
export function warmComposition(urls: Array<string | null | undefined>, limit = 6, width = IDEAL_FRAME_WIDTH): void {
  const targets = urls.filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))).slice(0, limit);
  for (const url of targets) {
    void getComposedCard(url, width).catch(() => { /* préchauffage best-effort */ });
  }
}
