import React, { useState } from 'react';
import { Check } from '../../../components/QatafoIcons';
import { Button } from '../../../design/Button';
import { Input } from '../../../design/ui/Field';
import { Price } from '../../../design/ui/Price';
import { useLocale } from '../../../i18n/LocaleContext';
import type { OcerexExtraction } from '../types';

function referenceLabel(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', { style: currency ? 'currency' : 'decimal', currency: currency || undefined, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

export const OcerexResult: React.FC<{
  extraction: OcerexExtraction;
  busy: boolean;
  urlError: boolean;
  onSubmit: (url: string) => void;
}> = ({ extraction, busy, urlError, onSubmit }) => {
  const { tr } = useLocale();
  const [url, setUrl] = useState('');
  return (
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <p className="flex items-center gap-2 text-sm font-black text-success">
        <Check className="h-5 w-5" aria-hidden />
        {tr('Prix extrait', 'تم استخراج السعر بنجاح')}
      </p>
      {extraction.productTitle && (
        <p className="mt-6 text-sm text-muted">
          <span className="font-bold">{tr('Produit', 'المنتج')}</span>
          <span className="mt-1 block text-base font-black text-ink">{extraction.productTitle}</span>
        </p>
      )}
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-muted">{tr('Prix de référence', 'السعر المرجعي')}</p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums text-ink" dir="ltr">{extraction.referencePrice != null ? referenceLabel(extraction.referencePrice, extraction.currency) : '—'}</p>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-cta">{tr('Prix Ayrovi', 'سعر Ayrovi')}</p>
      <Price className="mt-1 items-start text-cta [&_bdi]:text-cta" amount={Number(extraction.ayroviPrice || 0)} size="lg" currencyLabel="TND" />
      <form className="mt-8" onSubmit={(event) => { event.preventDefault(); onSubmit(url.trim()); }}>
        <label htmlFor="ocerex-url" className="text-sm font-bold text-ink">{tr('Saisissez le lien du produit ou du panier pour continuer', 'أدخل رابط المنتج أو السلة للمتابعة')}</label>
        <Input id="ocerex-url" className="mt-2" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://..." value={url} invalid={urlError} onChange={(event) => setUrl(event.target.value)} required aria-invalid={urlError} />
        <Button className="mt-4 w-full" type="submit" disabled={busy} aria-label={tr('Continuer la commande', 'متابعة الطلب')}>
          {tr('Continuer la commande →', 'متابعة الطلب →')}
        </Button>
      </form>
    </div>
  );
};
