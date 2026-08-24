import React, { useEffect, useState } from 'react';
import {
  Bell, CheckCircle2, CreditCard, Globe2, Lock, MapPin, MessageCircle, PackageCheck, Phone,
  RefreshCw, ShieldCheck, Star, Truck, Zap,
} from './QatafoIcons';

/**
 * AYROVI TRUST BAR — شريط الثقة تحت الـHero (مطابق للتصميم المرجعي)
 * 4 عناصر في سطر واحد: أيقونة برتقالية ← عنوان أبيض عريض ← وصف رمادي
 * صغير (سطران كحد أقصى). خلفية سوداء نقية. بلا فواصل وبلا أي حركة.
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
    dividerColor?: string;
  } | null;
  items: TrustItem[];
}

const DEFAULT_DATA: TrustBarData = {
  enabled: true,
  settings: {
    backgroundColor: '#000000',
    titleColor: '#FFFFFF',
    accentColor: '#FF7A00',
    dividerColor: 'rgba(255,255,255,0.15)',
  },
  items: [
    { title: 'Authentique', description: 'Produits officiels', icon: 'ShieldCheck' },
    { title: 'Dédouanement', description: 'Inclus', icon: 'Truck' },
    { title: 'Acompte 20%', description: 'Pour confirmer votre commande', icon: 'Lock' },
    { title: 'Livraison rapide', description: 'Dans les 24 jours ouvrables', icon: 'Zap' },
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
        '--trust-divider': settings.dividerColor || 'rgba(255,255,255,0.15)',
      } as React.CSSProperties}
    >
      {/* 4 أعمدة متساوية — بلا فواصل بين العناصر */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-4 px-3 py-5 sm:px-5 lg:px-8 lg:py-6">
        {items.slice(0, 4).map((item, index) => {
          const IconComponent = TRUST_ICONS[item.icon] || ShieldCheck;
          return (
            <div key={index} className={`trust-bar-compact__item ${index > 0 ? 'has-divider' : ''}`}>
              <span aria-hidden="true" className="trust-bar-compact__icon">
                <IconComponent className="h-7 w-7 lg:h-8 lg:w-8" style={{ color: item.iconColor || settings.accentColor || '#FF7A00', strokeWidth: 1.9 }} />
              </span>
              <span className="trust-bar-compact__label" style={{ color: settings.titleColor }}>{item.title}</span>
              {Boolean(item.description) && (
                <span className="trust-bar-compact__desc">{item.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
