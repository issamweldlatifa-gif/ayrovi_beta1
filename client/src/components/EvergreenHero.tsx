import React, { useEffect, useMemo, useState } from 'react';
import { buttonClasses } from '../design/Button';
import { ArrowRight } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { safePublicHref } from '../utils/publicLinks';

/** Editorial composition. CMS owns copy, order, links, images and focal points.
 * Text lives on canvas rather than over media; historical overlay metadata stays in the API.
 */
interface HeroContent {
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  accentColor: string;
  elementOrder: string;
  enabled: boolean;
}

type HeroElementKey = 'eyebrow' | 'title' | 'description' | 'cta';
const HERO_ELEMENT_KEYS: HeroElementKey[] = ['eyebrow', 'title', 'description', 'cta'];

const orderedKeys = (elementOrder: string): HeroElementKey[] => {
  const requested = String(elementOrder || '').split(',').map((token) => token.trim().toLowerCase());
  const kept = requested.filter((token, index): token is HeroElementKey =>
    (HERO_ELEMENT_KEYS as string[]).includes(token) && requested.indexOf(token) === index);
  HERO_ELEMENT_KEYS.forEach((key) => { if (!kept.includes(key)) kept.push(key); });
  return kept;
};

interface HeroAnalysis { luminance: number; brightness: string; dominantColor: string; orientation?: string; topLuminance?: number; bottomLuminance?: number; }

interface HeroVisual {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  srcset: Array<{ url: string; width: number }>;
  mobileImageUrl: string;
  mobileSrcset: Array<{ url: string; width: number }>;
  altText: string;
  focalX: number;
  focalY: number;
  mobileFocalX: number;
  mobileFocalY: number;
  overlayMode: 'AUTO' | 'MANUAL';
  overlayStrength: number | null;
  orientation?: 'landscape' | 'portrait' | 'square';
  orientationOverride?: 'AUTO' | 'LANDSCAPE' | 'PORTRAIT';
  analysis: HeroAnalysis | null;
  isDefault: boolean;
}

const FALLBACK_VISUAL: HeroVisual = {
  imageUrl: '/media/hero-default.jpg',
  imageWidth: 1312,
  imageHeight: 816,
  srcset: [
    { url: '/media/hero-default_640.webp', width: 640 },
    { url: '/media/hero-default_1024.webp', width: 1024 },
    { url: '/media/hero-default_1600.webp', width: 1600 },
  ],
  mobileImageUrl: '',
  mobileSrcset: [],
  altText: '',
  focalX: 0.5,
  focalY: 0.45,
  mobileFocalX: 0.5,
  mobileFocalY: 0.45,
  overlayMode: 'AUTO',
  overlayStrength: null,
  analysis: { luminance: 0.16, brightness: 'dark', dominantColor: '#302926' },
  isDefault: true,
};

const srcsetValue = (entries: Array<{ url: string; width: number }>): string | undefined =>
  entries.length ? entries.map((entry) => `${entry.url} ${entry.width}w`).join(', ') : undefined;

export const EvergreenHero: React.FC = () => {
  const { tr } = useLocale();
  const [visual, setVisual] = useState<HeroVisual>(FALLBACK_VISUAL);
  const [content, setContent] = useState<HeroContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/hero/active', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (controller.signal.aborted || !result?.data?.imageUrl) return;
        setVisual({ ...FALLBACK_VISUAL, ...result.data,
          srcset: Array.isArray(result.data.srcset) ? result.data.srcset : [],
          mobileSrcset: Array.isArray(result.data.mobileSrcset) ? result.data.mobileSrcset : [],
        });
      }).catch(() => undefined);
    fetch('/api/public/hero-content', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted && result?.data) setContent(result.data); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, []);

  const keys = useMemo(() => orderedKeys(content?.elementOrder || ''), [content?.elementOrder]);
  const href = safePublicHref(content?.ctaUrl);
  const highlight = content?.highlight?.trim();
  const titleLines = String(content?.title || '').split('\n').map(line => line.trim()).filter(Boolean);
  const highlighted = (line: string) => {
    if (!highlight || !line.includes(highlight)) return line;
    const at = line.indexOf(highlight);
    return <>{line.slice(0, at)}<span className="editorial-hero__highlight">{highlight}</span>{line.slice(at + highlight.length)}</>;
  };
  const focal = (n: number) => Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 100) : 50;
  const position = {
    '--hero-pos-desktop': `${focal(visual.focalX)}% ${focal(visual.focalY)}%`,
    '--hero-pos-mobile': `${focal(visual.mobileFocalX)}% ${focal(visual.mobileFocalY)}%`,
  } as React.CSSProperties;

  return <section data-hero data-hero-layout="editorial" id="home-hero" className="editorial-hero" aria-label={tr('AYROVI — achat international', 'AYROVI — التسوق الدولي')}>
    <div className="editorial-hero__inner">
      {content?.enabled !== false && <div className="editorial-hero__copy" aria-busy={contentLoading}>
        {contentLoading ? <div className="editorial-hero__loading" role="status">{tr('Chargement…', 'جارٍ التحميل…')}</div> : !content ? <><h1 className="editorial-hero__title">AYROVI</h1><p className="editorial-hero__desc">{tr('Le contenu est momentanément indisponible.', 'المحتوى غير متاح مؤقتًا.')}</p></> : keys.map(key => {
          if (key === 'eyebrow') return content.eyebrow?.trim() ? <p key={key} className="editorial-hero__eyebrow"><span className="ay-e-marker" aria-hidden="true" />{content.eyebrow}</p> : null;
          if (key === 'title') return titleLines.length > 0 ? <h1 key={key} className="editorial-hero__title" dir="auto">{titleLines.map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{highlighted(line)}</React.Fragment>)}</h1> : null;
          if (key === 'description') return content.description ? <p key={key} className="editorial-hero__desc" dir="auto">{content.description}</p> : null;
          // Invalid/unconfigured destinations never produce an apparently working button.
          return content.ctaLabel && href ? <a key={key} href={href} className={buttonClasses('primary', 'md', 'editorial-hero__action')}>{content.ctaLabel}<ArrowRight size={20} /></a> : null;
        })}
      </div>}
      <div className="editorial-hero__media" style={position}>
        {imageFailed ? <p role="status">{tr('Image momentanément indisponible', 'الصورة غير متاحة مؤقتًا')}</p> : <picture>
          {visual.mobileImageUrl && <source media="(max-width: 767px)" srcSet={srcsetValue(visual.mobileSrcset) || visual.mobileImageUrl} />}
          <img src={visual.imageUrl} srcSet={srcsetValue(visual.srcset)} sizes="(min-width: 768px) 50vw, 100vw" width={visual.imageWidth || 1600} height={visual.imageHeight || 900}
            alt={visual.altText || ''} fetchPriority="high" decoding="async"
            onError={() => { if (!visual.isDefault) setVisual(FALLBACK_VISUAL); else setImageFailed(true); }} />
        </picture>}
      </div>
    </div>
  </section>;
};
