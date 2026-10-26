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

export interface AyWebsCaptureReaderDefinition {
  readonly storeId: string;
  readonly version: number;
  readonly priceMode: AyWebsCapturePriceMode;
  readonly note: string;
}
