import { useLocalSearchParams } from 'expo-router';
import { SbaseItemScreen } from '@/features/sbase/SbaseItemScreen';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

/**
 * Fiche produit S Base — une seule page pour toutes les boutiques.
 * La route ne dépend que de l'id du descripteur serveur : une boutique qui
 * publie un endpoint de détail fonctionne sans toucher cet écran.
 */
export default function SbaseItemRoute() {
  const params = useLocalSearchParams<{ source?: string; id?: string; title?: string; url?: string }>();
  const text = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] :(value ?? '')) || '';
  return <SbaseItemScreen
    source={text(params.source)}
    id={text(params.id) || null}
    title={text(params.title) || null}
    url={text(params.url) || null}
  />;
}
