/*
 * SEGMENTATION IA LOCALE (24/09/2026) — la 3ᵉ couche de l'isolation.
 *
 * Le chroma-key connecté (gratuit, instantané) couvre les fonds UNIFORMES.
 * Restaient hors d'atteinte : photos réelles (pièce, miroir, extérieur).
 * Cette couche exécute EN LOCAL le modèle u2netp (saliency, 4,6 Mo) via
 * onnxruntime-web (backend WASM — aucune binaire native, aucun API payant) :
 *   • le modèle est COMMIS dans le dépôt (assets/models/u2netp.onnx, sha256 épinglé) ;
 *   • si le paquet ou le modèle manque → segmentationReady() = false et le
 *     pipeline existant continue (jamais d'erreur bloquante, jamais de dépendance dure) ;
 *   • le résultat subit un post-traitement PUR et TESTÉ (normalisation, seuil,
 *     anti-îlots, garde de couverture) avant d'être fusionné avec l'image.
 *
 * Référence modèle : u2netp — release danielgatis/rembg v0.0.0.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** SHA-256 du fichier commis — toute divergence désactive la couche (sécurité). */
const MODEL_SHA256 = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
const MODEL_SIZE = 4_574_861;
const SIDE = 320;

export function modelPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'models', 'u2netp.onnx'),
    path.resolve(process.cwd(), '..', 'assets', 'models', 'u2netp.onnx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

let sessionPromise: Promise<{ run: (input: Float32Array) => Promise<Float32Array> } | null> | null = null;

/** Vrai si le modèle ET le runtime sont réellement chargés (vérification proactive). */
export async function segmentationReady(): Promise<boolean> {
  return (await loadSession()) !== null;
}

async function loadSession(): Promise<{ run: (input: Float32Array) => Promise<Float32Array> } | null> {
  if (process.env.AYROVI_SEGMENTATION === 'false') return null;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    try {
      const file = modelPath();
      if (!fs.existsSync(file)) return null;
      const stats = fs.statSync(file);
      if (stats.size !== MODEL_SIZE) return null;
      const { createHash } = await import('node:crypto');
      const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (digest !== MODEL_SHA256) {
        console.warn('[Segmentation] empreinte du modèle inattendue — couche désactivée.');
        return null;
      }
      const ort = (await import('onnxruntime-web')) as any;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = path.resolve(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist') + path.sep;
      const session = await ort.InferenceSession.create(file, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      const inputName = session.inputNames[0];
      return {
        run: async (input: Float32Array) => {
          const results = await session.run({ [inputName]: new ort.Tensor('float32', input, [1, 3, SIDE, SIDE]) });
          return results[session.outputNames[0]].data as Float32Array;
        },
      };
    } catch (error: any) {
      console.warn(`[Segmentation] indisponible (${error?.message || error}) — repli heuristique seul.`);
      return null;
    }
  })();
  return sessionPromise;
}

/* ── Post-traitement du masque — PUR et TESTÉ ─────────────────────────────── */

/** Normalise le masque cru du modèle vers 0..1 (le modèle sort déjà un sigmoïde borné). */
export function normalizeMask(raw: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const output = new Float32Array(raw.length);
  if (span <= 1e-6) return output;
  for (let i = 0; i < raw.length; i++) output[i] = (raw[i] - min) / span;
  return output;
}

export interface MaskOptions {
  /** Seuil dur : ≥ → alpha 255 (défaut 0.5). */
  hardThreshold?: number;
  /** Bande de flou autour du seuil (défaut 0.18) — anticrénelage. */
  feather?: number;
  /** Un îlot de moins de cette aire est considéré bruit (défaut 96 px). */
  minIslandPixels?: number;
}

/**
 * Nettoie le masque : seuil doux + suppression des PETITS ÎLOTS isolés (bruit
 * de saliency) via un flood-fill des composantes — la plus grande composante et
 * toute composante ≥ 4 % de la plus grande sont conservées.
 */
export function cleanMask(mask: Float32Array, width: number, height: number, options: MaskOptions = {}): Uint8ClampedArray {
  const hard = options.hardThreshold ?? 0.5;
  const feather = options.feather ?? 0.18;
  const minIsland = options.minIslandPixels ?? 96;
  const alpha = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const value = mask[i];
    if (value >= hard + feather) alpha[i] = 255;
    else if (value <= hard - feather) alpha[i] = 0;
    else alpha[i] = Math.round((255 * (value - (hard - feather))) / (2 * feather));
  }
  // Composantes connexes (4-voisinage) sur le seuil dur ; on garde les grosses.
  const solid = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) solid[i] = alpha[i] === 255 ? 1 : 0;
  const label = new Int32Array(mask.length);
  const keep = new Uint8Array(mask.length);
  let largest = 0;
  const queue = new Int32Array(mask.length);
  let currentLabel = 0;
  const sizes: number[] = [];
  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || label[start]) continue;
    currentLabel += 1;
    let head = 0;
    let tail = 0;
    let size = 0;
    label[start] = currentLabel;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      size += 1;
      const x = pixel % width;
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        pixel >= width ? pixel - width : -1,
        pixel + width < solid.length ? pixel + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && solid[neighbour] && !label[neighbour]) {
          label[neighbour] = currentLabel;
          queue[tail++] = neighbour;
        }
      }
    }
    sizes[currentLabel] = size;
    if (size > largest) largest = size;
  }
  for (let l = 1; l <= currentLabel; l++) {
    if (sizes[l] >= Math.max(minIsland, largest * 0.04)) keep[l] = 1;
  }
  if (largest === 0) return alpha;
  for (let i = 0; i < alpha.length; i++) {
    if (solid[i] && !keep[label[i]]) alpha[i] = 0;
  }
  return alpha;
}

