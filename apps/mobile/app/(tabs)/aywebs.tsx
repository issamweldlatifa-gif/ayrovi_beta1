/**
 * AYWEBs — l'onglet ouvre directement la page Stores : recherche, « Browse by Category »,
 * « Store List », boutiques enregistrées et toutes les boutiques (contenu partagé avec
 * `/aywebs/stores`, voir `features/aywebs/StoresContent`).
 *
 * Ni carte de panier ni collage de lien dans cet onglet : le panier se trouve dans la
 * page boutique ouverte depuis une carte, et la capture / l'ajout s'y font aussi.
 */

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { SectionHeader } from '@/design/ui';
import { useT } from '@/i18n';
import { StoresContent, useStoresCatalogQuery } from '@/features/aywebs/StoresContent';

export default function AyWebsScreen() {
  const t = useT();
  const catalog = useStoresCatalogQuery();

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome
      onRefresh={() => catalog.refetch()}
      refreshing={catalog.isFetching && !catalog.isPending}
    >
      <SectionHeader title={t('aywebs.stores.title')} />
      <StoresContent catalog={catalog} />
    </AppScreen>
  );
}
