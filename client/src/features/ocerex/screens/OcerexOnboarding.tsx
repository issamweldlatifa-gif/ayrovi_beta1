import React from 'react';
import { ArrowRight, Calculator, Image, ReceiptText, ScanSearch } from '../../../components/QatafoIcons';
import { Button } from '../../../design/Button';
import { useLocale } from '../../../i18n/LocaleContext';

const STEPS = [
  { n: '01', titleFr: 'Photographier', titleAr: 'صوّر', bodyFr: 'Prenez une capture du produit ou du panier où le prix est visible.', bodyAr: 'خذ Screenshot للمنتج أو للسلة التي يظهر فيها السعر.' },
  { n: '02', titleFr: 'Extraire', titleAr: 'استخرج', bodyFr: 'Ocerex lit le prix sur l’image et applique le calcul Ayrovi.', bodyAr: 'Ocerex يقرأ السعر من الصورة ويطبّق حساب Ayrovi.' },
  { n: '03', titleFr: 'Commander', titleAr: 'اطلب', bodyFr: 'Saisissez le lien du produit ou du panier pour terminer via Ayrovi.', bodyAr: 'أدخل رابط المنتج أو السلة لإكمال طلبك عبر Ayrovi.' },
] as const;

export const OcerexOnboarding: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { tr } = useLocale();
  const flow = [
    { icon: Image, label: 'Screenshot' },
    { icon: ScanSearch, label: 'OCR' },
    { icon: Calculator, label: 'Calculation' },
    { icon: ReceiptText, label: 'Ayrovi Price' },
  ];
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
      <p className="text-base font-semibold leading-7 text-ink">{tr('Transformez un prix en image en commande Ayrovi.', 'حوّل السعر من صورة إلى طلب مع Ayrovi.')}</p>
      <ol className="mt-6 flex items-center justify-between gap-1" aria-label={tr('Parcours OCEREX', 'مسار OCEREX')}>
        {flow.map((step, index) => (
          <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1">
            <span className="grid min-w-0 flex-1 justify-items-center gap-1 text-center">
              <step.icon className="h-6 w-6 text-ink" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wide text-muted">{step.label}</span>
            </span>
            {index < flow.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
          </li>
        ))}
      </ol>
      <h2 className="mt-8 text-sm font-black text-ink">{tr('Comment utiliser Ocerex ?', 'كيف تستعمل Ocerex؟')}</h2>
      <ol className="mt-3 space-y-4">
        {STEPS.map((step) => (
          <li key={step.n} className="grid grid-cols-[2.5rem_1fr] gap-3">
            <span className="font-display text-2xl font-black tabular-nums text-ink">{step.n}</span>
            <span>
              <strong className="block text-sm font-black text-ink">{tr(step.titleFr, step.titleAr)}</strong>
              <span className="mt-1 block text-sm leading-6 text-muted">{tr(step.bodyFr, step.bodyAr)}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button className="mt-8 w-full" onClick={onStart}>{tr('Commencer avec Ocerex', 'ابدأ مع Ocerex')}</Button>
      <p className="mt-3 text-center text-xs leading-5 text-muted">{tr('Le lien du produit ou du panier est requis pour continuer la commande.', 'يجب توفير رابط المنتج أو السلة عند متابعة الطلب.')}</p>
    </div>
  );
};
