import React, { useEffect, useState } from 'react';

/**
 * EVERGREEN HERO — AYROVI
 * المحتوى ثابت حرفياً ولا يُدار من الـ Admin (المواصفة #26):
 * Headline + Description + هوية Black/White/Orange + بلا CTA + بلا Carousel.
 * الـ Visual الوحيد ديناميكي من GET /api/public/hero/active مع Focal Point.
 */

const HEADLINE = 'Vous le voyez. AYROVI vous le livre.';
const DESCRIPTION = 'Mode, beauté, technologie, maison… trouvez votre produit en ligne, envoyez-nous son lien ou sa photo, et AYROVI s’occupe de l’achat, de l’importation et de la livraison.';

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
        if (cancelled || !result?.success?.imageUrl) return;
        setVisual({ ...FALLBACK_VISUAL, ...result.data });
      })
      .catch(() => {/* الافتراضي يبقى */});
    return () => { cancelled = true; };
  }, []);

  // أبعاد ثابتة لمنع Layout Shift — aspect-ratio محجوز دائماً
  const aspectDesktop = 'aspect-[4/3] lg:aspect-[16/11]';
  const focal = `${Math.round(visual.focalX * 100)}% ${Math.round(visual.focalY * 100)}%`;

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
          sizes="(max-width: 1024px) 100vw, 50vw"
          width={visual.imageWidth || 1600}
          height={visual.imageHeight || 1100}
          alt={visual.altText}
          fetchPriority="high"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          style={{ objectPosition: focal }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
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
    >
      <div className="mx-auto w-full max-w-7xl px-5 pb-10 pt-24 sm:px-6 sm:pt-28 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 lg:pb-16 lg:pt-16">
        {/* ===== Copy Area — ثابت ==== */}
        <div className="hero-copy-area relative z-10 order-1 lg:max-w-xl">
          <span aria-hidden className="mb-5 block h-1 w-14 rounded-full bg-[#FE7003]" />
          <h1 className="evergreen-hero-title text-white">
            Vous le voyez.
            <br />
            <span className="text-[#FE7003]">AYROVI</span> vous le livre.
          </h1>
          <p className="evergreen-hero-desc mt-5 max-w-lg font-medium text-white/70 lg:mt-6">
            {DESCRIPTION}
          </p>
        </div>

        {/* ===== Hero Visual — واحد فقط، متجاوب، Focal Point ==== */}
        <figure className="order-2 mt-8 w-full lg:mt-0">
          <div className={`hero-visual-frame relative w-full overflow-hidden rounded-2xl bg-[#1b1c23] ${aspectDesktop}`}>
            <span aria-hidden className="pointer-events-none absolute -inset-x-8 -bottom-10 top-1/2 z-[1] rounded-full bg-[#FE7003]/10 blur-3xl" />
            {image()}
          </div>
        </figure>
      </div>
      {/* فاصل برتقالي رفيع أسفل الـ Hero — accent فقط */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#FE7003]/60 to-transparent" />
    </section>
  );
};
