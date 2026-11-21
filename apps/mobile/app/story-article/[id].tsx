import { useLocalSearchParams } from 'expo-router';
import { StoryArticleScreen } from '@/features/stories/StoryArticleScreen';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function StoryArticleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StoryArticleScreen key={id} id={typeof id === 'string' ? id : ''} />;
}
