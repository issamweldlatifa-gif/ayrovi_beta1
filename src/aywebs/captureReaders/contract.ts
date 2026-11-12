/**
 * AYWEBs — contrat d'un lecteur WebView par boutique.
 *
 * Le collecteur partagé garde le contrat JSON, les garde-fous et les sources
 * structurées. Chaque définition choisit son mode de lecture et sa version,
 * livrés séparément par `GET /capture/script.js?store_id=...`.
 *
 * Pas de sélecteur supposé : les profils `structured_only` s'abstiennent si le
 * marchand ne publie pas JSON-LD / meta / microdata. Un DOM reader n'est ajouté
 * qu'avec des fixtures issues de pages réellement capturées.
 */
export type AyWebsCapturePriceMode =
  | 'standard'
  | 'amazon_buy_box'
  | 'named_containers'
  | 'structured_only';

/**
 * Version de l'ENVELOPPE commune (12/11/2026). Toute boutique — lecteur dédié ou
 * cœur partagé — est servie dans la même enveloppe : profil, garde de domaine,
 * restauration du global, tampon `contract` dans la sortie JSON. Incrémenter
 * seulement si la forme de `contract` change (le serveur la lit en notes).
 */
export const AYWEBS_CAPTURE_CONTRACT_VERSION = 1;

/**
 * Intégration propre à chaque boutique :
 *   • `dedicated`   — script autonome (`storeScripts/<id>.ts`), sa propre logique DOM ;
 *   • `shared_core` — cœur partagé (`captureScript.ts`) piloté par `priceMode` ;
 *   • `generic`     — boutique enregistrée sans lecteur mesuré : cœur partagé en
 *                     mode `standard`, mais profil/version/garde de domaine à elle.
 */
export type AyWebsCaptureIntegration = 'dedicated' | 'shared_core' | 'generic';

export interface AyWebsCaptureReaderDefinition {
  readonly storeId: string;
  readonly version: number;
  readonly priceMode: AyWebsCapturePriceMode;
  readonly integration: AyWebsCaptureIntegration;
  readonly note: string;
}
