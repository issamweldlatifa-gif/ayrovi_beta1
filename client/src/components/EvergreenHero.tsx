import React, { useEffect, useState } from 'react';

/**
 * AYROVI HERO — FULL-BLEED DYNAMIC IMAGE HERO (mobile-first)
 * الصورة هي الـHero (طبقة تغطي كامل المساحة) والنص يعيش فوقها.
 * تكيف تلقائي: تحليل الإضاءة يحدد قوة الـoverlay، واللون السائد يضيف
 * لمسة atmosphere خفيفة — هوية AYROVI (أسود/أبيض/برتقالي) ثابتة دائماً.
 * المحتوى ثابت حرفياً + بلا CTA. الصورة والمواضع والـoverlay من الـAdmin.
 */

const HEADLINE_A = 'Vous le voyez.';
const HEADLINE_B = 'AYROVI vous le livre.';
const DESCRIPTION = 'Mode, beauté, technologie, maison… trouvez ce que vous cherchez. AYROVI s’occupe du reste.';

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
      style={positionVars}
    >
      {/* ===== طبقة الصورة — الصورة هي الـHero (Full-Bleed) ===== */}
      <div className="absolute inset-0" aria-hidden={false}>
        {image()}
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: overlay }} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: ambient }} />
      </div>

      {/* ===== المحتوى فوق الصورة — ثابت، بدون CTA ===== */}
      <div
        className={`evergreen-hero-content evergreen-hero-content--${orientation} relative z-10 mx-auto flex w-full max-w-7xl flex-col px-6 pb-14 pt-[88px] sm:pt-[104px] lg:px-8 lg:pb-16 lg:pt-[120px] ${textAtBottom ? 'justify-end' : 'justify-start'}`}
      >
        <div className="relative max-w-xl">
          <span aria-hidden className="mb-4 block h-1 w-24 rounded-full bg-[#FE7003] lg:w-[120px]" />
          <h1 className="evergreen-hero-title hero-anim-up-1 text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
            {HEADLINE_A}
            <br />
            <span className="text-[#FE7003]">AYROVI</span> vous le livre.
          </h1>
          <p className="evergreen-hero-desc hero-anim-up-2 mt-4 max-w-[90%] font-medium text-white/85 [text-shadow:0_1px_16px_rgba(0,0,0,0.35)] sm:mt-5 lg:mt-6 lg:max-w-[600px]">
            {DESCRIPTION}
          </p>
        </div>
      </div>

      {/* فاصل برتقالي رفيع أسفل الـHero — accent فقط */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-px bg-gradient-to-r from-transparent via-[#FE7003]/60 to-transparent" />
    </section>
  );
};
