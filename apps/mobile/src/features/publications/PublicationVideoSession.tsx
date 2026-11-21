import { useVideoAutoplay } from '@/state/prefs';
import { useCallback, useRef, useState } from 'react';
import { Modal } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchRelatedPublicationVideos, type ReferencePublication } from '@/api/referencePublications';
import { useReduceMotion } from '@/design/motion';
import { useSession } from '@/state/session';
import { PublicationFullscreenVideo, type PublicationPlayback } from './PublicationFullscreenVideo';
import { relatedPublicationVideos } from './publicationVideoQueue';

export function PublicationVideoSession({ post, start, onClose, onLearnMore, onProduct }: {
  post: ReferencePublication;
  start: PublicationPlayback;
  onClose: (state: PublicationPlayback) => void;
  onLearnMore: (post: ReferencePublication, state: PublicationPlayback) => void;
  onProduct: (id: string, state: PublicationPlayback) => void;
}) {
  const owner = useSession().account?.id || 'guest';
  const autoplay = useVideoAutoplay();
  const reduceMotion = useReduceMotion();
  const [clip, setClip] = useState(() => ({ post, start, sequence: 0 }));
  const [visited, setVisited] = useState(() => new Set([post.id]));
  const originPlayback = useRef(start);
  const back = useRef<() => void>(null);
  const products = clip.post.products.filter(item => item.available).slice(0, 20).map(item => item.id).sort();
  const related = useQuery({
    queryKey: ['publication-related-videos', owner, products],
    queryFn: ({ signal }) => fetchRelatedPublicationVideos(products, { signal }),
    enabled: products.length > 0,
    staleTime: 60_000,
  });
  const videos = relatedPublicationVideos(clip.post, related.data ?? []);
  const next = autoplay && !reduceMotion ? videos.find(item => !visited.has(item.id)) : undefined;
  const resumeOrigin = (state: PublicationPlayback) => clip.post.id === post.id ? state : { ...originPlayback.current, muted: state.muted };
  const select = useCallback((item: ReferencePublication, state: PublicationPlayback) => {
    if (clip.post.id === post.id) originPlayback.current = state;
    setVisited(value => new Set(value).add(item.id));
    setClip(value => ({ post: item, start: { time: 0, muted: state.muted }, sequence: value.sequence + 1 }));
  }, [clip.post.id, post.id]);

  if (clip.post.media?.type !== 'video') return null;
  return <Modal animationType="none" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent
    supportedOrientations={['portrait', 'landscape']} onRequestClose={() => back.current?.()}>
    <PublicationFullscreenVideo key={clip.sequence} back={back} post={clip.post} media={clip.post.media} start={clip.start}
      videos={videos} relatedStatus={related.isLoading ? 'loading' : related.isError ? 'error' : 'ready'}
      onRetryPlayback={muted => setClip(value => ({ ...value, start: { time: 0, muted }, sequence: value.sequence + 1 }))}
      onRetryRelated={() => void related.refetch()} next={next} onSelectVideo={select}
      onClose={state => onClose(resumeOrigin(state))}
      onLearnMore={state => onLearnMore(clip.post, resumeOrigin(state))}
      onProduct={(id, state) => onProduct(id, resumeOrigin(state))} />
  </Modal>;
}
