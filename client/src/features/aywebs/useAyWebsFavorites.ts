import { useCallback, useEffect, useRef, useState } from 'react';
import { customerApi } from '../../customer/api';
import type { CustomerFavorite } from '../../types';

/**
 * §6 (04/10/2026) — Favoris AyWebs : UN SEUL magasin, celui du compte AYROVI.
 *
 * Ce qui existait : `AyWebsStoresScreen` gardait les favoris dans un
 * `useState<Set<string>>` local. L'état disparaissait au premier démontage,
 * n'était attaché à aucun compte et n'apparaissait jamais dans « Mon compte ».
 * C'était un cœur décoratif.
 *
 * Ce hook lit et écrit la MÊME ressource que l'espace client et que Lens :
 *   GET/POST/DELETE /api/customer/account/favorites
 * Aucun `localStorage`, aucune copie locale, donc aucune resynchronisation
 * possible — la liste affichée DANS AyWebs est la liste du compte.
 *
 * Sans session : `authRequired` passe à vrai et l'appelant propose la
 * connexion. On n'enregistre jamais un faux favori « en attendant ».
 */
export interface AyWebsFavoriteTarget {
  /** Identité du favori côté source : l'URL marchande (jamais un id local). */
  sourceUrl: string;
  title: string;
  image?: string;
  priceTnd?: number | null;
}

export interface AyWebsFavoritesApi {
  items: CustomerFavorite[];
  busy: boolean;
  /** Vrai quand le serveur a répondu 401 : aucune session cliente. */
  authRequired: boolean;
  /** Vrai quand la lecture ou l'écriture a échoué pour une autre raison. */
  failed: boolean;
  isSaved: (sourceUrl: string) => boolean;
  toggle: (target: AyWebsFavoriteTarget) => Promise<void>;
  remove: (favoriteId: string) => Promise<void>;
  reload: () => void;
}

const FAVORITES_PATH = '/api/customer/account/favorites';

export function useAyWebsFavorites(csrfToken: string): AyWebsFavoritesApi {
  const [items, setItems] = useState<CustomerFavorite[]>([]);
  const [busy, setBusy] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const locked = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    void customerApi<{ data: CustomerFavorite[] }>(FAVORITES_PATH, { signal: controller.signal })
      .then((result) => { setItems(result.data || []); setAuthRequired(false); setFailed(false); })
      .catch((error: any) => {
        if (controller.signal.aborted) return;
        setItems([]);
        if (error?.status === 401) setAuthRequired(true); else setFailed(true);
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [epoch, csrfToken]);

  const reload = useCallback(() => setEpoch((value) => value + 1), []);

  const isSaved = useCallback(
    (sourceUrl: string) => items.some((item) => item.source_url === sourceUrl),
    [items],
  );

  const remove = useCallback(async (favoriteId: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFailed(false);
    try {
      await customerApi(`${FAVORITES_PATH}/${encodeURIComponent(favoriteId)}`, { method: 'DELETE' }, csrfToken);
      setItems((current) => current.filter((item) => item.id !== favoriteId));
    } catch (error: any) {
      if (error?.status === 401) setAuthRequired(true); else setFailed(true);
    } finally { locked.current = false; setBusy(false); }
  }, [csrfToken]);

  const toggle = useCallback(async (target: AyWebsFavoriteTarget) => {
    if (locked.current) return;
    const existing = items.find((item) => item.source_url === target.sourceUrl);
    if (existing) { await remove(existing.id); return; }
    locked.current = true; setBusy(true); setFailed(false);
    try {
      const result = await customerApi<{ data: CustomerFavorite }>(FAVORITES_PATH, {
        method: 'POST',
        body: JSON.stringify({
          sourceUrl: target.sourceUrl,
          title: target.title,
          imageUrl: target.image || '',
          priceTND: typeof target.priceTnd === 'number' && Number.isFinite(target.priceTnd) && target.priceTnd > 0
            ? target.priceTnd : null,
        }),
      }, csrfToken);
      setItems((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setAuthRequired(false);
    } catch (error: any) {
      if (error?.status === 401) setAuthRequired(true); else setFailed(true);
    } finally { locked.current = false; setBusy(false); }
  }, [csrfToken, items, remove]);

  return { items, busy, authRequired, failed, isSaved, toggle, remove, reload };
}
