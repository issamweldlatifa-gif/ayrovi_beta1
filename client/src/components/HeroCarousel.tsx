/**
 * Hero unique et dynamique de l'accueil (site).
 * Source unique : `/api/public/hero-slides` (cartes publiées) + `/api/public/hero-carousel-settings`.
 * Sans carte publiée, ou Hero désactivé dans l'Admin, rien n'est affiché : il n'existe plus d'ancien Hero.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { safePublicHref } from '../utils/publicLinks';

interface PublicHeroCard {
  id: string;
  image: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  cta: string;
  ctaAr: string;
  href: string;
  background: string;
  luminance: number;
}

interface HeroSettings {
  enabled: boolean;
  autoplay: boolean;
  autoplayIntervalMs: number;
  paginationVisible: boolean;
}

const DEFAULT_SETTINGS: HeroSettings = { enabled: true, autoplay: false, autoplayIntervalMs: 5000, paginationVisible: true };

export const HeroCarousel: React.FC = () => {
  const { tr, locale } = useLocale();
  const [cards, setCards] = useState<PublicHeroCard[]>([]);
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/public/hero-slides', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/public/hero-carousel-settings', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([slides, config]) => {
      if (controller.signal.aborted) return;
      setCards(Array.isArray(slides?.data) ? slides.data : []);
      if (config?.data) setSettings({ ...DEFAULT_SETTINGS, ...config.data });
      setLoaded(true);
    });
    return () => controller.abort();
  }, []);

  const count = cards.length;

  const goTo = (next: number) => {
    const track = trackRef.current;
    const target = ((next % count) + count) % count;
    setIndex(target);
    const child = track?.children[target] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  // Défilement automatique : uniquement si l'Admin l'a activé, en pause au survol/focus,
  // et jamais pour les utilisateurs qui demandent moins de mouvement.
  useEffect(() => {
    if (!settings.autoplay || paused || count < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => goTo(index + 1), settings.autoplayIntervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoplay, settings.autoplayIntervalMs, paused, count, index]);

  // Synchronise les points avec le geste manuel (swipe / scroll).
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || count === 0) return;
    const width = track.clientWidth || 1;
    const next = Math.round(track.scrollLeft / width);
    if (next !== index && next >= 0 && next < count) setIndex(next);
  };

  if (!loaded || !settings.enabled || count === 0) return null;

  return (
    <section
      data-hero
      data-hero-layout="carousel"
      id="home-hero"
      aria-roledescription="carrousel"
      aria-label={tr('Sélection AYROVI', 'اختيارات AYROVI')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ position: 'relative', width: '100%' }}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {cards.map((card, position) => {
          const title = (locale === 'ar' && card.titleAr) || card.title;
          const subtitle = (locale === 'ar' && card.subtitleAr) || card.subtitle;
          const cta = (locale === 'ar' && card.ctaAr) || card.cta;
          const href = safePublicHref(card.href);
          const ink = card.luminance > 0.45 ? '#1A1A1A' : '#FFFFFF';
          return (
            <article
              key={card.id}
              role="group"
              aria-roledescription="diapositive"
              aria-label={`${position + 1} / ${count}`}
              style={{ flex: '0 0 100%', scrollSnapAlign: 'start', background: card.background, color: ink, boxSizing: 'border-box', padding: '20px 16px 24px' }}
            >
              <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                {title ? <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px, 4vw, 40px)', lineHeight: 1.15 }} dir="auto">{title}</h2> : null}
                {subtitle ? <p style={{ margin: '0 0 16px', fontSize: 'clamp(15px, 2vw, 18px)' }} dir="auto">{subtitle}</p> : null}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', maxHeight: '80vh', overflow: 'hidden', borderRadius: 16 }}>
                  {card.image ? (
                    <img src={card.image} alt="" loading={position === 0 ? 'eager' : 'lazy'} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : null}
                </div>
                {cta && href ? (
                  <a href={href} style={{ display: 'inline-flex', marginTop: 16, minHeight: 44, alignItems: 'center', color: 'inherit', fontWeight: 700 }}>
                    {cta}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {settings.paginationVisible && count > 1 ? (
        <div role="group" aria-label={tr('Choisir une carte', 'اختيار بطاقة')} style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
          {cards.map((card, position) => (
            <button
              key={card.id}
              type="button"
              aria-label={`${position + 1} / ${count}`}
              aria-current={position === index ? 'true' : undefined}
              onClick={() => goTo(position)}
              style={{ width: 10, height: 10, borderRadius: 999, border: 0, padding: 0, cursor: 'pointer', background: position === index ? '#1A1A1A' : '#BDBDBD' }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
};
