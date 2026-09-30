import React, { useState } from 'react';
import { Button } from '../../../design/Button';
import { Input } from '../../../design/ui/Field';
import { useLocale } from '../../../i18n/LocaleContext';
import type { OcerexCode } from '../types';

const COPY: Record<string, { fr: string; ar: string; ctaFr: string; ctaAr: string; link?: boolean }> = {
  NO_PRICE_FOUND: { fr: 'Aucun prix clair n’a été trouvé.', ar: 'لم نتمكن من العثور على سعر واضح.', ctaFr: 'Importer une autre image', ctaAr: 'رفع صورة أخرى' },
  LOW_CONFIDENCE: { fr: 'Le prix de référence n’a pas pu être déterminé avec précision.', ar: 'تعذر تحديد السعر المرجعي بدقة.', ctaFr: 'Importer une image plus nette', ctaAr: 'رفع صورة أوضح', link: true },
  NO_REFERENCE_PRICE: { fr: 'Aucun prix de référence clair n’a été trouvé.', ar: 'لم يتم العثور على سعر مرجعي واضح.', ctaFr: 'Continuer avec le lien', ctaAr: 'متابعة بالرابط', link: true },
  INVALID_URL: { fr: 'Le lien n’est pas valide.', ar: 'الرابط غير صالح.', ctaFr: 'Corriger le lien', ctaAr: 'تصحيح الرابط' },
  UNSUPPORTED_SCREEN: { fr: 'L’image n’est pas clairement un produit ou un panier.', ar: 'الصورة غير واضحة كمنتج أو سلة.', ctaFr: 'Importer une autre image', ctaAr: 'رفع صورة أخرى' },
  INVALID_IMAGE: { fr: 'Cette image ne peut pas être lue.', ar: 'لم نتمكن من قراءة هذه الصورة.', ctaFr: 'Importer une autre image', ctaAr: 'رفع صورة أخرى' },
  PROCESSING_ERROR: { fr: 'Une erreur s’est produite pendant l’analyse de l’image.', ar: 'حدث خطأ أثناء تحليل الصورة.', ctaFr: 'Réessayer', ctaAr: 'إعادة المحاولة' },
  RESTRICTED: { fr: 'Cet article ne peut pas être commandé en ligne.', ar: 'لا يمكن طلب هذا المنتج عبر الإنترنت.', ctaFr: 'Importer une autre image', ctaAr: 'رفع صورة أخرى' },
};

export const OcerexError: React.FC<{
  code: OcerexCode;
  onRetry: () => void;
  onCorrectUrl?: () => void;
  onContinueLink?: (url: string) => void;
}> = ({ code, onRetry, onCorrectUrl, onContinueLink }) => {
  const { tr } = useLocale();
  const copy = COPY[code] || COPY.PROCESSING_ERROR;
  const [url, setUrl] = useState('');
  const primary = () => {
    if (code === 'INVALID_URL') onCorrectUrl?.();
    else if (code === 'NO_REFERENCE_PRICE') return;
    else onRetry();
  };
  return (
    <div className="mx-auto w-full max-w-md px-5 py-10" role="alert">
      <h2 className="font-display text-2xl font-black leading-snug text-ink">{tr(copy.fr, copy.ar)}</h2>
      {code !== 'NO_REFERENCE_PRICE' && (
        <Button className="mt-6 w-full" onClick={primary}>{tr(copy.ctaFr, copy.ctaAr)}</Button>
      )}
      {copy.link && onContinueLink && (
        <form className="mt-4" onSubmit={(event) => { event.preventDefault(); onContinueLink(url.trim()); }}>
          <label htmlFor="ocerex-fallback-url" className="text-sm font-bold text-ink">{tr('Continuer avec le lien', 'متابعة بالرابط')}</label>
          <Input id="ocerex-fallback-url" className="mt-2" type="url" placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} required />
          <Button variant="secondary" className="mt-3 w-full" type="submit">{tr('Continuer avec le lien', 'متابعة بالرابط')}</Button>
        </form>
      )}
    </div>
  );
};
