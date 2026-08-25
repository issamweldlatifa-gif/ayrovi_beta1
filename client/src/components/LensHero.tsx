import React, { useEffect, useMemo, useState } from 'react';

/**
 * AYROVIX LENS — قسم مستقل بعد قسم الماركات.
 *
 * قاعدة AYROVI: Dashboard = Control · Database/CMS = Source of Truth ·
 * Frontend = Presentation. لا يوجد أي نص أو صورة ثابتة في هذا الملف:
 * كل المحتوى (label، عنوان، وصف، CTA + رابطه، proof line، خلفية، accent،
 * ترتيب العناصر، mockup ومحتواه) يأتي من /api/public/lens-hero ويُدار من
 * Admin → Contenu → LENS. الواجهة مسؤولة فقط عن "كيف يظهر" (Responsive).
 *
 * Mobile-first: القسم بعرض الشاشة بالكامل، والـ mockup ≈ 88–92% من العرض.
 */

export interface LensPhoneContent {
  image: string;
  statusLabel: string;
  resultLabel: string;
  productName: string;
  priceChip: string;
  metaChip: string;
  stockChip: string;
  ctaLabel: string;
}

export interface LensHeroData {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  proofLine: string;
  accentColor: string;
  elementOrder: string;
  bgType: 'COLOR' | 'IMAGE';
  bgColor: string;
  bgImage: string;
  overlayStrength: number;
  focalX: number;
  focalY: number;
  phoneEnabled: boolean;
  enabled: boolean;
  phone: LensPhoneContent;
}

type LensElementKey = 'eyebrow' | 'title' | 'description' | 'cta' | 'proof';
const LENS_ELEMENT_KEYS: LensElementKey[] = ['eyebrow', 'title', 'description', 'cta', 'proof'];

const orderedKeys = (elementOrder: string): LensElementKey[] => {
  const requested = String(elementOrder || '').split(',').map((token) => token.trim().toLowerCase());
  const kept = requested.filter((token, index): token is LensElementKey =>
    (LENS_ELEMENT_KEYS as string[]).includes(token) && requested.indexOf(token) === index);
  LENS_ELEMENT_KEYS.forEach((key) => { if (!kept.includes(key)) kept.push(key); });
  return kept;
};

/** واجهة Lens الحقيقية معروضة داخل إطار iPhone — المحتوى كله من الـ CMS */
const LensPhone: React.FC<{ content: LensPhoneContent }> = ({ content }) => (
  <div className="lens-phone" aria-hidden>
    <div className="lens-phone__frame">
      <span className="lens-phone__island" />
      <div className="lens-phone__screen">
        {/* شريط علوي */}
        <div className="lens-phone__status"><span>9:41</span><span>{content.statusLabel}</span></div>
        {/* منطقة المسح */}
        <div className="lens-phone__scan">
          {content.image && <img src={content.image} alt="" className="lens-phone__photo" loading="lazy" />}
          <span className="lens-phone__corner tl" /><span className="lens-phone__corner tr" />
          <span className="lens-phone__corner bl" /><span className="lens-phone__corner br" />
          <span className="lens-phone__beam" />
        </div>
        {/* نتيجة التحليل */}
        <div className="lens-phone__result">
          {content.resultLabel && <strong>{content.resultLabel}</strong>}
          {content.productName && <span className="lens-phone__name">{content.productName}</span>}
          <div className="lens-phone__meta">
            {content.priceChip && <span className="lens-phone__chip is-on">{content.priceChip}</span>}
            {content.metaChip && <span className="lens-phone__chip">{content.metaChip}</span>}
            {content.stockChip && <span className="lens-phone__chip">{content.stockChip}</span>}
          </div>
          {content.ctaLabel && <span className="lens-phone__cta">{content.ctaLabel}</span>}
        </div>
      </div>
    </div>
  </div>
);

