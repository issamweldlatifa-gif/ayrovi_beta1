/**
 * Origine de l'API AYROVI — SOURCE UNIQUE.
 *
 * Pourquoi ce fichier existe (2026-10-03) : la constante vivait dans
 * `nativeApiOrigin.ts`, qui importe `nativeShell.ts`. Or c'est justement
 * `nativeShell.ts` qui doit la TRANSMETTRE à la coque native quand elle ouvre
 * le navigateur marchand. L'importer directement aurait créé un cycle
 * (nativeShell → nativeApiOrigin → nativeShell). Un module neutre, sans aucun
 * import, est la seule forme qui ne peut pas cycler.
 *
 * Les DEUX consommateurs :
 *   • la couche web  — y réécrit ses requêtes fetch/XHR relatives
 *     (`nativeApiOrigin.ts`) ;
 *   • la coque native — l'utilise pour ses appels privés d'analyse/panier
 *     (`AyWebsBrowseActivity`), car DANS la coque ces appels partaient vers
 *     `https://localhost` — l'origine du paquet embarqué, où aucun serveur
 *     n'écoute. C'est la cause du bouton « Add to Cart » figé sur « Loading… ».
 *
 * ORIGINE CONFIGURABLE (04/10/2026) — pourquoi :
 * le paquet Android EMBARQUE cette valeur (elle n'est pas lue au démarrage).
 * La figer en dur obligeait à modifier le code pour viser un autre serveur :
 * impossible, donc, de tester l'application contre une préproduction, un
 * serveur local (tunnel) ou un autre hébergeur SANS toucher au dépôt.
 * Désormais la construction accepte `VITE_AYROVI_API_ORIGIN` :
 *
 *   VITE_AYROVI_API_ORIGIN=https://mon-serveur.example npx vite build
 *
 * La valeur de repli reste l'origine de production : sans variable, le
 * comportement est EXACTEMENT celui d'avant (aucune régression).
 */
const PRODUCTION_ORIGIN = 'https://ayrovi-beta1.onrender.com';

/** Normalise une origine : trim, sans barre finale, et HTTPS/HTTP valide seulement. */
export function normalizeApiOrigin(raw: string | undefined | null): string {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (parsed.pathname !== '/' && parsed.pathname !== '') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * La valeur est injectée à la CONSTRUCTION par Vite (`define` dans
 * vite.config.mts, à partir de `VITE_AYROVI_API_ORIGIN`).
 *
 * Pourquoi pas `import.meta.env` : `tsconfig.json` (celui du serveur) compile en
 * `module: commonjs`, où `import.meta` est interdit — même pour un fichier
 * client, dès qu'un test l'importe. Le projet utilisait déjà ce motif pour
 * `__AYROVI_BUILD_STAMP__` ; on le reprend plutôt que d'ouvrir une exception.
 * `typeof` protège l'exécution hors Vite (tests unitaires) : la constante
 * n'existe alors simplement pas, et le repli de production s'applique.
 */
declare const __AYROVI_API_ORIGIN__: string | undefined;

const configured = normalizeApiOrigin(
  typeof __AYROVI_API_ORIGIN__ === 'undefined' ? '' : __AYROVI_API_ORIGIN__,
);

export const AYROVI_API_ORIGIN = configured || PRODUCTION_ORIGIN;
