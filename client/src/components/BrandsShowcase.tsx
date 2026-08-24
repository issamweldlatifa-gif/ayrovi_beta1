import React, { useEffect, useState } from 'react';

/**
 * SUPPORTED BRANDS SHOWCASE — فصل جديد بعد Discovery
 * عنوان تحريري متمركز + عرض ماركات ببطء ambient marquee (من بيانات
 * الماركات القائمة في النظام فقط). خلفية بيضاء، Orange كـaccent فقط.
 * يحترم prefers-reduced-motion (إيقاف الحركة + سحب يدوي).
 */

interface Brand { id: string; name: string; logo: string; category: string; url: string; }

const CATEGORY_LABELS: Record<string, string> = {
  FASHION: 'Fashion', SPORT_LIFESTYLE: 'Sport', BEAUTY: 'Beauté', TECH: 'Tech', HOME: 'Maison', OTHER: 'Boutique',
};

export const BrandsShowcase: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/brands')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !Array.isArray(result?.data) || !result.data.length) return;
        setBrands(result.data.slice(0, 14));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // لا نخترع بيانات: بدون ماركات مفعّلة يُخفى القسم
  if (!brands.length) return null;

  const tile = (brand: Brand, index: number) => (
    <a
      key={`${brand.id}-${index}`}
      href={/^https?:\/\//i.test(brand.url || '') ? brand.url : undefined}
      target={brand.url ? '_blank' : undefined}
      rel="noreferrer"
      aria-label={brand.url ? `${brand.name} — ouvrir la boutique` : brand.name}
      className="brand-tile group"
    >
      <span className="brand-tile__logo">
        {brand.logo ? <img src={brand.logo} alt="" loading="lazy" /> : <span className="brand-tile__letter">{brand.name.slice(0, 1)}</span>}
      </span>
      <span className="brand-tile__name">{brand.name}</span>
      {brand.category && <span className="brand-tile__cat">{CATEGORY_LABELS[brand.category] || brand.category}</span>}
    </a>
  );

  return (
    <section aria-label="Marques disponibles" className="mt-14 rounded-[24px] bg-[#111217] px-5 py-10 sm:px-6 lg:mx-auto lg:max-w-7xl lg:rounded-[28px] lg:px-10 lg:py-12" style={{ marginInline: '12px' }}>
      <div className="text-center">
        <h2 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[26px]">Les marques que vous aimez.</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-[1.6] text-white/60 sm:text-[15px]">Découvrez les marques et boutiques disponibles avec AYROVI.</p>
      </div>

      {/* عرض الماركات: شريط بطيء شبه محيط — نسختان للحلقة المستمرة */}
      <div className="brands-marquee mt-7 overflow-hidden" aria-label="Marques">
        <div className="brands-marquee__track">
          {[...brands, ...brands].map((brand, index) => tile(brand, index))}
        </div>
      </div>
    </section>
  );
};