export const LensHero: React.FC<{ onOpenLens?: () => void }> = ({ onOpenLens }) => {
  const [data, setData] = useState<LensHeroData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/lens-hero')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result?.data) return;
        setData(result.data as LensHeroData);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const keys = useMemo(() => orderedKeys(data?.elementOrder || ''), [data?.elementOrder]);

  // لا محتوى = لا قسم (المصدر الوحيد هو الـ Dashboard)
  if (!data || !data.enabled) return null;

  const focal = `${Math.round((data.focalX ?? 0.5) * 100)}% ${Math.round((data.focalY ?? 0.45) * 100)}%`;
  const accent = data.accentColor || '#FF7A00';

  // العنوان: سطر لكل جملة (أو لكل سطر صريح) — قاعدة عرض فقط، النص من الـ CMS
  const titleLines = data.title.includes('\n')
    ? data.title.split('\n').map((line) => line.trim()).filter(Boolean)
    : data.title.split('.').map((line) => line.trim()).filter(Boolean).map((line) => `${line}.`);

  const ctaIsSafeLink = /^(\/[^/]|#)/.test(data.ctaUrl) || /^https?:\/\//i.test(data.ctaUrl);

  const elements: Record<LensElementKey, React.ReactNode> = {
    eyebrow: data.eyebrow
      ? <p key="eyebrow" className="lens-hero__eyebrow text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: accent }}>{data.eyebrow}</p>
      : null,
    title: titleLines.length
      ? (
        <h2 key="title" className="lens-hero__title ay-edit-36 mt-3 text-ink">
          {titleLines.map((line, index) => (
            <React.Fragment key={index}>{line}{index < titleLines.length - 1 && <br />}</React.Fragment>
          ))}
        </h2>
      )
      : null,
    description: data.description
      ? <p key="description" className="mt-4 max-w-md text-[14.5px] leading-[1.65] text-muted sm:text-base">{data.description}</p>
      : null,
    cta: data.ctaLabel
      ? (data.ctaUrl && ctaIsSafeLink
        ? (
          <a
            key="cta"
            href={data.ctaUrl}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-black"
          >
            {data.ctaLabel}
          </a>
        )
        : (
          <button
            key="cta"
            type="button"
            onClick={() => onOpenLens?.()}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-black"
          >
            {data.ctaLabel}
          </button>
        ))
      : null,
    proof: data.proofLine
      ? <p key="proof" className="lens-hero__proof mt-4 text-[12.5px] font-bold tracking-[0.04em] text-muted">{data.proofLine}</p>
      : null,
  };

  return (
    <section aria-label="AYROVIX Lens" className="lens-hero mt-12 lg:mt-24" style={{ '--ay-lens-accent': accent } as React.CSSProperties}>
      <div
        className="lens-hero__bg relative overflow-hidden rounded-none lg:rounded-[28px]"
        style={{ background: data.bgType === 'IMAGE' && data.bgImage ? undefined : data.bgColor }}
      >
        {data.bgType === 'IMAGE' && data.bgImage && (
          <>
            <img src={data.bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: focal }} loading="lazy" />
            <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(255,255,255,${data.overlayStrength * 0.85}) 0%, rgba(255,255,255,${data.overlayStrength * 0.55}) 45%, rgba(255,255,255,${data.overlayStrength}) 100%)` }} />
          </>
        )}

        <div className="lens-hero__inner relative z-10 mx-auto grid w-full max-w-6xl gap-9 px-6 py-11 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:px-10 lg:py-14">
          {/* المحتوى — ترتيب العناصر من الـ Dashboard */}
          <div className="lens-hero__content order-1 max-w-xl">
            {keys.map((key) => elements[key])}
          </div>

          {/* iPhone Mockup — عنصر مستقل، بعرض الهاتف تقريباً */}
          {data.phoneEnabled && <div className="lens-hero__mockup order-2 flex justify-center lg:justify-end"><LensPhone content={data.phone} /></div>}
        </div>
      </div>
    </section>
  );
};
