/**
 * Onglet Lens — expose Z Lens directement dans la barre de navigation du bas
 * tout en conservant la route autonome `/lens` pour les liens profonds.
 */
import LensScreen from '../lens';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function LensTabScreen() {
  return <LensScreen />;
}
