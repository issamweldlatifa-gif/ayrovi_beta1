/**
 * Boutiques enregistrées (le cœur d'une carte). Stockées sur l'appareil avec
 * AsyncStorage, comme les autres préférences non sensibles du projet : elles
 * survivent à la fermeture de l'application.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSavedStoreIds, toggleSavedStoreId } from './storesCatalog';

export const SAVED_STORES_KEY = 'ayrovi.aywebs.savedStores';

export function useSavedStoreIds(): { ids: string[]; loaded: boolean; toggle: (storeId: string) => void } {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Source de vérité synchrone : deux clics rapides ne perdent aucun changement.
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SAVED_STORES_KEY)
      .then((raw) => {
        if (!alive) return;
        const stored = parseSavedStoreIds(raw);
        idsRef.current = stored;
        setIds(stored);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const toggle = useCallback((storeId: string) => {
    const next = toggleSavedStoreId(idsRef.current, storeId);
    idsRef.current = next;
    setIds(next);
    AsyncStorage.setItem(SAVED_STORES_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  return { ids, loaded, toggle };
}
