import React, { useEffect, useState } from 'react';
import {
  Bell, CheckCircle2, CreditCard, Globe2, Lock, MapPin, MessageCircle, PackageCheck, Phone,
  RefreshCw, ShieldCheck, Star, Truck, Zap,
} from './QatafoIcons';

/**
 * AYROVI COMPACT TRUST BAR — شريط ثابت تحت الـHero مباشرة.
 * 4 عناصر في سطر واحد على كل الشاشات (grid-cols-4) — بلا Carousel أو
 * حركة أو نقاط. أيقونة فوق عنوان قصير متمركز. موبايل أولاً: 70-85px.
 * المحتوى من الـAdmin مع افتراضيات الهوية عند فشل API.
 */

const TRUST_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  ShieldCheck, Truck, Lock, Zap, MessageCircle, PackageCheck, Phone, CreditCard, MapPin, Star, CheckCircle2, RefreshCw, Bell, Globe2,
};

interface TrustItem {
  title: string;
  description?: string;
  icon: string;
  iconColor?: string;
}

interface TrustBarData {
  enabled: boolean;
  settings: {
    backgroundColor: string;
    titleColor: string;
    accentColor: string;
  } | null;
  items: TrustItem[];
}

const DEFAULT_DATA: TrustBarData = {
  enabled: true,
  settings: {
    backgroundColor: '#111217',
    titleColor: '#FFFFFF',
    accentColor: '#FF7A00',
  },
  items: [
    { title: 'Authentique', icon: 'ShieldCheck' },
    { title: 'Dédouanement', icon: 'Truck' },
    { title: 'Acompte 20%', icon: 'Lock' },
    { title: 'Livraison rapide', icon: 'Zap' },
  ],
};

export const TrustBar: React.FC = () => {
  const [data, setData] = useState<TrustBarData>(DEFAULT_DATA);

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

  if (!data.enabled) return null;

  const settings = data.settings || DEFAULT_DATA.settings!;
  const items = data.items.length ? data.items : DEFAULT_DATA.items;

  return (
    <section
      aria-label="Les garanties AYROVI"
      className="trust-bar-compact"
      style={{
        background: settings.backgroundColor,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-4 px-2 py-3 sm:px-4 lg:px-8 lg:py-4">
        {items.slice(0, 4).map((item, index) => {
          const IconComponent = TRUST_ICONS[item.icon] || ShieldCheck;
          return (
            <div key={index} className="trust-bar-compact__item" style={{ '--trust-accent': settings.accentColor } as React.CSSProperties}>
              <span aria-hidden="true" className="trust-bar-compact__icon">
                <IconComponent className="h-[22px] w-[22px] lg:h-6 lg:w-6" style={{ color: item.iconColor || '#FFFFFF', strokeWidth: 1.9 }} />
              </span>
              <span className="trust-bar-compact__label" style={{ color: settings.titleColor }}>{item.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
