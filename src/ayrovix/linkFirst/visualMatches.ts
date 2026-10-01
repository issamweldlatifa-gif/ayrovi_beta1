/**
 * CORRESPONDANCES VISUELLES POUR LES APPELANTS QUI N'ONT PAS LE MOTEUR LENS
 * (assistant, outils de correspondance) — une seule porte, qui respecte
 * l'interrupteur `AYROVI_LENS_SOURCE`.
 *
 *   links   → liens SerpApi → pages marchandes → prix/photos/stock lus à la source
 *   legacy  → ancien système : candidats SerpApi tels quels
 *
 * Sans cette porte, l'assistant aurait continué à présenter des prix SerpApi
 * pendant que la grille Lens n'en montrait plus : deux vérités pour un produit.
 */
import type { QatafoDatabase } from '../../db/database';
import { fetchRemoteImage } from '../../services/imageIsolation';
import { parsePublicHttpUrl } from '../../services/safeUrl';
import type { AyrovixCandidate } from '../types';
import { isLegacyLensSource } from '../lensSource';
import { serpApiVisualLinks, serpApiVisualSearch, serpApiVisualSearchUrl } from '../services/visualSearch';
import { resolveLinks, type PageFetcher } from './linkEngine';
import { stubToLink } from './linkSource';
import { defaultPageFetcher } from './pageFetcher';

async function resolveStubs(stubs: AyrovixCandidate[], db: QatafoDatabase, fetcher?: PageFetcher): Promise<AyrovixCandidate[]> {
  const links = stubs.map(stubToLink).filter((link): link is NonNullable<typeof link> => Boolean(link));
  if (!links.length) return [];
  return (await resolveLinks(links, { db, fetcher: fetcher ?? defaultPageFetcher })).candidates;
}

export async function visualMatchesForImage(
  image: Buffer,
  db: QatafoDatabase,
  limit = 8,
  fetcher?: PageFetcher,
): Promise<AyrovixCandidate[]> {
  if (isLegacyLensSource()) return serpApiVisualSearch(image, limit);
  return (await resolveStubs(await serpApiVisualLinks(image, Math.max(limit + 4, 12)), db, fetcher)).slice(0, limit);
}

export async function visualMatchesForImageUrl(
  imageUrl: string,
  db: QatafoDatabase,
  limit = 8,
  fetcher?: PageFetcher,
): Promise<AyrovixCandidate[]> {
  if (isLegacyLensSource()) return serpApiVisualSearchUrl(imageUrl, limit);
  let normalized: string;
  try { normalized = parsePublicHttpUrl(imageUrl).toString(); } catch { return []; }
  // Même règle que l'ancien chemin : SerpApi ne résout jamais une URL fournie par
  // l'utilisateur — on télécharge et on valide l'image ici, puis on envoie les octets.
  const image = await fetchRemoteImage(normalized).catch(() => null);
  return image ? visualMatchesForImage(image, db, limit, fetcher) : [];
}
