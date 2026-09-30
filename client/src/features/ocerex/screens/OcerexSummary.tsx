import React from 'react';
import { Button } from '../../../design/Button';
import { Price } from '../../../design/ui/Price';
import { useLocale } from '../../../i18n/LocaleContext';
import type { OcerexExtraction } from '../types';

export const OcerexSummary: React.FC<{ extraction: OcerexExtraction; busy: boolean; onConfirm: () => void }> = ({ extraction, busy, onConfirm }) => {
  const { tr } = useLocale();
  const resolved = extraction.resolved;
  return (
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <h2 className="font-display text-2xl font-black text-ink">{tr('Récapitulatif', 'ملخص الطلب')}</h2>
      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{tr('Source', 'المصدر')}</dt>
          <dd className="mt-1 font-black text-ink">{resolved?.platform || extraction.platform || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{tr('Produit / panier', 'المنتج / السلة')}</dt>
          <dd className="mt-1 font-black text-ink">{resolved?.title || extraction.productTitle || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{tr('Prix de référence', 'السعر المرجعي')}</dt>
          <dd className="mt-1 font-black tabular-nums text-ink" dir="ltr">{extraction.referencePrice} {extraction.currency}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-cta">{tr('Prix Ayrovi', 'سعر Ayrovi')}</dt>
          <dd className="mt-1"><Price className="items-start" amount={Number(extraction.ayroviPrice || 0)} size="lg" currencyLabel="TND" /></dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{tr('Lien', 'الرابط')}</dt>
          <dd className="mt-1 break-all text-xs font-semibold text-ink" dir="ltr">{resolved?.url || extraction.sourceUrl}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm leading-6 text-muted">{tr('Le paiement se fait comme d’habitude via Ayrovi : acompte, puis le moyen choisi dans la commande.', 'الدفع يتم كالعادة عبر Ayrovi: العربون، ثم طريقة الدفع التي تختارها في الطلب.')}</p>
      <Button className="mt-6 w-full" disabled={busy} onClick={onConfirm} aria-label={tr('Acheter / continuer la commande', 'شراء / متابعة الطلب')}>
        {tr('Acheter / continuer', 'شراء / متابعة الطلب')}
      </Button>
    </div>
  );
};
