/**
 * Garde d'intégrité du cache disque d'images entre builds Android.
 *
 * ── Pourquoi ce module existe (28/10/2026) ───────────────────────────────────
 * Sur Android, `aapt2` numérote séquentiellement par ordre alphabétique tous les
 * `R.drawable.*` embarqués (`0x7f0800XX`). Dès qu'un visuel est ajouté ou retiré
 * sous `assets/`, tous les identifiants entiers situés après lui dans l'alphabet
 * se décalent (`sephora` ↔ `shein` ↔ `temu`, catégories, etc.).
 *
 * Or `expo-image` / Glide indexait son cache disque par l'URI numérique
 * `android.resource://<pkg>/<int>` signée uniquement par `versionCode`. Si deux
 * APK consécutifs partageaient le même `versionCode`, Glide relisait sur disque
 * le bitmap de l'ancien APK associé au nouvel entier `R.drawable` — provoquant
 * une cascade d'inversion des logos de boutiques.
 *
 * La défense comporte trois verrous indépendants :
 *   1. `AppImage` passe `cachePolicy="memory"` pour tout `localSource`
 *      (`DiskCacheStrategy.NONE` côté Glide : aucun `R.drawable` n'écrit ni ne
 *      lit jamais le cache disque persistant) ;
 *   2. Au démarrage, si l'empreinte de build (`version` + `versionCode` +
 *      `EXPO_PUBLIC_BUILD_STAMP`) a changé depuis le dernier lancement, ce module
 *      purge le cache disque et mémoire d'`expo-image` ;
 *   3. Le pipeline CI Android incrémente `versionCode` de façon strictement
 *      monotone sur chaque APK de démonstration.
 */

export const IMAGE_CACHE_STAMP_STORAGE_KEY = 'ayrovi.imageCacheStamp.v1';

export interface ImageCacheStampInput {
  version?: string | null;
  androidVersionCode?: number | string | null;
  iosBuildNumber?: string | null;
  buildStamp?: string | null;
}

export interface ImageCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ReconcileImageCacheDeps {
  stamp: string;
  storage: ImageCacheStorage;
  clearDiskCache?: (() => Promise<unknown>) | null;
  clearMemoryCache?: (() => Promise<unknown>) | null;
}

/** Construit une empreinte déterministe et non vide de la binaire courante. */
export function computeImageCacheStamp(input: ImageCacheStampInput): string {
  const version = String(input.version ?? '').trim() || '0.0.0';
  const code = String(input.androidVersionCode ?? input.iosBuildNumber ?? '').trim() || '0';
  const sha = String(input.buildStamp ?? '').trim() || 'dev';
  return `v2:${version}:${code}:${sha}`;
}

/**
 * Compare l'empreinte persistée à celle du build courant ; en cas d'écart (ou de
 * premier lancement après mise à jour), purge les caches Glide/SDWebImage puis
 * enregistre la nouvelle empreinte. Ne lève jamais d'exception.
 */
export async function reconcileImageCacheStamp({
  stamp,
  storage,
  clearDiskCache,
  clearMemoryCache,
}: ReconcileImageCacheDeps): Promise<{ purged: boolean; stamp: string }> {
  const normalized = String(stamp || '').trim();
  if (!normalized) {
    return { purged: false, stamp: '' };
  }

  let previous: string | null = null;
  try {
    previous = await storage.getItem(IMAGE_CACHE_STAMP_STORAGE_KEY);
  } catch {
    previous = null;
  }

  if (previous === normalized) {
    return { purged: false, stamp: normalized };
  }

  let purged = false;
  try {
    if (typeof clearMemoryCache === 'function') {
      await clearMemoryCache();
      purged = true;
    }
  } catch {
    // Best-effort : indisponible en environnement de test ou web.
  }

  try {
    if (typeof clearDiskCache === 'function') {
      await clearDiskCache();
      purged = true;
    }
  } catch {
    // Best-effort : une purge refusée ne bloque jamais le démarrage.
  }

  try {
    await storage.setItem(IMAGE_CACHE_STAMP_STORAGE_KEY, normalized);
  } catch {
    // Best-effort : sera retenté au prochain lancement.
  }

  return { purged, stamp: normalized };
}
