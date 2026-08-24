import React, { useEffect, useState } from 'react';

/**
 * EVERGREEN HERO — AYROVI (final dynamic visual system)
 * المحتوى ثابت حرفياً: Headline + Description قصير + بلا CTA.
 * Dark Hero background + Typography + Large full-width Hero Image تحتها.
 * الصورة ديناميكية من الـAdmin مع موضعي قصّ مستقلين (Desktop / Mobile).
 */

const HEADLINE_A = 'Vous le voyez.';
const HEADLINE_B = 'AYROVI vous le livre.';
const DESCRIPTION = 'Mode, beauté, technologie, maison… trouvez ce que vous cherchez. AYROVI s’occupe du reste.';

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
  isDefault: true,
};

const srcsetValue = (entries: Array<{ url: string; width: number }>): string | undefined =>
  entries.length ? entries.map((entry) => `${entry.url} ${entry.width}w`).join(', ') : undefined;

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

  // موضعا القصّ: Desktop (focal) و Mobile (mobileFocal) — يتحكم بهما الـAdmin
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
      className="relative -mt-16 w-full bg-[#111217] text-white sm:-mt-20"
      style={positionVars}
    >
      <div className="mx-auto w-full max-w-7xl px-6 pb-8 pt-[72px] sm:pt-24 lg:px-8 lg:pb-14 lg:pt-14">
        {/* ===== Copy Area — ثابت، بدون CTA ===== */}
        <div className="relative z-10">
          <span aria-hidden className="mb-7 block h-1 w-24 rounded-full bg-[#FE7003] lg:mb-8 lg:w-[120px]" />
          <h1 className="evergreen-hero-title hero-anim-up-1 text-white">
            {HEADLINE_A}
            <br />
            <span className="text-[#FE7003]">AYROVI</span> vous le livre.
          </h1>
          <p className="evergreen-hero-desc hero-anim-up-2 mt-5 max-w-[640px] font-medium text-white/75 lg:mt-6">
            {DESCRIPTION}
          </p>
        </div>

        {/* ===== LARGE HERO VISUAL — بعرض الحاوية كاملاً تحت المحتوى ===== */}
        <figure className="hero-anim-fade-3 mt-7 w-full lg:mt-8">
          <div
            className="evergreen-hero-visual relative w-full overflow-hidden rounded-[24px] bg-[#1b1c23]"
            style={{ height: 'clamp(320px, 82vw, 420px)' }}
            data-height-mobile
          >
            {image()}
          </div>
        </figure>
      </div>
      {/* فاصل برتقالي رفيع أسفل الـ Hero — accent فقط */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#FE7003]/60 to-transparent" />
    </section>
  );
};