/** Part du premier plan (0..1) — garde anti-âneries du modèle. */
export function foregroundShare(alpha: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 127) count += 1;
  return alpha.length ? count / alpha.length : 0;
}

/**
 * Applique le masque nettoyé à l'image brute RGBA (4 canaux, dimensions width×height)
 * — l'alpha existant est MULTIPLIÉ (on n'opacifie jamais un pixel déjà transparent).
 */
export function applyMask(image: { data: Buffer; width: number; height: number }, alpha: Uint8ClampedArray): void {
  const { data } = image;
  for (let i = 0; i < image.width * image.height; i++) {
    const offset = i * 4 + 3;
    data[offset] = Math.round((data[offset] * alpha[i]) / 255);
  }
}

/* ── Pipeline réel : PNG marchand → PNG détouré (ou null si indécis) ──────── */

/**
 * Segmente un buffer d'image (JPEG/PNG/WebP) et retourne un PNG à fond transparent.
 * Retourne null si : runtime/modèle absent, premier plan absurde (<3 % ou >97 %) —
 * l'appelant garde alors son repli actuel (original non touché).
 */
export async function segmentBuffer(buffer: Buffer): Promise<Buffer | null> {
  const session = await loadSession();
  if (!session) return null;
  const base = sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) return null;
  // Entrée 320×320 « contain » — rembg procède pareil (ratio préservé, padding noir).
  const input = new Float32Array(SIDE * SIDE * 3);
  const { data, info } = await base.clone()
    .resize({ width: SIDE, height: SIDE, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < SIDE * SIDE; i++) {
    input[i] = data[i * 3] / 255;
    input[i + SIDE * SIDE] = data[i * 3 + 1] / 255;
    input[i + 2 * SIDE * SIDE] = data[i * 3 + 2] / 255;
  }
  let rawMask: Float32Array;
  try {
    rawMask = await session.run(input);
  } catch (error: any) {
    console.warn(`[Segmentation] inférence échouée (${error?.message || error}).`);
    return null;
  }
  const normalized = normalizeMask(rawMask);
  const maskSmall = cleanMask(normalized, SIDE, SIDE);
  // Le masque 320×320 est remis à la taille de l'image (lissage bilinéaire de sharp).
  const maskFull = await sharp(Buffer.from(maskSmall.buffer, maskSmall.byteOffset, maskSmall.byteLength), {
    raw: { width: SIDE, height: SIDE, channels: 1 },
  }).resize({ width: meta.width, height: meta.height, fit: 'fill' }).raw().toBuffer();
  const image = { data: await base.ensureAlpha().raw().toBuffer(), width: meta.width, height: meta.height };
  const share = foregroundShare(new Uint8ClampedArray(maskFull.buffer, maskFull.byteOffset, maskFull.byteLength));
  if (share < 0.03 || share > 0.97) return null;
  applyMask(image, new Uint8ClampedArray(maskFull.buffer, maskFull.byteOffset, maskFull.byteLength));
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
