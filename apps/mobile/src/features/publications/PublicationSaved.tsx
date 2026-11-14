/**
 * « Enregistrer » un bloc Publication — signet de la barre (retour du 14/11 :
 * « زيد أيقونة save »).
 *
 * Une lecture pour tout l'écran (fournisseur), bascule IMMÉDIATE, mémoire par
 * COMPTE sur l'appareil (`AsyncStorage`, clé suffixée par l'identifiant du
 * compte : un autre compte sur le même téléphone ne voit jamais les
 * enregistrements du premier). Un invité voit le signet ; l'appui ouvre la
 * feuille de connexion de Publication, comme J'aime et « Suivre ».
 *
 * Le serveur n'a pas (encore) de liste « Enregistrés » : rien n'est envoyé,
 * rien n'est simulé côté serveur — la synchronisation viendra avec la page
 * des enregistrements.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSession } from '@/state/session';
import { PublicationAuthSheet } from './PublicationAuthSheet';

/** Plafond de la liste mémorisée (les plus récents gagnent). */
export const PUBLICATION_SAVED_LIMIT = 500;

export const publicationSavedKey = (owner: string) => `publication-saved:${owner}`;

/** Lecture tolérante de la valeur stockée : uniquement des identifiants texte, sans doublon. */
export function parseSavedBlocks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200);
    return [...new Set(ids)].slice(-PUBLICATION_SAVED_LIMIT);
  } catch {
    return [];
  }
}

/** Bascule pure : ajoute en fin (plus récent), retire sinon ; plafonnée. */
export function toggleSavedBlock(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((row) => row !== id) : [...ids, id].slice(-PUBLICATION_SAVED_LIMIT);
}

export interface PublicationSavedValue {
  isSaved: (blockId: string) => boolean;
  /** Bascule l'enregistrement ; un invité reçoit la feuille de connexion. */
  toggle: (blockId: string) => void;
}

const PublicationSavedContext = createContext<PublicationSavedValue | null>(null);

export function PublicationSavedProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const owner = signedIn ? session.account?.id || 'member' : '';
  const [ids, setIds] = useState<string[]>([]);
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    let alive = true;
    setIds([]);
    if (!owner) return () => { alive = false; };
    AsyncStorage.getItem(publicationSavedKey(owner))
      .then((raw) => { if (alive) setIds(parseSavedBlocks(raw)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [owner]);

  const toggle = useCallback((blockId: string) => {
    if (!owner) { setAuth(true); return; }
    setIds((list) => {
      const next = toggleSavedBlock(list, blockId);
      void AsyncStorage.setItem(publicationSavedKey(owner), JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, [owner]);

  const value = useMemo<PublicationSavedValue>(() => {
    const set = new Set(ids);
    return { isSaved: (blockId) => set.has(blockId), toggle };
  }, [ids, toggle]);

  return (
    <PublicationSavedContext.Provider value={value}>
      {children}
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </PublicationSavedContext.Provider>
  );
}

/** Hors du fournisseur (aperçus, tests isolés) : pas de signet. */
export function usePublicationSaved(): PublicationSavedValue | null {
  return useContext(PublicationSavedContext);
}
