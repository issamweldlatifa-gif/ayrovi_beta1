/**
 * Z Lens — détection des produits SUR LE TÉLÉPHONE (Google ML Kit), comme
 * Google Lens (demande du propriétaire, 11/11/2026 : « كيما Google Lens بالضبط »).
 *
 * ── Ce que ça apporte ──────────────────────────────────────────────────────
 * SerpApi rend des pages ressemblantes, jamais de cadres : depuis le 17/10 le
 * cadre partait donc de la photo ENTIÈRE et la recherche se brouillait dès
 * qu'il y avait plusieurs objets. ML Kit, lui, trouve OÙ sont les objets
 * (jusqu'à 5), localement, sans réseau, sans coût, en quelques centaines de
 * millisecondes. Ensuite TOUT existe déjà :
 *   • un point blanc par produit (`LensSelectionView`, `LensLiveOverlay`) ;
 *   • le cadre posé d'office sur le plus grand (`biggestProductIndex`) ;
 *   • toucher un autre produit → le cadre le prend et la recherche repart ;
 *   • le serveur recherche UNIQUEMENT la zone encadrée (`roi`).
 * ML Kit ne dit pas CE QUE c'est (catégories grossières) : SerpApi reste
 * l'unique source de l'identification.
 *
 * ── Jamais bloquant ────────────────────────────────────────────────────────
 * Module natif absent (ancien APK, Expo Go, tests), modèle qui ne se charge
 * pas, image illisible, délai dépassé : on rend `[]` et Lens retombe sur le
 * comportement d'avant (cadre sur toute la photo). Aucune exception ne sort.
 */
import type { LensDetectedProduct } from '@/api/lens';
import { toDetectedProducts, toFileUrl, type MlKitObject } from './onDeviceDetectionLogic';

interface Detector {
  load(): Promise<void>;
  isLoaded(): boolean;
  detectObjects(imagePath: string): Promise<MlKitObject[]>;
}

/** Au-delà, on n'attend plus : la recherche part sur la photo entière. */
export const DETECTION_TIMEOUT_MS = 1500;

let detectorPromise: Promise<Detector | null> | null = null;

function loadDetector(): Promise<Detector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        // `require` paresseux : `requireNativeModule` LÈVE si le module natif
        // n'est pas dans l'APK — on veut un simple « indisponible ».
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mlkit = require('@infinitered/react-native-mlkit-object-detection') as {
          RNMLKitDefaultObjectDetector: new (options: Record<string, unknown>) => Detector;
        };
        const detector = new mlkit.RNMLKitDefaultObjectDetector({
          shouldEnableClassification: true,
          shouldEnableMultipleObjects: true,
          detectorMode: 'singleImage',
        });
        await detector.load();
        return detector.isLoaded() ? detector : null;
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * Produits encadrés d'une image locale (`uri` de la photo redressée et réduite,
 * `width`/`height` = ses pixels). Ne lève jamais ; `[]` = rien de fiable.
 */
export async function detectProductsOnDevice(
  uri: string,
  width: number,
  height: number,
  timeoutMs = DETECTION_TIMEOUT_MS,
): Promise<LensDetectedProduct[]> {
  if (!uri || !(width > 0) || !(height > 0)) return [];
  const work = (async () => {
    const detector = await loadDetector();
    if (!detector) return [];
    const objects = await detector.detectObjects(toFileUrl(uri));
    return toDetectedProducts(objects, width, height);
  })();
  return withTimeout(work, timeoutMs, []);
}

/** Charger le modèle à l'ouverture de Lens : la première photo n'attend pas le chargement. */
export function warmUpOnDeviceDetector(): void {
  void loadDetector();
}

/** Tests uniquement : oublier le détecteur chargé. */
export function resetOnDeviceDetectorForTests(): void {
  detectorPromise = null;
}
