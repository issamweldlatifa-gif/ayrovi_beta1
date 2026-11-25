import { useLocalSearchParams } from 'expo-router';
import { SbaseMerchantSearch } from '@/features/sbase/SbaseScreens';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

/**
 * Recherche sur UNE boutique (SandBase), indépendante d'AYWEBs et de Z Lens.
 * La route est portée par l'id du descripteur serveur (`aliexpress`, `amazon`…),
 * donc une nouvelle boutique fonctionne sans reconstruire l'écran.
 */
export default function SbaseMerchantScreen() {
  const params = useLocalSearchParams<{ merchant?: string }>();
  const merchant = String(params.merchant ?? '').trim();
  return <SbaseMerchantSearch merchant={merchant} />;
}
