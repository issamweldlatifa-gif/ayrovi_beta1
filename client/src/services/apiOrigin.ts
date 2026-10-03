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
 */
export const AYROVI_API_ORIGIN = 'https://ayrovi-beta1.onrender.com';
