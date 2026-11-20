import { useLocalSearchParams } from 'expo-router';
import { PublicationLookScreen } from '@/features/publications/PublicationLookScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function PublicationLookRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PublicationLookScreen key={id} id={typeof id === 'string' ? id : ''} />;
}
