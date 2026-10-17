/**
 * Chaîne média native Lens.
 *
 * Une galerie contient UNE diapositive par photo marchand. Chaque diapositive
 * possède ses replis : composition ZAYROVI → détourage → proxy → original.
 * Les miniatures privilégient le proxy léger pour apparaître immédiatement ;
 * les replis ne deviennent jamais de fausses photos supplémentaires.
 */
import { API_BASE_URL } from '@/api/config';
import { mediaUrl } from '@/api/client';
import type { LensCandidate } from '@/api/lens';

export interface LensMediaItem {
  original: string;
  uris: string[];
}

const unique = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
};

function normalizedRemote(value: string): string {
  return value.startsWith('//') ? `https:${value}` : value;
}

function isMerchantRemote(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  if (!API_BASE_URL) return true;
  try {
    return new URL(value).origin !== new URL(API_BASE_URL).origin;
  } catch {
    return false;
  }
}

/**
 * URLs absolues directement consommables par `expo-image`.
 * Les largeurs appartiennent aux listes fermées du serveur public.
 */
export function lensMediaChain(
  rawUrl: string | null | undefined,
  size: 'card' | 'detail' | 'thumb' = 'card',
): string[] {
  const clean = normalizedRemote(String(rawUrl ?? '').trim());
  if (!clean) return [];
  const original = mediaUrl(clean);
  if (!isMerchantRemote(clean)) return original ? [original] : [];

  const composedWidth = size === 'detail' ? 900 : 600;
  const proxyWidth = size === 'detail' ? 760 : size === 'thumb' ? 156 : 480;
  const encoded = encodeURIComponent(clean);
  const composed = mediaUrl(`/api/public/media/card?u=${encoded}&w=${composedWidth}`);
  const isolated = mediaUrl(`/api/public/media/isolated?url=${encoded}`);
  const proxy = mediaUrl(`/api/public/media/img?u=${encoded}&w=${proxyWidth}`);
  return size === 'thumb'
    ? unique([proxy, composed, isolated, original])
    : unique([composed, isolated, proxy, original]);
}

function colorGallery(candidate: LensCandidate, color?: string | null): string[] {
  const wanted = String(color ?? '').trim().toLocaleLowerCase();
  if (!wanted || !candidate.colorImages) return [];
  const entry = Object.entries(candidate.colorImages)
    .find(([name]) => name.trim().toLocaleLowerCase() === wanted);
  return entry?.[1] ?? [];
}

/** Photos uniques de la fiche, avec priorité aux photos de la couleur choisie. */
export function lensGallery(
  candidate: LensCandidate,
  color?: string | null,
  size: 'card' | 'detail' | 'thumb' = 'detail',
): LensMediaItem[] {
  const selected = colorGallery(candidate, color);
  const raw = unique(selected.length ? selected : [candidate.image, ...candidate.images]);
  return raw.slice(0, 12).map((original) => ({ original, uris: lensMediaChain(original, size) }));
}
