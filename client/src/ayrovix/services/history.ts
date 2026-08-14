import type { AyrovixHistoryItem } from '../types';

const STORAGE_PREFIX = 'ayrovix_lens_history_v1';
const MAX_LOCAL_ITEMS = 30;

function storageKey(scope?: string | null): string {
  const normalized = String(scope || 'guest').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || 'guest';
  return `${STORAGE_PREFIX}_${normalized}`;
}

function clean(value: unknown, limit: number): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function publicWebUrl(value: unknown): string {
  const candidate = clean(value, 4096);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function normalize(raw: any): AyrovixHistoryItem | null {
  const id = clean(raw?.id, 100);
  const kind = ['image', 'url', 'qr', 'barcode', 'code'].includes(raw?.kind) ? raw.kind : null;
  if (!id || !kind) return null;
  const numericPrice = Number(raw?.price);
  return {
    id,
    kind,
    inputValue: clean(raw?.inputValue, 4096),
    queryLabel: clean(raw?.queryLabel, 240),
    title: clean(raw?.title, 500) || 'Recherche AYROVIX',
    imageUrl: publicWebUrl(raw?.imageUrl),
    sourceUrl: publicWebUrl(raw?.sourceUrl),
    source: clean(raw?.source, 120),
    price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null,
    currency: /^[A-Z]{3}$/.test(String(raw?.currency || '').toUpperCase()) ? String(raw.currency).toUpperCase() : null,
    verificationStatus: raw?.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
    resultsCount: Math.max(0, Math.min(1000, Number(raw?.resultsCount) || 0)),
    createdAt: clean(raw?.createdAt, 50) || new Date().toISOString(),
  };
}

export function readLocalAyrovixHistory(scope?: string | null): AyrovixHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(scope)) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean).slice(0, MAX_LOCAL_ITEMS) as AyrovixHistoryItem[] : [];
  } catch {
    return [];
  }
}

/** Store only compact result metadata — never the uploaded/captured image or signed price token. */
export function rememberAyrovixHistory(input: AyrovixHistoryItem, scope?: string | null): void {
  if (typeof window === 'undefined') return;
  const item = normalize(input);
  if (!item) return;
  try {
    const merged = [item, ...readLocalAyrovixHistory(scope).filter((entry) => entry.id !== item.id)]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_LOCAL_ITEMS);
    window.localStorage.setItem(storageKey(scope), JSON.stringify(merged));
  } catch { /* storage unavailable/private mode */ }
}

export async function loadAyrovixHistory(scope?: string | null, signal?: AbortSignal): Promise<AyrovixHistoryItem[]> {
  const local = readLocalAyrovixHistory(scope);
  let remote: AyrovixHistoryItem[] = [];
  try {
    const response = await fetch('/api/ayrovix/history?limit=30', { signal });
    const payload = await response.json();
    if (response.ok && payload?.success && Array.isArray(payload.data)) {
      remote = payload.data.map(normalize).filter(Boolean) as AyrovixHistoryItem[];
    }
  } catch { /* local fallback remains available */ }
  const seen = new Set<string>();
  return [...remote, ...local]
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 50);
}
