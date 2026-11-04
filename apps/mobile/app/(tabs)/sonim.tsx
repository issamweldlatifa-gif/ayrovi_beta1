/**
 * Onglet Sonim — assistant conversationnel IA ZAYROVI dans la barre principale.
 */
import { SonimScreen } from '@/features/sonim/SonimScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function SonimTabRoute() {
  return <SonimScreen />;
}
