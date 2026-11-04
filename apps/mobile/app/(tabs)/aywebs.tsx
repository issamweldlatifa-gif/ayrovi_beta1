/**
 * AYWEBs — accueil orienté découverte : recherche, catégories, reprise de la
 * dernière page visitée, boutiques enregistrées et visuel de campagne.
 * Le catalogue détaillé reste partagé avec `/aywebs/stores`.
 */

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AyWebsHomeContent } from '@/features/aywebs/AyWebsHomeContent';
import { useStoresCatalogQuery } from '@/features/aywebs/StoresContent';

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AyWebsScreen() {
  const catalog = useStoresCatalogQuery();

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} brand="aywebs" showNotifications={false} />}
      hasBottomBar
      chrome
      onRefresh={() => catalog.refetch()}
      refreshing={catalog.isFetching && !catalog.isPending}
    >
      <AyWebsHomeContent catalog={catalog} />
    </AppScreen>
  );
}
