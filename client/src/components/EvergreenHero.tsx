import React, { useEffect, useMemo, useState } from 'react';

/**
 * AYROVI HERO — FULL-BLEED DYNAMIC IMAGE HERO (mobile-first)
 * الصورة هي الـHero (طبقة تغطي كامل المساحة) والنص يعيش فوقها.
 * تكيف تلقائي: تحليل الإضاءة يحدد قوة الـoverlay، واللون السائد يضيف
 * لمسة atmosphere خفيفة — هوية AYROVI (أسود/أبيض/برتقالي) ثابتة دائماً.
 *
 * Dashboard = Control · CMS = Source of Truth · Frontend = Presentation:
 * العنوان، الوصف، الـ eyebrow، الـ CTA ورابطه، ترتيب العناصر والكلمة
 * المميّزة كلها من /api/public/hero-content (Admin → Contenu → Hero).
 * الصورة والمواضع والـoverlay من /api/public/hero/active.
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

/** قوة الـOverlay: AUTO من الإضاءة (فاتحة ← أقوى لضمان القراءة) أو يدوية من الـAdmin */
const resolveOverlayStrength = (visual: HeroVisual): number => {
  if (visual.overlayMode === 'MANUAL' && visual.overlayStrength !== null && Number.isFinite(visual.overlayStrength)) {
    return Math.min(1, Math.max(0, visual.overlayStrength));
  }
  const luminance = visual.analysis?.luminance;
  if (luminance === undefined || luminance === null) return 0.3;
  if (luminance < 0.35) return 0.18;
  if (luminance > 0.6) return 0.5;
  return 0.32;
};

