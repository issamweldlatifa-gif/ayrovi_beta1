import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, CheckCircle2, CreditCard, Globe2, Lock, MapPin, MessageCircle, PackageCheck, Phone,
  RefreshCw, ShieldCheck, Star, Truck, Zap,
} from './QatafoIcons';

/**
 * AYROVI TRUST BAR — طبقة ثقة مباشرة تحت الـHero.
 * ديسكتوب: 5 مزايا في صف واحد بفواصل رفيعة. موبايل: عنصر واحد + Swipe (scroll-snap).
 * المحتوى والألوان من الـAdmin — مع افتراضيات هوية AYROVI عند أي فشل.
 */

const TRUST_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  ShieldCheck, Truck, Lock, Zap, MessageCircle, PackageCheck, Phone, CreditCard, MapPin, Star, CheckCircle2, RefreshCw, Bell, Globe2,
};

interface TrustItem {
  title: string;
  description: string;
  icon: string;
  titleColor?: string;
  descriptionColor?: string;
  iconColor?: string;
}

interface TrustBarData {
  enabled: boolean;
  settings: {
    backgroundColor: string;
    titleColor: string;
    descriptionColor: string;
    accentColor: string;
    dividerColor: string;
  } | null;
  items: TrustItem[];
}

const DEFAULT_DATA: TrustBarData = {
  enabled: true,
  settings: {
    backgroundColor: '#111217',
    titleColor: '#FFFFFF',
    descriptionColor: 'rgba(255,255,255,0.68)',
    accentColor: '#FF7A00',
    dividerColor: 'rgba(255,255,255,0.15)',
  },
  items: [
    { title: 'Produits authentiques', description: 'Achetés auprès des boutiques officielles', icon: 'ShieldCheck' },
    { title: 'Dédouanement inclus', description: 'Toutes les démarches prises en charge', icon: 'Truck' },
    { title: 'Acompte sécurisé 20 %', description: 'Pour confirmer votre commande', icon: 'Lock' },
    { title: 'Livraison rapide', description: 'Dans les 24 gouvernorats de Tunisie', icon: 'Zap' },
    { title: 'Service client 7j/7', description: 'Une assistance à votre écoute', icon: 'MessageCircle' },
  ],
};

const AUTO_ADVANCE_MS = 3600;

export const TrustBar: React.FC = () => {
  const [data, setData] = useState<TrustBarData>(DEFAULT_DATA);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/trust-bar')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result?.data?.items?.length) return;
        setData({ ...DEFAULT_DATA, ...result.data, settings: { ...DEFAULT_DATA.settings, ...(result.data.settings || {}) } });
      })
      .catch(() => {/* الافتراضي يبقى */});
    return () => { cancelled = true; };
  }, []);

  const settings = data.settings || DEFAULT_DATA.settings!;
  const items = data.items.length ? data.items : DEFAULT_DATA.items;

  // تتبّع العنصر المرئي في سحب الموبايل
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const center = scroller.scrollLeft + scroller.clientWidth / 2;
        const children = Array.from(scroller.children) as HTMLElement[];
        let best = 0;
        let bestDistance = Infinity;
        children.forEach((child, index) => {
          const childCenter = child.offsetLeft + child.offsetWidth / 2;
          const distance = Math.abs(childCenter - center);
          if (distance < bestDistance) { bestDistance = distance; best = index; }
        });
        setActiveIndex(best);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [items.length]);

  // Auto-scroll بطيء جداً (اختياري التفعيل سلوكياً) — يتوقف عند التفاعل ومع reduced-motion
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || items.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      const next = (activeIndexRef.current + 1) % items.length;
      const child = scroller.children[next] as HTMLElement | undefined;
      if (child) scroller.scrollTo({ left: child.offsetLeft - (scroller.clientWidth - child.offsetWidth) / 2, behavior: 'smooth' });
    }, AUTO_ADVANCE_MS);
    const pause = () => { pausedRef.current = true; };
    const resume = () => { pausedRef.current = false; };
    scroller.addEventListener('touchstart', pause, { passive: true });
    scroller.addEventListener('pointerdown', pause, { passive: true });
    scroller.addEventListener('touchend', resume, { passive: true });
    scroller.addEventListener('pointerup', resume, { passive: true });
    return () => {
      window.clearInterval(timer);
      scroller.removeEventListener('touchstart', pause);
      scroller.removeEventListener('pointerdown', pause);
      scroller.removeEventListener('touchend', resume);
      scroller.removeEventListener('pointerup', resume);
    };
  }, [items.length]);

  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;

  if (!data.enabled) return null;

  const accent = settings.accentColor || '#FF7A00';

  const renderItem = (item: TrustItem, index: number) => {
    const IconComponent = TRUST_ICONS[item.icon] || ShieldCheck;
    return (
      <div key={index} className="trust-bar__item" style={{ '--trust-accent': accent } as React.CSSProperties}>
        <span aria-hidden="true" className="trust-bar__icon"><IconComponent className="h-7 w-7 lg:h-8 lg:w-8" style={{ color: item.iconColor || '#FFFFFF', strokeWidth: 1.75 }} /></span>
        <div className="trust-bar__text">
          <strong className="trust-bar__title" style={{ color: item.titleColor || settings.titleColor }}>{item.title}</strong>
          <span className="trust-bar__desc" style={{ color: item.descriptionColor || settings.descriptionColor }}>{item.description}</span>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Les garanties AYROVI"
      className="trust-bar"
      style={{
        background: settings.backgroundColor,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        '--trust-divider': settings.dividerColor,
      } as React.CSSProperties}
    >
      {/* Desktop: صف واحد بفواصل رفيعة */}
      <div className="trust-bar__row mx-auto hidden w-full max-w-7xl px-6 py-5 lg:flex lg:items-stretch lg:justify-between lg:gap-0 lg:px-8">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span aria-hidden="true" className="trust-bar__divider w-px shrink-0 self-stretch" />}
            {renderItem(item, index)}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile / Tablet: عنصر واحد واضح + سحب أفقي */}
      <div className="lg:hidden">
        <div
          ref={scrollerRef}
          className="trust-bar__scroller flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-6 py-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {items.map((item, index) => (
            <div key={index} className="min-w-[86%] snap-center px-1.5 sm:min-w-[45%] lg:min-w-0">
              {renderItem(item, index)}
            </div>
          ))}
        </div>
        {items.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-3.5" aria-hidden="true">
            {items.map((_, index) => (
              <span
                key={index}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: index === activeIndex ? 16 : 6, background: index === activeIndex ? accent : 'rgba(255,255,255,0.28)' }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
