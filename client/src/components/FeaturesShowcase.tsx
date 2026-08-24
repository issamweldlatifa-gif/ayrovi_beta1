import React, { useRef, useState } from 'react';

/**
 * FEATURES SHOWCASE — "Les outils AYROVI"
 * ليست بطاقات أيقونات: كل أداة تُعرض بواجهتها الحقيقية (UI مبني بالكود):
 *  - Lens: واجهة مسح/تحليل بصري
 *  - Calculator: واجهة تقدير سعر
 *  - SONIM: واجهة محادثة ذكية
 *  - Tracking: خط زمني للطلب
 * التبديل داخل نفس المكان بـfade+translate خفيف. Lens افتراضياً. بلا Auto-rotation.
 */

interface FeatureHandlers {
  onOpenLens?: () => void;
  onOpenSonim?: () => void;
  onOpenTracking?: () => void;
}

const LensVisual: React.FC = () => (
  <div className="mockup-frame" aria-hidden>
    <div className="mockup-lens">
      <div className="mockup-lens__img">
        <span className="mockup-lens__corner tl" /><span className="mockup-lens__corner tr" />
        <span className="mockup-lens__corner bl" /><span className="mockup-lens__corner br" />
        <span className="mockup-lens__line" />
        <span className="mockup-lens__tag">Nike Air Max — 89 €</span>
      </div>
      <div className="mockup-lens__row">
        <span className="mockup-chip mockup-chip--accent">Analyser</span>
        <span className="mockup-chip">Coller un lien</span>
      </div>
    </div>
  </div>
);

const CalculatorVisual: React.FC = () => (
  <div className="mockup-frame" aria-hidden>
    <div className="mockup-calc">
      <p className="mockup-calc__title">Estimation</p>
      <div className="mockup-calc__row"><span>Produit</span><strong>89,00 €</strong></div>
      <div className="mockup-calc__row"><span>Transport + douane</span><strong>42,500 TND</strong></div>
      <div className="mockup-calc__row"><span>Frais de service</span><strong>18,200 TND</strong></div>
      <div className="mockup-calc__divider" />
      <div className="mockup-calc__row mockup-calc__row--total"><span>Total estimé</span><strong className="text-[#FF7A00]">298,900 TND</strong></div>
      <span className="mockup-chip mockup-chip--accent">Calculer</span>
    </div>
  </div>
);

const SonimVisual: React.FC = () => (
  <div className="mockup-frame" aria-hidden>
    <div className="mockup-chat">
      <div className="mockup-chat__head"><span className="mockup-chat__dot" />SONIM</div>
      <div className="mockup-chat__bubble">Cherche-moi des sneakers blanches moins de 100 € 👟</div>
      <div className="mockup-chat__bubble mockup-chat__bubble--ai">
        Trouvé ! 3 modèles disponibles — le meilleur : <strong>89 €</strong>, livraison estimée <strong>7 jours</strong> vers Tunis.
        <span className="mockup-chat__card">Nike Air Max SC · 89,00 €</span>
      </div>
      <div className="mockup-chat__input">Écrivez à SONIM…</div>
    </div>
  </div>
);

