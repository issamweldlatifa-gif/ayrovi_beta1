import type { AyrovixCandidate } from '../types';

/**
 * DÉDOUBLONNAGE DÉTERMINISTE des fiches Lens — un produit, une carte.
 * Clés : id, URL sans tracking, titre normalisé + marque + source (Jaccard > 0,88).
 * Aucun appel IA : local, synchrone, borné (02/10/2026 — reste du module
 * « aiLensIntelligence », dont tout le reste avait quitté le chemin produit).
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash=''; u.search=''; // strip tracking
    return u.toString().toLowerCase().replace(/\/$/,'');
  } catch { return url.toLowerCase().trim(); }
}

export function deduplicateCandidates(candidates: AyrovixCandidate[]): AyrovixCandidate[] {
  const seenUrl = new Set<string>();
  const seenId = new Set<string>();
  const seenNorm = new Set<string>();
  const result: AyrovixCandidate[] = [];
  for (const c of candidates) {
    const normUrl = normalizeUrl(c.sourceUrl);
    const normTitle = normalizeTitle(c.title);
    const brandModelKey = `${(c.brand||'').toLowerCase().trim()}|${normalizeTitle(c.title).slice(0,40)}|${c.source.toLowerCase()}`;
    const skuLike = `${(c.brand||'').toLowerCase()}|${normTitle.slice(0,30)}|${c.source.toLowerCase()}`;
    if (c.id && seenId.has(c.id)) continue;
    if (normUrl && seenUrl.has(normUrl)) continue;
    if (seenNorm.has(skuLike) || seenNorm.has(brandModelKey)) continue;
    // AI semantic check is merged here heuristically: normalized title + brand+source must be unique
    // Do NOT merge if price differs >40% and brand differs — avoid incorrect merge
    let isDup = false;
    for (const existing of result) {
      const existingNorm = normalizeTitle(existing.title);
      if (existingNorm === normTitle && (c.brand||'').toLowerCase() === (existing.brand||'').toLowerCase() && c.source === existing.source) { isDup = true; break; }
      // semantic near-duplicate: same normalized title 90% overlap + same brand
      const tokensA = new Set(normTitle.split(' '));
      const tokensB = new Set(existingNorm.split(' '));
      const inter = [...tokensA].filter(t=> tokensB.has(t)).length;
      const union = new Set([...tokensA, ...tokensB]).size;
      const jaccard = union? inter/union : 0;
      if (jaccard > 0.88 && (c.brand||'').toLowerCase() === (existing.brand||'').toLowerCase() && c.source === existing.source) { isDup = true; break; }
    }
    if (isDup) continue;
    seenId.add(c.id);
    if (normUrl) seenUrl.add(normUrl);
    seenNorm.add(skuLike);
    seenNorm.add(brandModelKey);
    result.push(c);
  }
  return result;
}
