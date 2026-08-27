import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Search, ShieldCheck, ShoppingBag, Sparkles, Tag, Zap, ArrowRight, ArrowLeft, Image as ImageIcon } from './QatafoIcons';

/**
 * AYROVIX LENS — SECTION v2 (مطابق للنموذج المرجعي)
 *
 * كل النصوص والبيانات من /api/public/lens-hero (مصدر الحقيقة = الـ DB / Dashboard).
 * لا يوجد أي نص تجاري ثابت في هذا الملف.
 *
 * التكوين: محتوى يسار (eyebrow/عنوان/وصف/CTA/mini-features/AI-card) + mockup هاتف يمين،
 * ثم بطاقة «Comment ça marche ?» ثم banner برتقالي. Mobile-first: يتكدس عموديًا على الهاتف.
 */

type IconKey = 'search' | 'tag' | 'shield' | 'zap' | 'camera' | 'bag';
const ICONS: Record<IconKey, React.ComponentType<{ size?: number; className?: string }>> = {
  search: Search, tag: Tag, shield: ShieldCheck, zap: Zap, camera: Camera, bag: ShoppingBag,
};
const iconFor = (key: string) => ICONS[(key as IconKey)] || Search;

interface Merchant { name: string; price: string; }
interface StepItem { icon: string; title: string; text: string; }
interface Sections {
  headlineHighlight?: string;
  miniFeatures?: Array<{ icon: string; label: string }>;
  aiCard?: { title: string; text: string };
  phone?: {
    topLabel: string; resultLabel: string; productName: string; price: string;
    priceChip: string; metaChip: string; stockChip: string; optionsLabel: string; merchants: Merchant[];
    image?: string;
  };
  steps?: { title: string; items: StepItem[] };
  banner?: { title: string; text: string; ctaLabel: string };
}

interface LensData {
  eyebrow: string; title: string; description: string; ctaLabel: string; ctaUrl: string;
  accentColor: string; enabled: boolean; sections: Sections;
}

export const LensHero: React.FC<{ onOpenLens?: () => void }> = ({ onOpenLens }) => {
  const [data, setData] = useState<LensData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/lens-hero')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (!cancelled && result?.data) setData(result.data as LensData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const accent = data?.accentColor || '#FF7A00';
  const s = useMemo<Sections>(() => data?.sections || {}, [data]);

  if (!data || !data.enabled) return null;

  const highlight = s.headlineHighlight || 'LENS';
  const titleLines = String(data.title || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const renderLine = (line: string, key: number) => {
    const at = line.indexOf(highlight);
    if (!highlight || at === -1) return line;
    return (
      <React.Fragment key={key}>
        {line.slice(0, at)}<span style={{ color: accent }}>{highlight}</span>{line.slice(at + highlight.length)}
      </React.Fragment>
    );
  };

  const ctaIsLink = /^(https?:\/\/|\/(?!\/)|#)/i.test(data.ctaUrl || '');
  const openLens = () => onOpenLens?.();

  const phone = s.phone;
  const steps = s.steps;
  const banner = s.banner;

  return (
    <section aria-label={data.eyebrow || 'LENS'} className="lens2" style={{ '--lens2-accent': accent } as React.CSSProperties}>
      <span aria-hidden className="lens2__diagonal" />
      <div className="lens2__inner">
        <div className="lens2__grid">
          {/* ===== المحتوى ===== */}
          <div className="lens2__content">
            {data.eyebrow && <p className="lens2__eyebrow">{data.eyebrow}</p>}
            <h2 className="lens2__title">
              {titleLines.map((line, index) => (
                <React.Fragment key={index}>{index > 0 && <br />}{renderLine(line, index)}</React.Fragment>
              ))}
            </h2>
            {data.description && <p className="lens2__desc">{data.description}</p>}

            {data.ctaLabel && (ctaIsLink
              ? <a className="lens2__cta" href={data.ctaUrl}><Camera size={18} />{data.ctaLabel}</a>
              : <button type="button" className="lens2__cta" onClick={openLens}><Camera size={18} />{data.ctaLabel}</button>)}

            {Array.isArray(s.miniFeatures) && s.miniFeatures.length > 0 && (
              <div className="lens2__minis">
                {s.miniFeatures.map((feature, index) => {
                  const Icon = iconFor(feature.icon);
                  return (
                    <div key={index} className="lens2__mini">
                      <Icon size={17} />
                      <span>{feature.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {s.aiCard && (
              <div className="lens2__ai">
                <Sparkles size={20} />
                <div>
                  <strong>{s.aiCard.title}</strong>
                  <p>{s.aiCard.text}</p>
                </div>
              </div>
            )}
          </div>

          {/* ===== mockup الهاتف ===== */}
          {phone && (
            <div className="lens2__phone" aria-hidden>
              <div className="lens2__phone-frame">
                <span className="lens2__phone-island" />
                <div className="lens2__phone-screen">
                  <div className="lens2__phone-top">
                    <ArrowLeft size={16} />
                    <span>{phone.topLabel}</span>
                    <Zap size={15} />
                  </div>
                  <div className="lens2__phone-scan">
                    <img src={phone.image || '/media/lens-sneakers.jpg'} alt="" className="lens2__phone-photo" />
                    <span className="lens2__corner tl" /><span className="lens2__corner tr" />
                    <span className="lens2__corner bl" /><span className="lens2__corner br" />
                    <span className="lens2__phone-gallery"><ImageIcon size={14} /></span>
                    <span className="lens2__phone-shutter" />
                  </div>
                  <div className="lens2__phone-result">
                    <span className="lens2__phone-resultlabel">{phone.resultLabel}</span>
                    <strong className="lens2__phone-name">{phone.productName}</strong>
                    <span className="lens2__phone-price">{phone.price}</span>
                    <div className="lens2__phone-chips">
                      <span className="chip is-accent">{phone.priceChip}</span>
                      <span className="chip">{phone.metaChip}</span>
                      <span className="chip is-ok">{phone.stockChip}</span>
                    </div>
                    <span className="lens2__phone-options">{phone.optionsLabel}</span>
                    <div className="lens2__phone-merchants">
                      {(phone.merchants || []).map((merchant, index) => (
                        <div key={index} className="lens2__merchant">
                          <span className="lens2__merchant-logo">{merchant.name.slice(0, 1)}</span>
                          <span className="lens2__merchant-name">{merchant.name}</span>
                          <span className="lens2__merchant-price">{merchant.price}</span>
                          <span className="lens2__merchant-go"><ArrowRight size={13} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== Comment ça marche ===== */}
        {steps && (
          <div className="lens2__steps">
            <h3 className="lens2__steps-title">{steps.title}</h3>
            <div className="lens2__steps-grid">
              {(steps.items || []).map((step, index) => {
                const Icon = iconFor(step.icon);
                return (
                  <div key={index} className="lens2__step">
                    <span className="lens2__step-num">{index + 1}</span>
                    <span className="lens2__step-icon"><Icon size={20} /></span>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== banner ===== */}
        {banner && (
          <div className="lens2__banner">
            <div className="lens2__banner-text">
              <Sparkles size={20} />
              <div>
                <strong>{banner.title}</strong>
                <p>{banner.text}</p>
              </div>
            </div>
            {banner.ctaLabel && (ctaIsLink
              ? <a className="lens2__banner-cta" href={data.ctaUrl}>{banner.ctaLabel}<ArrowRight size={16} /></a>
              : <button type="button" className="lens2__banner-cta" onClick={openLens}>{banner.ctaLabel}<ArrowRight size={16} /></button>)}
          </div>
        )}
      </div>
    </section>
  );
};