const TrackingVisual: React.FC = () => (
  <div className="mockup-frame" aria-hidden>
    <div className="mockup-track">
      {[
        { label: 'Commande confirmée', state: 'done' },
        { label: 'Préparation', state: 'done' },
        { label: 'Expédition internationale', state: 'current' },
        { label: 'Arrivée en Tunisie', state: 'todo' },
        { label: 'Livraison', state: 'todo' },
      ].map((step, index) => (
        <React.Fragment key={step.label}>
          {index > 0 && <span className={`mockup-track__bar ${step.state === 'todo' ? 'is-todo' : ''}`} />}
          <span className="mockup-track__row">
            <span className={`mockup-track__dot ${step.state}`}>{step.state === 'done' ? '✓' : step.state === 'current' ? '' : ''}</span>
            <span className={`mockup-track__label ${step.state === 'current' ? 'is-current' : ''}`}>{step.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  </div>
);

interface FeatureDef {
  key: string;
  nav: string;
  label: string;
  headline: string;
  description: string;
  cta: string;
  action: keyof FeatureHandlers | 'lens';
  visual: React.ReactNode;
}

const FEATURES: FeatureDef[] = [
  { key: 'lens', nav: 'Lens', label: 'AYROVI LENS', headline: 'Identifiez votre produit en un instant.', description: 'Utilisez une image pour identifier un produit et commencer votre recherche.', cta: 'Explorer Lens →', action: 'onOpenLens', visual: <LensVisual /> },
  { key: 'calculator', nav: 'Calculator', label: 'AYROVI CALCULATOR', headline: 'Calculez avant de commander.', description: 'Estimez rapidement le coût de votre commande avant de la confirmer.', cta: 'Calculer maintenant →', action: 'onOpenLens', visual: <CalculatorVisual /> },
  { key: 'sonim', nav: 'SONIM', label: 'SONIM', headline: 'Votre assistant AYROVI.', description: 'Trouvez, comparez et commandez en discutant simplement.', cta: 'Essayer SONIM →', action: 'onOpenSonim', visual: <SonimVisual /> },
  { key: 'tracking', nav: 'Tracking', label: 'AYROVI TRACKING', headline: 'Suivez votre commande à chaque étape.', description: 'Gardez une vue claire sur l’avancement de votre commande.', cta: 'Suivre ma commande →', action: 'onOpenTracking', visual: <TrackingVisual /> },
];

export const FeaturesShowcase: React.FC<FeatureHandlers> = ({ onOpenLens, onOpenSonim, onOpenTracking }) => {
  const [activeKey, setActiveKey] = useState('lens');
  const active = FEATURES.find((feature) => feature.key === activeKey) || FEATURES[0];
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = FEATURES.findIndex((feature) => feature.key === active.key);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % FEATURES.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + FEATURES.length) % FEATURES.length;
    else return;
    event.preventDefault();
    setActiveKey(FEATURES[next].key);
    refs.current[FEATURES[next].key]?.focus();
  };

  const runAction = () => {
    if (active.action === 'onOpenLens') onOpenLens?.();
    else if (active.action === 'onOpenSonim') onOpenSonim?.();
    else if (active.action === 'onOpenTracking') onOpenTracking?.();
  };

  return (
    <section aria-label="Les outils AYROVI" className="mt-12 border-t border-line pt-10 lg:mt-16 lg:pt-14">
      <div className="mx-5 sm:mx-6 lg:mx-auto lg:max-w-7xl lg:px-8">
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[26px]">Les outils AYROVI</h2>
        <p className="mt-1 text-[13px] font-medium text-muted sm:text-sm">Tout ce qu’il vous faut, au même endroit.</p>

        {/* Feature Navigation — segmented بسيط بلا pills ضخمة */}
        <div role="tablist" aria-label="Outils AYROVI" onKeyDown={onKeyDown} className="no-scrollbar -mx-1 mt-6 flex gap-5 overflow-x-auto px-1">
          {FEATURES.map((feature) => (
            <button
              key={feature.key}
              ref={(el) => { refs.current[feature.key] = el; }}
              type="button"
              role="tab"
              aria-selected={active.key === feature.key}
              tabIndex={active.key === feature.key ? 0 : -1}
              onClick={() => setActiveKey(feature.key)}
              className={`relative shrink-0 whitespace-nowrap pb-2 text-[12px] font-black uppercase tracking-[0.08em] transition-colors sm:text-[13px] ${active.key === feature.key ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {feature.nav}
              <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[2.5px] rounded-full transition-opacity duration-300 ${active.key === feature.key ? 'bg-[#FF7A00] opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
        </div>

        {/* Feature النشط: Visual هو البطل */}
        <div key={active.key} className="feature-fade mt-7 lg:mt-9 lg:grid lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-12" role="tabpanel" aria-label={active.label}>
          {/* Mobile: Visual أولاً */}
          <div className="order-1 lg:order-2">{active.visual}</div>
          <div className="order-2 mt-6 lg:order-1 lg:mt-0">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#FF7A00]">{active.label}</p>
            <h3 className="mt-2 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px] lg:text-[36px]">{active.headline}</h3>
            <p className="mt-3 max-w-md text-[15px] leading-[1.6] text-muted sm:text-base">{active.description}</p>
            <button type="button" onClick={runAction} className="mt-5 inline-flex items-center rounded-full bg-ink px-6 py-3 text-[14px] font-bold text-white transition hover:bg-black">
              {active.cta}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
