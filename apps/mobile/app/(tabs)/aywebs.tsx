/**
 * AYWEBs — l'onglet ouvre directement la page Stores : recherche, « Browse by Category »,
 * « Store List », boutiques enregistrées et toutes les boutiques (contenu partagé avec
 * `/aywebs/stores`, voir `features/aywebs/StoresContent`).
 *
 * Le panier AYWEBs reste accessible en haut. Le collage de lien (analyse d'un produit)
 * n'est plus dans cet onglet : la capture et l'ajout au panier se font dans la page
 * boutique ouverte depuis une carte.
 */
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AppText, Button, Card, SectionHeader } from '@/design/ui';
import { useT } from '@/i18n';
import { fetchAyWebsCart } from '@/api/aywebs';
import { StoresContent, useStoresCatalogQuery } from '@/features/aywebs/StoresContent';
import { useTheme } from '@/design/theme';
import { useSessionId } from '@/session/session';

export default function AyWebsScreen() {
  const t = useT();
  const theme = useTheme();
  const sessionId = useSessionId();
  const catalog = useStoresCatalogQuery();

  const cart = useQuery({
    queryKey: ['aywebs', 'cart', sessionId],
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    enabled: Boolean(sessionId),
    staleTime: 30_000,
  });
  const cartLines = cart.data?.items.length ?? 0;

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome
      onRefresh={() => catalog.refetch()}
      refreshing={catalog.isFetching && !catalog.isPending}
    >
      <SectionHeader title={t('aywebs.stores.title')} />

      <Card title={t('aywebs.cartCardTitle')}>
        <AppText variant="body" color={theme.colors.muted}>
          {t('aywebs.cartCardCount', { count: cartLines })}
        </AppText>
        <Button
          label={t('aywebs.cartBridgeOpen')}
          tone="quiet"
          onPress={() => router.push('/aywebs/cart')}
          testID="aywebs-open-cart"
        />
      </Card>

      <StoresContent catalog={catalog} />
    </AppScreen>
  );
}
