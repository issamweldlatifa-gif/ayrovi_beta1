import React, { useEffect, useState } from 'react';

/**
 * SUPPORTED BRANDS SHOWCASE — فصل بعد Discovery
 *
 * الهيكل المطلوب (Zalando-style):
 *   Section → Heading block → Title → Subtitle → 32px → Full-width slider
 *
 * العنوان والوصف خارج الـ slider تماماً: كتلة نصية ثابتة في تدفق الصفحة
 * بـ padding أفقي 24px، بينما الـ slider وحدة بصرية مستقلة بعرض الشاشة
 * (تخرج من أي container). على الهاتف: سحب أفقي أصلي مع snap وبطاقة تالية
 * ظاهرة جزئياً. على Desktop: نفس الـ ambient marquee الحالي.
 *
 * يحترم prefers-reduced-motion (إيقاف الحركة + سحب يدوي).
 */

interface Brand { id: string; name: string; logo: string; category: string; url: string; }

const CATEGORY_LABELS: Record<string, string> = {
  FASHION: 'Fashion', SPORT_LIFESTYLE: 'Sport', BEAUTY: 'Beauté', TECH: 'Tech', HOME: 'Maison', OTHER: 'Boutique',
};

/** Desktop = marquee محيطي (يحتاج نسختين من القائمة)، الهاتف = سحب أصلي (نسخة واحدة) */
const useIsDesktopViewport = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return isDesktop;
};

export const BrandsShowcase: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const isDesktop = useIsDesktopViewport();

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
      aria-hidden={isDesktop && index >= brands.length}
      tabIndex={isDesktop && index >= brands.length ? -1 : undefined}
    >
      <span className="brand-tile__logo">
        {brand.logo ? <img src={brand.logo} alt="" loading="lazy" /> : <span className="brand-tile__letter">{brand.name.slice(0, 1)}</span>}
      </span>
      <span className="brand-tile__name">{brand.name}</span>
      {brand.category && <span className="brand-tile__cat">{CATEGORY_LABELS[brand.category] || brand.category}</span>}
    </a>
  );

  // Desktop: نسختان لحلقة الـ marquee المستمرة. الهاتف: نسخة واحدة قابلة للسحب.
  const railItems = isDesktop ? [...brands, ...brands] : brands;

  return (
    <section aria-label="Marques disponibles" className="brands-section">
      {/* ===== Heading block — في تدفق الصفحة، خارج الـ slider ===== */}
      <div className="brands-heading">
        <h2 className="brands-heading__title">Les marques que vous aimez.</h2>
        <p className="brands-heading__subtitle">Découvrez les marques et boutiques disponibles avec AYROVI.</p>
      </div>

      {/* ===== Full-width visual module — وحدة مستقلة بعرض الشاشة ===== */}
      <div className="brands-rail">
        <div className="brands-marquee" aria-label="Marques">
          <div className="brands-marquee__track">
            {railItems.map((brand, index) => tile(brand, index))}
          </div>
        </div>
      </div>
    </section>
  );
};
