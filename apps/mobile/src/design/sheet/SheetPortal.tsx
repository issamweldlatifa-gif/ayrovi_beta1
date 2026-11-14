/**
 * Portail des feuilles — correctif du 14/11/2026 (« Commenter s'ouvre bloqué »).
 *
 * `AppSheet` n'est pas un `Modal` (la caméra et la vidéo restent vivantes
 * dessous) : il remplit son PARENT (`absoluteFill`). Monté dans une rangée de
 * liste — la barre d'un bloc Publication —, il ne remplissait que la rangée :
 * la feuille sortait à moitié, son en-tête rogné, et le bloc SUIVANT se
 * dessinait PAR-DESSUS (captures 125034 / 125056).
 *
 * Le portail garde la feuille DÉCLARÉE là où vit son état (la barre, avec sa
 * réaction optimiste), mais la DESSINE dans l'hôte posé à la racine de l'écran,
 * au-dessus de la liste. Hors d'un hôte (aperçus, tests isolés), la feuille
 * est rendue sur place, comme avant.
 */
import {
  Fragment, createContext, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';

interface PortalStore {
  mount: (key: string, node: ReactNode) => void;
  unmount: (key: string) => void;
}

const SheetPortalContext = createContext<PortalStore | null>(null);

/**
 * Hôte des portails : à poser UNE fois à la racine d'un écran. Il ne rend que
 * sa propre couche — mettre à jour une feuille ne re-rend pas la liste.
 */
export function SheetPortalHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<ReadonlyArray<readonly [string, ReactNode]>>([]);
  const store = useMemo<PortalStore>(() => ({
    mount: (key, node) => setNodes((list) => {
      const index = list.findIndex(([id]) => id === key);
      if (index < 0) return [...list, [key, node] as const];
      const next = list.slice();
      next[index] = [key, node] as const;
      return next;
    }),
    unmount: (key) => setNodes((list) => (list.some(([id]) => id === key) ? list.filter(([id]) => id !== key) : list)),
  }), []);
  return (
    <SheetPortalContext.Provider value={store}>
      {children}
      {nodes.length > 0 ? (
        <View testID="sheet-portal-host" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {nodes.map(([key, node]) => <Fragment key={key}>{node}</Fragment>)}
        </View>
      ) : null}
    </SheetPortalContext.Provider>
  );
}

/** Rend `children` dans l'hôte le plus proche (ou sur place s'il n'y en a pas). */
export function SheetPortal({ children }: { children: ReactNode }) {
  const store = useContext(SheetPortalContext);
  const key = useId();
  // À chaque rendu du propriétaire : la feuille suit son état (réaction, compteur).
  useLayoutEffect(() => {
    store?.mount(key, children);
  });
  useLayoutEffect(() => () => store?.unmount(key), [store, key]);
  return store ? null : <>{children}</>;
}
