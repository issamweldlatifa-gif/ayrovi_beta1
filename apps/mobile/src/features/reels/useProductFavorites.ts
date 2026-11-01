/**
 * Favoris des produits d'un Reel (24/10/2026).
 *
 * Le cœur de la carte n'existe que si l'écran sait le tenir : ici, on lit les
 * favoris **une seule fois** pour toute la visionneuse (pas une requête par
 * carte) puis on bascule de façon optimiste, en revenant en arrière si le
 * serveur refuse.
 *
 * Règle de la maison : rien n'est inventé. Sans compte, aucun cœur n'est affiché
 * (`enabled = false`) — on ne propose pas une action qui échouera.
 */
import { useCallback, useEffect, useState } from 'react';

import { addCatalogFavorite, fetchFavorites, removeFavorite } from '@/api/account';

export interface ProductFavorites {
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const NO_FAVOURITES: ProductFavorites = { isFavorite: () => false, toggle: () => {} };

export function useProductFavorites(enabled: boolean): ProductFavorites {
  /** productId → identifiant du favori (nécessaire pour le supprimer). */
  const [byProduct, setByProduct] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let alive = true;
    fetchFavorites()
      .then((list) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        for (const favorite of list) {
          if (favorite.productId) next[favorite.productId] = favorite.id;
        }
        setByProduct(next);
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled, loaded]);

  const isFavorite = useCallback((productId: string) => Boolean(byProduct[productId]), [byProduct]);

  const toggle = useCallback(
    (productId: string) => {
      const existing = byProduct[productId];
      if (existing) {
        setByProduct((current) => {
          const next = { ...current };
          delete next[productId];
          return next;
        });
        removeFavorite(existing).catch(() => {
          // Le serveur a refusé : on remet le cœur, on ne ment pas.
          setByProduct((current) => ({ ...current, [productId]: existing }));
        });
        return;
      }
      addCatalogFavorite(productId)
        .then((favorite) => {
          if (!favorite || !favorite.id) return;
          setByProduct((current) => ({ ...current, [productId]: favorite.id }));
        })
        .catch(() => null);
    },
    [byProduct],
  );

  return enabled ? { isFavorite, toggle } : NO_FAVOURITES;
}
