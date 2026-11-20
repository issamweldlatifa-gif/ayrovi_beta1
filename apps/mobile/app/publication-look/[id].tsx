import { useLocalSearchParams } from 'expo-router';
import { PublicationLookScreen } from '@/features/publications/PublicationLookScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function PublicationLookRoute() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const collection = view === 'collection';
  return <PublicationLookScreen key={`${id}:${collection}`} collection={collection} id={typeof id === 'string' ? id : ''} />;
}
