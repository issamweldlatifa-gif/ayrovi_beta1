/**
 * Origine des médias servis par l'API — dans l'application native UNIQUEMENT.
 *
 * POURQUOI CE FICHIER (04/10/2026, audit Android — AY-26)
 * `nativeApiOrigin.ts` réécrit `fetch` et `XMLHttpRequest` : tout ce qui passe
 * par le réseau JS est déjà absolu dans la coque. Mais le navigateur résout
 * LUI-MÊME les URL de `<img src>`, `srcSet`, `<video src>` et `poster` — aucun
 * pont ne les voit. Dans le paquet embarqué (origine `https://localhost`), un
 * chemin relatif y désigne donc un fichier de la coque… qui n'existe pas :
 *   • `/uploads/hero/…`  → servi par le serveur (`src/server.ts:320`) ;
 *   • `/api/public/media/…` → proxies média du serveur (`src/server.ts:182`) ;
 *   • `/media/…`, `/assets/…` → **locaux au paquet**, à ne JAMAIS réécrire
 *     (le serveur n'a aucune route `/media` ; les réécrire casserait le logo
 *     AYROVI et les marques de paiement, qui fonctionnent hors-ligne).
 *
 * RÈGLE §2 — ZÉRO RÉGRESSION WEB
 * Hors coque native, cette fonction est l'IDENTITÉ stricte : le web garde son
 * comportement same-origin à l'identique. Le test `tests/native-asset-origin`
 * verrouille cette propriété explicitement (ce n'est pas une promesse).
 */
import { AYROVI_API_ORIGIN, normalizeApiOrigin } from './apiOrigin';
import { isNativeApp } from './nativeShell';

/** Déjà absolu (marchand, protocole relatif) ou inline : rien à résoudre. */
const ABSOLUTE_OR_INLINE = /^(?:https?:)?\/\//i;

/** Chemins appartenant au SERVEUR — les seuls que la coque ne possède pas. */
const SERVER_OWNED = /^\/(?:api|uploads)(?:\/|$)/i;

/**
 * URL affichable dans tous les modes. Vide → chaîne vide (jamais « undefined »).
 * @param url    valeur brute venant du serveur ou d'un marchand
 * @param origin origine de l'API (injectable : rend la fonction testable sans globals)
 */
export function nativeAssetUrl(url: string | null | undefined, origin: string = AYROVI_API_ORIGIN): string {
  const value = String(url ?? '').trim();
  if (!value) return '';
  if (ABSOLUTE_OR_INLINE.test(value)) return value;
  // Tout le reste des chemins relatifs appartient au paquet (/media, /assets…) :
  // les réécrire remplacerait un fichier local présent par un 404 distant.
  if (!SERVER_OWNED.test(value)) return value;
  if (!isNativeApp()) return value;
  return `${normalizeApiOrigin(origin) || AYROVI_API_ORIGIN}${value}`;
}
