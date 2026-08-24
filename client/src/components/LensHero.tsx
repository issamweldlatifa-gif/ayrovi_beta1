import React, { useEffect, useState } from 'react';
import heroFemme from '../assets/hero-femme.jpg';

/**
 * AYROVIX LENS — HERO 01 (قسم مستقل بعد قسم الماركات)
 * BACKGROUND + CONTENT + iPHONE MOCKUP — كل عنصر مستقل قابل للإدارة.
 * الخلفية من الـAdmin (لون/صورة + Overlay + Focal) والمحتوى كذلك.
 * داخل الهاتف: إعادة عرض لواجهة Lens الحقيقية (مسح/نتيجة/سعر).
 */

interface LensHeroData {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  bgType: 'COLOR' | 'IMAGE';
  bgColor: string;
  bgImage: string;
  overlayStrength: number;
  focalX: number;
  focalY: number;
  phoneEnabled: boolean;
  enabled: boolean;
}

const DEFAULTS: LensHeroData = {
  eyebrow: 'LENS',
  title: 'Analysez. Comparez. Achetez mieux.',
  description: 'Prenez une photo ou importez une image. LENS analyse le produit, compare les prix et vous donne les meilleures options en quelques secondes.',
  ctaLabel: 'Ouvrir LENS',
  bgType: 'COLOR',
  bgColor: '#F6F7F9',
  bgImage: '',
  overlayStrength: 0.25,
  focalX: 0.5,
  focalY: 0.45,
  phoneEnabled: true,
  enabled: true,
};

/** واجهة Lens الحقيقية معروضة داخل إطار iPhone */
const LensPhone: React.FC = () => (
  <div className="lens-phone" aria-hidden>
    <div className="lens-phone__frame">
      <span className="lens-phone__island" />
      <div className="lens-phone__screen">
        {/* شريط علوي */}
        <div className="lens-phone__status"><span>9:41</span><span>AYROVI LENS</span></div>
        {/* منطقة المسح */}
        <div className="lens-phone__scan">
          <img src={heroFemme} alt="" className="lens-phone__photo" />
          <span className="lens-phone__corner tl" /><span className="lens-phone__corner tr" />
          <span className="lens-phone__corner bl" /><span className="lens-phone__corner br" />
          <span className="lens-phone__beam" />
        </div>
        {/* نتيجة التحليل */}
        <div className="lens-phone__result">
          <strong>Produit identifié</strong>
          <span className="lens-phone__name">Sneakers blancues — 89,00 €</span>
          <div className="lens-phone__meta">
            <span className="lens-phone__chip is-on">≈ 298,900 TND</span>
            <span className="lens-phone__chip">7 jours</span>
            <span className="lens-phone__chip">Disponible</span>
          </div>
          <span className="lens-phone__cta">Ajouter au panier</span>
        </div>
      </div>
    </div>
  </div>
);

export const LensHero: React.FC<{ onOpenLens?: () => void }> = ({ onOpenLens }) => {
  const [data, setData] = useState<LensHeroData>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/lens-hero')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result?.data) return;
        setData({ ...DEFAULTS, ...result.data });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!data.enabled) return null;

  const focal = `${Math.round(data.focalX * 100)}% ${Math.round(data.focalY * 100)}%`;

  return (
    <section aria-label="AYROVIX Lens" className="lens-hero mt-20 lg:mt-24" style={{ marginInline: '24px' }}>
      <div
        className="lens-hero__bg relative overflow-hidden rounded-[24px] lg:rounded-[28px]"
        style={{ background: data.bgType === 'IMAGE' && data.bgImage ? undefined : data.bgColor }}
      >
        {data.bgType === 'IMAGE' && data.bgImage && (
          <>
            <img src={data.bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: focal }} loading="lazy" />
            <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(255,255,255,${data.overlayStrength * 0.85}) 0%, rgba(255,255,255,${data.overlayStrength * 0.55}) 45%, rgba(255,255,255,${data.overlayStrength}) 100%)` }} />
          </>
        )}

        <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:py-14">
          {/* المحتوى */}
          <div className="lens-hero__content order-1 max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#FF7A00]">{data.eyebrow}</p>
            <h2 className="lens-hero__title ay-edit-36 mt-3 text-ink">
              {data.title.split('.').filter(Boolean).map((line, index, all) => (
                <React.Fragment key={index}>{line.trim()}.{index < all.length - 1 && <br />}</React.Fragment>
              ))}
            </h2>
            <p className="mt-4 max-w-md text-[14.5px] leading-[1.65] text-muted sm:text-base">{data.description}</p>
            <button
              type="button"
              onClick={() => onOpenLens?.()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-black"
            >
              {data.ctaLabel}
            </button>
            <p className="mt-4 text-[12.5px] font-bold tracking-[0.04em] text-muted">Fiable. Rapide. Intelligent.</p>
          </div>

          {/* iPhone Mockup — عنصر مستقل */}
          {data.phoneEnabled && <div className="order-2 flex justify-center lg:justify-end">{<LensPhone />}</div>}
        </div>
      </div>
    </section>
  );
};
