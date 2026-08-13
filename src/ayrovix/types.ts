/**
 * AYROVIX — Contrats partagés côté serveur.
 * Architecture extensible : Input → AI Vision → Search → Matching → Extraction → Currency → Calculator.
 * Claude = couche de compréhension UNIQUEMENT (jamais moteur de recherche, jamais source de prix).
 */

/** Ce que la couche Vision (Claude) extrait d'une image. Aucun prix n'est demandé ni accepté. */
export interface AyrovixIdentification {
  category: string;
  brand: string | null;
  model: string | null;
  color: string[];
  visible_text: string[];
  possible_model_codes: string[];
  description: string;
  confidence: number; // 0..1
}

export type AyrovixChannel = 'image' | 'url' | 'qr';

/** Un candidat produit proposé à l'utilisateur pour confirmation humaine. */
export interface AyrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;         // ex. "AYROVI Stock", "SHEIN", "Google Shopping"
  sourceUrl: string;      // page produit (ou page interne)
  image: string;
  price: number | null;   // prix source (null si inconnu — jamais deviné)
  currency: string | null;
  priceTnd: number | null; // estimation "tout inclus" via le calculator AYROVI
  match: number;          // 0..99, score de correspondance déterministe
}

/** Fiche produit confirmée, prête pour le Calculator puis le panier. */
export interface AyrovixProduct {
  title: string;
  brand: string | null;
  model: string | null;
  description: string;
  image: string;
  images: string[];
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  exchangeRate: number | null;
  colors: string[];
  sizes: string[];
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
}

export interface AyrovixAnalyzeImageResponse {
  identification: AyrovixIdentification;
  query: string;
  candidates: AyrovixCandidate[];
}

export interface AyrovixAnalyzeUrlResponse {
  product: AyrovixProduct;
  alternates: AyrovixCandidate[];
}
