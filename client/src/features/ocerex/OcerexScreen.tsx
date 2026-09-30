import React, { useEffect, useState } from 'react';
import { Info, X } from '../../components/QatafoIcons';
import { Button } from '../../design/Button';
import { useLocale } from '../../i18n/LocaleContext';
import type { ScrapedProduct } from '../../types';
import { useOcerexOnboarding } from './hooks/useOcerexOnboarding';
import { OcerexError } from './screens/OcerexError';
import { OcerexHome } from './screens/OcerexHome';
import { OcerexOnboarding } from './screens/OcerexOnboarding';
import { OcerexProcessing } from './screens/OcerexProcessing';
import { OcerexResult } from './screens/OcerexResult';
import { OcerexSummary } from './screens/OcerexSummary';
import {
  OcerexRequestError,
  analyzeOcerexImage,
  calculateOcerexPrice,
  commitOcerexOrder,
  readImageFile,
  resolveOcerexLink,
  scrapeExistingProduct,
  trackOcerex,
} from './services/ocerexApi';
import type { OcerexCode, OcerexExtraction, OcerexStage } from './types';

type Step = 'tool' | 'processing' | 'currency' | 'result' | 'summary' | 'error';

export const OcerexScreen: React.FC<{
  accountId: string | null;
  csrfToken: string;
  onClose: () => void;
  onContinueCheckout: () => void;
  onCartChanged: () => void;
  onExtracted: (product: ScrapedProduct) => void;
}> = ({ accountId, csrfToken, onClose, onContinueCheckout, onCartChanged, onExtracted }) => {
  const { tr, direction } = useLocale();
  const onboarding = useOcerexOnboarding(accountId);
  const [step, setStep] = useState<Step>('tool');
  const [stage, setStage] = useState<OcerexStage>('image');
  const [busy, setBusy] = useState(false);
  const [extraction, setExtraction] = useState<OcerexExtraction | null>(null);
  const [error, setError] = useState<OcerexCode>('PROCESSING_ERROR');
  const [urlError, setUrlError] = useState(false);
  const [currency, setCurrency] = useState('');

  useEffect(() => { void trackOcerex('ocerex_opened', csrfToken); }, [csrfToken]);

  const fail = (code: OcerexCode) => {
    setError(code);
    setStep('error');
    setBusy(false);
  };

  const priceIt = async (current: OcerexExtraction, confirmed?: string) => {
    setStage('price');
    setStep('processing');
    const priced = await calculateOcerexPrice(current.extractionId, csrfToken, confirmed);
    setExtraction(priced);
    setStep('result');
    setBusy(false);
  };

  const onFile = async (file: File, capture: boolean) => {
    setBusy(true);
    setUrlError(false);
    setStage('image');
    setStep('processing');
    try {
      await readImageFile(file);
      void trackOcerex(capture ? 'ocerex_camera_used' : 'ocerex_image_uploaded', csrfToken);
      setStage('read');
      const analyzed = await analyzeOcerexImage(file, capture, csrfToken);
      setExtraction(analyzed);
      setStage('reference');
      if (analyzed.code !== 'OK' || analyzed.referencePrice == null) {
        fail((analyzed.code || 'PROCESSING_ERROR') as OcerexCode);
        return;
      }
      const currencyKnown = Boolean(analyzed.currency && analyzed.supportedCurrencies.includes(analyzed.currency));
      if (!currencyKnown) {
        setCurrency(analyzed.supportedCurrencies[0] || 'USD');
        setStep('currency');
        setBusy(false);
        return;
      }
      await priceIt(analyzed);
    } catch (err) {
      fail(err instanceof OcerexRequestError ? err.code : 'PROCESSING_ERROR');
    }
  };

  const onLink = async (url: string) => {
    if (!extraction) return;
    if (!/^https?:\/\/.+/i.test(url)) { setUrlError(true); return; }
    setBusy(true);
    setUrlError(false);
    try {
      const resolved = await resolveOcerexLink(extraction.extractionId, url, csrfToken);
      setExtraction({ ...extraction, ...resolved, ayroviPrice: extraction.ayroviPrice, referencePrice: extraction.referencePrice });
      setStep('summary');
    } catch (err) {
      if (err instanceof OcerexRequestError && err.code === 'INVALID_URL') { setUrlError(true); setBusy(false); return; }
      fail(err instanceof OcerexRequestError ? err.code : 'PROCESSING_ERROR');
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!extraction) return;
    setBusy(true);
    try {
      await commitOcerexOrder(extraction.extractionId, csrfToken);
      onCartChanged();
      onContinueCheckout();
    } catch (err) {
      fail(err instanceof OcerexRequestError ? err.code : 'PROCESSING_ERROR');
    } finally {
      setBusy(false);
    }
  };

  const onContinueLink = async (url: string) => {
    if (!/^https?:\/\/.+/i.test(url)) { fail('INVALID_URL'); return; }
    setBusy(true);
    try {
      const product = await scrapeExistingProduct(url);
      onExtracted(product);
    } catch {
      fail('INVALID_URL');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setStep('tool'); setExtraction(null); setUrlError(false); setBusy(false); };

  return (
    <section className="fixed inset-x-0 top-16 z-20 overflow-y-auto bg-white pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:top-20" dir={direction} role="dialog" aria-modal="true" aria-label="OCEREX" data-ocerex-screen={onboarding.showOnboarding ? 'onboarding' : step}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-3 py-2">
        <h1 className="px-2 font-display text-lg font-black tracking-tight text-ink">OCEREX</h1>
        <span className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onboarding.openHelp} aria-label={tr('Aide OCEREX', 'مساعدة OCEREX')}><Info className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={tr('Fermer', 'إغلاق')}><X className="h-5 w-5" /></Button>
        </span>
      </header>
      {onboarding.showOnboarding ? (
        <OcerexOnboarding onStart={() => { void trackOcerex('ocerex_first_use_completed', csrfToken); onboarding.complete(); }} />
      ) : step === 'processing' ? <OcerexProcessing active={stage} />
        : step === 'currency' && extraction ? (
          <form className="mx-auto w-full max-w-md px-5 py-8" onSubmit={(event) => { event.preventDefault(); void priceIt(extraction, currency); }}>
            <h2 className="text-lg font-black text-ink">{tr('Confirmez la devise', 'أكّد العملة')}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{tr('La devise n’est pas assez nette. Choisissez une devise prise en charge par Ayrovi.', 'العملة غير واضحة. اختر عملة يدعمها نظام Ayrovi.')}</p>
            <label htmlFor="ocerex-currency" className="sr-only">{tr('Devise', 'العملة')}</label>
            <select id="ocerex-currency" className="mt-4 w-full min-h-11 rounded-control border border-line bg-white px-3 font-bold text-ink" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {extraction.supportedCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <Button className="mt-4 w-full" type="submit">{tr('Calculer le prix Ayrovi', 'احسب سعر Ayrovi')}</Button>
          </form>
        ) : step === 'result' && extraction ? <OcerexResult extraction={extraction} busy={busy} urlError={urlError} onSubmit={(url) => void onLink(url)} />
        : step === 'summary' && extraction ? <OcerexSummary extraction={extraction} busy={busy} onConfirm={() => void onConfirm()} />
        : step === 'error' ? (
          <OcerexError code={error} onRetry={reset} onCorrectUrl={() => setStep(extraction?.ayroviPrice ? 'result' : 'tool')} onContinueLink={(url) => void onContinueLink(url)} />
        ) : <OcerexHome busy={busy} onFile={(file, capture) => void onFile(file, capture)} />}
    </section>
  );
};
