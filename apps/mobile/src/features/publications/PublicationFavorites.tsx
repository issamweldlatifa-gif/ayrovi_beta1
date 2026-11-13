/**
 * Cœurs des cartes Publication (planches GBox du 14/11 : rond blanc, cœur fin,
 * en haut à droite de chaque photo produit).
 *
 * Le cœur est RÉEL : ce sont les favoris du compte (`useProductFavorites`, le même
 * crochet que les Reels — une seule lecture pour tout l'écran, bascule optimiste,
 * retour arrière si le serveur refuse). Un invité voit le cœur ; l'appui ouvre la
 * feuille de connexion de Publication, comme « Suivre ». Rien n'est simulé.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/state/session';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { PublicationAuthSheet } from './PublicationAuthSheet';

export interface PublicationFavoritesValue {
  isFavorite: (productId: string) => boolean;
  /** Bascule le favori ; un invité reçoit la feuille de connexion. */
  press: (productId: string) => void;
}

const NONE: PublicationFavoritesValue = { isFavorite: () => false, press: () => {} };
const PublicationFavoritesContext = createContext<PublicationFavoritesValue | null>(null);

export function PublicationFavoritesProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favourites = useProductFavorites(signedIn, session.account?.id || '');
  const [auth, setAuth] = useState(false);
  const press = useCallback((productId: string) => {
    if (!signedIn) {
      setAuth(true);
      return;
    }
    favourites.toggle(productId);
  }, [favourites, signedIn]);
  const value = useMemo(() => ({ isFavorite: favourites.isFavorite, press }), [favourites.isFavorite, press]);
  return (
    <PublicationFavoritesContext.Provider value={value}>
      {children}
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </PublicationFavoritesContext.Provider>
  );
}

/** Hors du fournisseur (aperçus, tests isolés) : aucun cœur n'est proposé. */
export function usePublicationFavorites(): PublicationFavoritesValue | null {
  return useContext(PublicationFavoritesContext);
}

export const NO_PUBLICATION_FAVORITES = NONE;
