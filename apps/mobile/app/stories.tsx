import { useLocalSearchParams } from 'expo-router';
import { StoriesGallery } from '@/features/stories/StoriesGallery';
import { EditorialStoryScreen } from '@/features/stories/EditorialStoryScreen';
import { isShareId } from '@/features/links/shareLinks';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function StoriesScreen() {
  const { id, focus } = useLocalSearchParams<{ id?: string; focus?: string }>();
  return isShareId(id) ? <EditorialStoryScreen key={id} id={id} /> : <StoriesGallery key={isShareId(focus) ? focus : 'gallery'} focus={isShareId(focus) ? focus : undefined} />;
}
