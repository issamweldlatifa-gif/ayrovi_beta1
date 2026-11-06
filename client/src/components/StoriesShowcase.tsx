import React, { useEffect, useState } from 'react';
import { ArrowRight } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import type { StoryCta } from '../social/types';

interface Settings {
  title: string; subtitle: string; titleAr?: string; subtitleAr?: string;
  ctaLabel: string; ctaLabelAr?: string; cardCount: number; enabled: boolean;
}
interface Card { id: string; media_url: string; media_type: string; title: string; description: string; title_ar?: string; description_ar?: string }
interface Props { isAuthenticated?: boolean; onRequireAuth?: () => void; onCta?: (cta: StoryCta) => void }

/** Official editorial extension. No old social viewer, publishers, comments or CTA fallback. */
export const StoriesShowcase: React.FC<Props> = () => {
  const { locale } = useLocale();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stories, setStories] = useState<Card[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const read = async (url: string) => {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('Stories unavailable');
      const payload = await res.json();
      if (!payload.success) throw new Error('Stories unavailable');
      return payload.data;
    };
    Promise.all([read('/api/public/stories-showcase'), read('/api/public/stories')])
      .then(([block, cards]) => { if (!controller.signal.aborted) { setSettings(block); setStories(Array.isArray(cards) ? cards : []); } })
      .catch(() => { /* Optional editorial section never blocks the page. */ });
    return () => controller.abort();
  }, []);
  const local = (fr: string, ar?: string) => locale === 'ar' && ar ? ar : fr;
  const visible = stories.filter(card => card.media_type === 'IMAGE' && card.media_url).slice(0, settings?.cardCount ?? 0);
  if (!settings?.enabled || !visible.length) return null;
  return <section className="stories-showcase" aria-labelledby="stories-showcase-title">
    <div className="stories-showcase__head">
      <h2 className="stories-showcase__title" id="stories-showcase-title">{local(settings.title, settings.titleAr)}</h2>
      {settings.subtitle ? <p className="stories-showcase__subtitle">{local(settings.subtitle, settings.subtitleAr)}</p> : null}
      {settings.ctaLabel ? <button type="button" className="stories-showcase__cta" disabled aria-disabled="true">
        <span>{local(settings.ctaLabel, settings.ctaLabelAr)}</span><ArrowRight size={17} />
      </button> : null}
    </div>
    <ul className="stories-showcase__rail">
      {visible.map(story => <li key={story.id} className="stories-showcase__cell">
        <article className="stories-showcase__card">
          <img className="stories-showcase__img" src={story.media_url} alt={local(story.title, story.title_ar)} loading="lazy" decoding="async" />
          <div className="stories-showcase__overlay">
            <h3 className="stories-showcase__cardtitle">{local(story.title, story.title_ar)}</h3>
            {story.description ? <p className="stories-showcase__carddesc">{local(story.description, story.description_ar)}</p> : null}
          </div>
        </article>
      </li>)}
    </ul>
  </section>;
};