export const EvergreenHero: React.FC = () => {
  const [visual, setVisual] = useState<HeroVisual>(FALLBACK_VISUAL);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState<HeroContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/hero/active')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result?.data?.imageUrl) return;
        setVisual((current) => ({ ...current, ...result.data }));
      })
      .catch(() => {/* الافتراضي يبقى — لا Hero مكسور أبداً */});
    return () => { cancelled = true; };
  }, []);

  // محتوى الـ Hero من الـ CMS — لا نص ثابت في الكود
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/hero-content')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (!cancelled && result?.data) setContent(result.data as HeroContent); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const keys = useMemo(() => orderedKeys(content?.elementOrder || ''), [content?.elementOrder]);

  const strength = resolveOverlayStrength(visual);
  const dominant = visual.analysis?.dominantColor || '#302926';

  // ===== تكيف الاتجاه: الـHero يتبع الصورة (لا ratio مفروض) =====
  const orientation = visual.orientation || 'landscape';
  const topLum = visual.analysis?.topLuminance;
  const bottomLum = visual.analysis?.bottomLuminance;
  // موضع النص: فوق المنطقة الأدكن إن توفر التحليل، وإلا الأعلى (الافتراضي الحالي)
  const textAtBottom = typeof topLum === 'number' && typeof bottomLum === 'number' && bottomLum + 0.08 < topLum;

  // طبقة الحماية التكيفية: أعلى أدكن (هيدر + نص) وأسفل متوسط — تحافظ على الصورة ظاهرة
  const overlay = `linear-gradient(180deg, rgba(11,12,16,${(0.38 + strength * 0.32).toFixed(2)}) 0%, rgba(11,12,16,${(strength * 0.42).toFixed(2)}) 46%, rgba(11,12,16,${(strength * 0.8).toFixed(2)}) 100%)`;
  // لمسة atmosphere خفيفة جداً من اللون السائد للصورة (لا تغيّر هوية العلامة)
  const ambient = `radial-gradient(85% 65% at 22% 26%, ${dominant}2E 0%, transparent 68%)`;

  const positionVars = {
    '--hero-pos-desktop': `${Math.round(visual.focalX * 100)}% ${Math.round(visual.focalY * 100)}%`,
    '--hero-pos-mobile': `${Math.round(visual.mobileFocalX * 100)}% ${Math.round(visual.mobileFocalY * 100)}%`,
  } as React.CSSProperties;

  // ===== المحتوى من الـ CMS =====
  const accent = content?.accentColor || '#FE7003';
  const highlight = (content?.highlight || '').trim();
  const titleLines = String(content?.title || '').split('\n').map((line) => line.trim()).filter(Boolean);

  /** يلوّن الكلمة المميّزة (افتراضياً AYROVI) بلون الـ accent داخل العنوان */
  const renderHighlightedLine = (line: string, lineIndex: number): React.ReactNode => {
    if (!highlight || !line.includes(highlight)) return line;
    const at = line.indexOf(highlight);
    return (
      <React.Fragment key={`hl-${lineIndex}`}>
        {line.slice(0, at)}
        <span style={{ color: accent }}>{highlight}</span>
        {line.slice(at + highlight.length)}
      </React.Fragment>
    );
  };

  const image = () => {
    const mobileSet = visual.mobileSrcset.length ? srcsetValue(visual.mobileSrcset) : srcsetValue(visual.srcset);
    return (
      <picture>
        {visual.mobileImageUrl && mobileSet && (
          <source media="(max-width: 1023px)" srcSet={mobileSet} />
        )}
        <img
          src={visual.imageUrl}
          srcSet={srcsetValue(visual.srcset)}
          sizes="100vw"
          width={visual.imageWidth || 1600}
          height={visual.imageHeight || 900}
          alt={visual.altText || 'Sélection de produits internationaux livrés en Tunisie par AYROVI'}
          fetchPriority="high"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          style={{ objectPosition: 'var(--hero-pos-desktop, 50% 45%)' }}
          className={`evergreen-hero-img absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </picture>
    );
  };

  return (
    <section
      data-hero
      id="home-hero"
      aria-label="AYROVI — achat international et livraison en Tunisie"
      className="evergreen-hero-section relative -mt-16 w-full overflow-hidden bg-[#111217] text-white sm:-mt-20"
      style={{ ...positionVars, '--hero-ratio': String(visual.imageWidth && visual.imageHeight ? visual.imageWidth / visual.imageHeight : 1.6) } as React.CSSProperties}
    >
      {/* ===== طبقة الصورة — الصورة هي الـHero (Full-Bleed) ===== */}
      <div className="absolute inset-0" aria-hidden={false}>
        {image()}
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: overlay }} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: ambient }} />
      </div>

      {/* ===== المحتوى فوق الصورة — من الـ CMS، بترتيب عناصر قابل للإدارة ===== */}
      <div
        className={`evergreen-hero-content relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col justify-center px-6 pb-12 pt-[96px] sm:pt-[104px] lg:px-8 lg:pb-14 lg:pt-[120px] ${textAtBottom ? 'justify-end' : 'justify-center'}`}
      >
        {content?.enabled === false ? null : (
          <div className="relative max-w-xl" style={{ '--ay-hero-accent': accent } as React.CSSProperties}>
            {keys.map((key) => {
              if (key === 'eyebrow') {
                return content?.eyebrow
                  ? <p key="eyebrow" className="hero-anim-up-1 mb-3 text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: accent }}>{content.eyebrow}</p>
                  : <span key="rule" aria-hidden className="mb-4 block h-1 w-24 rounded-full lg:w-[120px]" style={{ background: accent }} />;
              }
              if (key === 'title') {
                return (
                  <h1 key="title" className="evergreen-hero-title hero-anim-up-1 text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
                    {titleLines.map((line, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && <br />}
                        {renderHighlightedLine(line, index)}
                      </React.Fragment>
                    ))}
                  </h1>
                );
              }
              if (key === 'description') {
                return content?.description
                  ? (
                    <p className="evergreen-hero-desc hero-anim-up-2 mt-4 max-w-[90%] font-medium text-white/85 [text-shadow:0_1px_16px_rgba(0,0,0,0.35)] sm:mt-5 lg:mt-6 lg:max-w-[600px]">
                      {content.description}
                    </p>
                  )
                  : null;
              }
              if (!content?.ctaLabel) return null;
              const ctaClass = 'hero-anim-up-3 mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5';
              const ctaStyle = { background: accent, boxShadow: '0 10px 26px -14px rgba(0,0,0,0.6)' } as React.CSSProperties;
              return /^(\/[^/]|#)/.test(content.ctaUrl) || /^https?:\/\//i.test(content.ctaUrl)
                ? <a key="cta" href={content.ctaUrl} className={ctaClass} style={ctaStyle}>{content.ctaLabel}</a>
                : <button key="cta" type="button" className={ctaClass} style={ctaStyle}>{content.ctaLabel}</button>;
            })}
          </div>
        )}
      </div>

      {/* فاصل برتقالي رفيع أسفل الـHero — accent فقط */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-px bg-gradient-to-r from-transparent via-[#FE7003]/60 to-transparent" />
    </section>
  );
};
