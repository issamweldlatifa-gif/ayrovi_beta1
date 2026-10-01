/**
 * LIENS SEULEMENT — ce que le moteur « liens d'abord » prend de SerpApi.
 *
 * Google Lens (via SerpApi) rend, par correspondance : un lien, un titre, une
 * boutique, et — selon les cas — un prix, une miniature, un `in_stock`, une note.
 * Ces derniers sont des échos de la page marchande, vus de loin, parfois périmés
 * ou faux. Le moteur neuf n'en prend AUCUN : il garde le LIEN (l'adresse de la
 * page produit), le nom de la boutique, et le titre comme simple indice
 * d'identité (pour vérifier ensuite que la page lue est bien ce produit-là).
 * Tout le reste est lu sur la page elle-même.
 *
 * Module pur : aucune requête réseau, aucune clé.
 */
import { createHash } from 'node:crypto';
import type { AyrovixCandidate } from '../types';

/** Hôtes qui ne sont pas des fiches marchandes : pages de recherche, réseaux sociaux. */
const NOT_A_MERCHANT = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|bing\.com|pinterest\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|reddit\.com|twitter\.com|x\.com|wikipedia\.org)$/i;

export interface LensLink {
  /** Adresse de la page produit — la SEULE donnée qu'on exploite de SerpApi. */
  url: string;
  /** Nom de la boutique tel que Lens l'écrit (affichage de repli uniquement). */
  merchant: string;
  /** Titre vu par Lens : indice d'identité, jamais affiché comme un fait. */
  titleHint: string;
}

/** Clé de dédoublonnage : même page, quels que soient suivi publicitaire et ancre. */
export function normalizeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|gad_|srsltid$|ref$|ref_$|tag$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

export function isMerchantLink(raw: string): boolean {
  const normalized = normalizeLinkUrl(raw);
  if (!normalized) return false;
  return !NOT_A_MERCHANT.test(new URL(normalized).hostname);
}

/** Lignes `visual_matches` de SerpApi → liens, sans prix ni image ni stock. */
export function linksFromVisualMatches(rows: unknown, limit: number): LensLink[] {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  const links: LensLink[] = [];
  for (const row of list) {
    const url = normalizeLinkUrl(String((row as any)?.link || ''));
    if (!url || seen.has(url) || !isMerchantLink(url)) continue;
    const titleHint = String((row as any)?.title || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (titleHint.length < 4) continue;
    seen.add(url);
    links.push({
      url,
      merchant: String((row as any)?.source || '').replace(/\s+/g, ' ').trim().slice(0, 80) || merchantFromUrl(url),
      titleHint,
    });
    if (links.length >= limit) break;
  }
  return links;
}

export function merchantFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.');
    const label = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Marchand';
  } catch {
    return 'Marchand';
  }
}

export function linkId(url: string, index: number): string {
  return `lens_${index}_${createHash('sha1').update(url).digest('hex').slice(0, 10)}`;
}

/**
 * Un lien déguisé en candidat VIDE — il traverse le cache de reconnaissance et
 * le moteur Lens (qui manipulent des `AyrovixCandidate`) sans transporter un
 * seul fait marchand : prix nul, aucune image, disponibilité inconnue.
 */
export function linkToStub(link: LensLink, index: number): AyrovixCandidate {
  return {
    id: linkId(link.url, index),
    kind: 'external',
    title: link.titleHint,
    brand: null,
    model: null,
    colors: [],
    sizes: [],
    source: link.merchant,
    sourceUrl: link.url,
    image: '',
    images: [],
    price: null,
    currency: null,
    priceTnd: null,
    availability: 'unknown',
    match: Math.max(72, 94 - index * 3),
    dataSource: 'link-only',
  };
}

/** Le chemin inverse : un lien nu, à partir d'un candidat-lien. */
export function stubToLink(candidate: AyrovixCandidate): LensLink | null {
  const url = normalizeLinkUrl(String(candidate.sourceUrl || ''));
  if (!url || !isMerchantLink(url)) return null;
  return { url, merchant: candidate.source || merchantFromUrl(url), titleHint: candidate.title };
}
