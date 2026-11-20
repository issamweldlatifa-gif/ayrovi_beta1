import { Redirect } from 'expo-router';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

// Bookmarks to the retired template detail resolve to the remaining entry.
export default function RetiredPublicationCollection() {
  return <Redirect href="/publications" />;
}
