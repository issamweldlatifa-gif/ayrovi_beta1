import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isStoryId, readStoryEditorial, type StoryArticle, type StoryEditorial, type StoryMedia } from '../../../../shared/storyEditorial';
import { normalizeMediaLink } from '../../../../shared/mediaLinks';
import { apiGetData, type RequestOptions } from './client';
import { isApiError } from './errors';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export interface EditorialStory {
  id: string; title: string; titleAr: string; description: string; descriptionAr: string;
  publishAt: string; expiresAt: string; editorial: StoryEditorial | null; legacyMedia: StoryMedia | null; products: LinkedProduct[];
}
const str = (value: unknown) => typeof value === 'string' ? value : '';

export async function fetchEditorialStory(id: string, options?: RequestOptions): Promise<EditorialStory | null> {
  if (!isStoryId(id)) return null;
  try {
    const raw = await apiGetData<Record<string, unknown>>(`/api/public/stories/${encodeURIComponent(id)}/editorial`, options);
    if (!raw || raw.id !== id) return null;
    const mediaType = raw.media_type === 'VIDEO' ? 'video' : 'image';
    const legacy = normalizeMediaLink(str(raw.media_url), mediaType);
    const legacyMedia = legacy.ok && legacy.url ? { kind: mediaType, url: legacy.url } as const : null;
    return { id, title: str(raw.title), titleAr: str(raw.title_ar), description: str(raw.description), descriptionAr: str(raw.description_ar),
      publishAt: str(raw.publish_at), expiresAt: str(raw.expires_at), editorial: readStoryEditorial(raw.editorial), legacyMedia,
      products: (Array.isArray(raw.products) ? raw.products.slice(0, 8) : []).map(parseLinkedProduct).filter((item): item is LinkedProduct => item !== null) };
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** Existing cover cards remain readable without silently rewriting saved CRM content. */
export function storyPresentation(story: EditorialStory): StoryEditorial | null {
  if (story.editorial) return story.editorial;
  if (!story.legacyMedia) return null;
  const local = (text: string, textAr: string) => ({ text, textAr });
  const title = local(story.title, story.titleAr);
  const intro = local(story.description, story.descriptionAr);
  const article: StoryArticle = { title, intro, cover: story.legacyMedia.kind === 'video' ? '' : story.legacyMedia.url,
    author: '', blocks: [], selectionTitle: { text: '' } };
  const slides: StoryEditorial['slides'] = [{ layout: 'cover', media: story.legacyMedia, title, caption: { text: '' }, action: 'read' }];
  if (story.legacyMedia.kind !== 'video') slides.push({ layout: 'inset', media: story.legacyMedia, title, caption: intro, action: 'read' });
  return { version: 1, slides, article };
}

export function useEditorialStory(id: string) {
  const query = useQuery({ queryKey: ['story-editorial', id], queryFn: ({ signal }) => fetchEditorialStory(id, { signal }),
    staleTime: 15_000, retry: false, refetchOnMount: 'always' });
  const expires = Date.parse(query.data?.expiresAt || '');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(expires)) return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const remaining = expires - Date.now();
      if (remaining <= 0) tick(x => x + 1);
      else timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    }
    schedule();
    return () => clearTimeout(timer);
  }, [expires]);
  const story = !query.isError && (!Number.isFinite(expires) || expires > Date.now()) ? query.data : null;
  return { ...query, story };
}
