/** The legacy path remains the editorial gallery unless an exact Story is shared. */
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubScreen } from '@/design/subScreen';
import { LoadingBlock, ErrorBlock, EmptyBlock } from '@/design/states';
import { goBack } from '@/design/navigation';
import { StoriesSection } from '@/features/home/StoriesSection';
import { openStoryTarget } from '@/features/social/storyTarget';
import { StoryViewer } from '@/features/social/StoryViewer';
import { isShareId } from '@/features/links/shareLinks';
import { useStories, useStoriesShowcase } from '@/api/hooks';
import { useT } from '@/i18n';
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

function SharedStory({ id }: { id: string }) {
  const t = useT();
  const stories = useStories();
  const [expired, setExpired] = useState(false);
  const close = useCallback(() => goBack('/'), []);
  const story = stories.data?.find(row => row.id === id);
  const expiresAt = story?.expiresAt ? Date.parse(story.expiresAt) : Infinity;
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return;
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) setExpired(true);
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return <SubScreen title={t('sections.stories')}>
    {stories.isError ? <ErrorBlock error={stories.error} onRetry={() => void stories.refetch()} />
      : stories.isPending ? <LoadingBlock />
      : story && !expired && expiresAt > Date.now() ? <StoryViewer visible stories={[story]} onClose={close} onOpenTarget={openStoryTarget} />
      : <EmptyBlock>{t('social.empty')}</EmptyBlock>}
  </SubScreen>;
}

function StoriesGallery() {
  const t = useT();
  const stories = useStories();
  const settings = useStoriesShowcase();
  return <SubScreen title={t('sections.stories')} fallback="/(tabs)"
    onRefresh={() => { void stories.refetch(); void settings.refetch(); }} refreshing={stories.isFetching || settings.isFetching}>
    <StoriesSection />
  </SubScreen>;
}

export default function StoriesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return isShareId(id) ? <SharedStory key={id} id={id} /> : <StoriesGallery />;
}
