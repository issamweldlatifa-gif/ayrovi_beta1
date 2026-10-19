/**
 * AYWEBs — page Stores (`/aywebs/stores`) : le même contenu que l'onglet, dans le cadre
 * de page avec titre et retour. Le contenu vit dans `features/aywebs/StoresContent`.
 */
import { View } from 'react-native';

import { SubScreen } from '@/design/subScreen';
import { ErrorBlock } from '@/design/states';
import { useT } from '@/i18n';
import { StoresContent, useStoresCatalogQuery } from '@/features/aywebs/StoresContent';

export default function StoresScreen() {
  const t = useT();
  const catalog = useStoresCatalogQuery();
  return (
    <SubScreen
      title={t('aywebs.stores.title')}
      fallback="/(tabs)/aywebs"
      onRefresh={() => catalog.refetch()}
      refreshing={catalog.isFetching && !catalog.isPending}
    >
      <StoresContent catalog={catalog} />
    </SubScreen>
  );
}

/**
 * Filet de sécurité de la route : une erreur de rendu sur la page Magasins affiche
 * le bloc d'erreur avec « Réessayer » au lieu de fermer toute l'application.
 * expo-router appelle ce composant à la place de l'écran cassé.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <ErrorBlock error={error} onRetry={retry} />
    </View>
  );
}
