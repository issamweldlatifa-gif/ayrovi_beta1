/**
 * Dernier emplacement AYWEBs visité — uniquement pour « Reprendre la navigation ».
 * Stockage local, aucun envoi serveur. Une URL doit rester une page HTTP(S) valide.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isWebPageUrl } from './webNavigation';

export const LAST_VISITED_STORE_KEY = 'ayrovi.aywebs.lastVisitedStore';

export interface AyWebsLastVisit {
  storeId: string;
  storeName: string;
  url: string;
  visitedAt: number;
}

export function parseAyWebsLastVisit(raw: string | null | undefined): AyWebsLastVisit | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const storeId = typeof record.storeId === 'string' ? record.storeId.trim() : '';
    const storeName = typeof record.storeName === 'string' ? record.storeName.trim() : '';
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    const visitedAt = typeof record.visitedAt === 'number' && Number.isFinite(record.visitedAt)
      ? record.visitedAt
      : 0;
    if (!storeId || !storeName || !isWebPageUrl(url)) return null;
    return { storeId, storeName, url, visitedAt };
  } catch {
    return null;
  }
}

export async function readAyWebsLastVisit(): Promise<AyWebsLastVisit | null> {
  try {
    return parseAyWebsLastVisit(await AsyncStorage.getItem(LAST_VISITED_STORE_KEY));
  } catch {
    return null;
  }
}

export async function rememberAyWebsVisit(input: Omit<AyWebsLastVisit, 'visitedAt'>): Promise<void> {
  const storeId = String(input.storeId ?? '').trim();
  const storeName = String(input.storeName ?? '').trim();
  const url = String(input.url ?? '').trim();
  if (!storeId || !storeName || !isWebPageUrl(url)) return;
  const visit: AyWebsLastVisit = { storeId, storeName, url, visitedAt: Date.now() };
  try {
    await AsyncStorage.setItem(LAST_VISITED_STORE_KEY, JSON.stringify(visit));
  } catch {
    // Le stockage de reprise est une commodité : une panne ne bloque jamais l'achat.
  }
}
