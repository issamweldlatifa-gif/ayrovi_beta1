import React from 'react';
import { useLocale } from '../i18n/LocaleContext';

interface StartShoppingGatesProps {
  onOpenLens: () => void;
  onOpenLink: () => void;
  onOpenAssistant: () => void;
}

const GATES = [
  {
    id: 'photo',
    title: ['Photo', 'صورة'],
    subtitle: ['Cadrez le produit, on calcule le prix en dinars.', 'صوّر المنتج ونحسب سعره بالدينار.'],
  },
  {
    id: 'link',
    title: ['Lien', 'رابط'],
    subtitle: ['Collez la page boutique. SHEIN, Zara, Amazon…', 'ألصق صفحة المتجر. SHEIN، Zara، Amazon…'],
  },
  {
    id: 'ai',
    title: ['AI', 'AI'],
    subtitle: ['Décrivez ce que vous cherchez, en tunisien ou en français.', 'صف ما تبحث عنه بالدارجة أو بالفرنسية.'],
  },
] as const;

export const StartShoppingGates: React.FC<StartShoppingGatesProps> = ({ onOpenLens, onOpenLink, onOpenAssistant }) => {
  const { tr, isArabic, direction } = useLocale();
  const actions = { photo: onOpenLens, link: onOpenLink, ai: onOpenAssistant };

  return (
    <section className="start-shopping-gates border-b border-line bg-white px-4 py-6 sm:px-6 sm:py-8" dir={direction} aria-label={tr('Commencer une commande', 'ابدأ طلبًا')}>
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-brand">{tr('Comment commander', 'كيف تطلب')}</p>
        <h2 className="mx-auto mt-2 max-w-xl text-center font-display text-2xl font-black leading-tight text-ink sm:text-3xl">
          {tr('Envoyez une photo ou un lien. On confirme le prix et on livre en Tunisie.', 'أرسل صورة أو رابطًا. نؤكد السعر ونوصل إلى تونس.')}
        </h2>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {GATES.map((gate) => {
            return (
              <button
                key={gate.id}
                type="button"
                onClick={actions[gate.id]}
                className="group flex min-h-[112px] flex-col items-start rounded-[22px] border border-line bg-surface px-4 py-4 text-start transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white hover:shadow-card active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white shadow-card">
                </span>
                <strong className="mt-3 text-sm font-black text-ink">{gate.title[isArabic ? 1 : 0]}</strong>
                <span className="mt-1 text-[12px] font-semibold leading-5 text-muted">{gate.subtitle[isArabic ? 1 : 0]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[11px] font-bold text-muted">
          {tr('Acompte 20% · Suivi après expédition réelle · Pas de paiement à la livraison', 'عربون 20% · التتبع بعد الشحن الفعلي · لا دفع عند الاستلام')}
        </p>
      </div>
    </section>
  );
};
