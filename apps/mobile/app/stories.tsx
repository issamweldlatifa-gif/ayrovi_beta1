/** Legacy entry now opens the official editorial gallery, never the old viewer. */
import { SubScreen } from '@/design/subScreen';
import { StoriesSection } from '@/features/home/StoriesSection';
import { useStories, useStoriesShowcase } from '@/api/hooks';
import { useT } from '@/i18n';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';
export default function StoriesScreen() {
  const t = useT();
  const stories = useStories();
  const settings = useStoriesShowcase();
  return <SubScreen title={t('sections.stories')} fallback="/(tabs)"
    onRefresh={() => { void stories.refetch(); void settings.refetch(); }} refreshing={stories.isFetching || settings.isFetching}>
    <StoriesSection />
  </SubScreen>;
}
