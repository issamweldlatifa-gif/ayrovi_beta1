import React, { useEffect, useState } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import { ArrowUpRight, CheckCircle2 as CheckCircle, Hourglass, Image as ImageIcon, Star } from '../../components/QatafoIcons';
import { validProductUrl } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

export interface AyrovixOrderSelection {
  size: string;
  color: string;
  option: AyrovixVariantOption | null;
  quantity: number;
  customerNote: string;
  manualUrl: string;
}

interface ProductResultProps {
  product: AyrovixProduct;
  ordering: boolean;
  priceVerified: boolean;
  onOrder: (selection: AyrovixOrderSelection) => void;
}

const AVAILABILITY: Record<string, { fr: string; ar: string; cls: string }> = {
  in_stock: { fr: 'Disponible', ar: 'متوفر', cls: 'bg-brand/10 text-brand-dark' },
  limited: { fr: 'Stock limité', ar: 'مخزون محدود', cls: 'bg-accent/20 text-ink' },
  out_of_stock: { fr: 'Rupture signalée', ar: 'غير متوفر', cls: 'bg-danger/5 text-danger' },
  unknown: { fr: 'Disponibilité à confirmer', ar: 'التوفر يحتاج إلى تأكيد', cls: 'bg-surface-raised text-muted' },
};

function verificationReason(code: string | null | undefined, arabic: boolean): string {
  if (!code) return '';
  if (code === 'RENDER_PROVIDER_NOT_CONFIGURED') return arabic ? 'خدمة قراءة صفحة المتجر غير مضبوطة' : "le service de rendu marchand n'est pas configuré";
  if (code === 'RENDER_ACCESS_DENIED' || /HTTP_(?:401|403)/.test(code)) return arabic ? 'المتجر يمنع القراءة الآلية' : 'la boutique bloque les consultations automatisées';
  if (code === 'RENDER_RATE_LIMITED' || /HTTP_429/.test(code)) return arabic ? 'المتجر يحدّ الطلبات مؤقتًا' : 'la boutique ou le fournisseur limite temporairement les requêtes';
  if (code === 'RENDER_TIMEOUT' || code.includes('TIMEOUT')) return arabic ? 'صفحة المتجر لم تستجب في الوقت المحدد' : "la page marchand n'a pas répondu à temps";
  if (code === 'PRICE_MISMATCH') return arabic ? 'السعر في المتجر يختلف عن سعر Lens المقترح' : 'le prix marchand lu diffère du prix proposé par Lens';
  if (code === 'PRICE_NOT_FOUND_AFTER_RENDER' || code === 'DIRECT_PRICE_NOT_FOUND') return arabic ? 'لم يُعثر على سعر قابل للاستخدام' : "aucun prix exploitable n'a été trouvé dans la fiche";
  if (code === 'MERCHANT_EXTRACTION_FAILED') return arabic ? 'تعذرت قراءة صفحة المتجر' : "la fiche marchand n'a pas pu être lue";
  return arabic ? `التحقق الآلي غير متاح (${code})` : `vérification automatique indisponible (${code})`;
}

/** Product review plus the non-blocking manual-purchase request captured with the cart item. */
export const ProductResult: React.FC<ProductResultProps> = ({ product, ordering, priceVerified, onOrder }) => {
  const { tr, direction, isArabic } = useLocale();
  const [sizeChoice, setSizeChoice] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerNote, setCustomerNote] = useState('');
  const [manualUrl, setManualUrl] = useState(product.sourceUrl || '');
  const [submitted, setSubmitted] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [depositPercent, setDepositPercent] = useState(20);
  const availability = AVAILABILITY[product.availability] || AVAILABILITY.unknown;
  const options = (product.variantOptions || []).filter((option) => option.available);
  const requestedSize = sizeChoice === '__other__' ? customSize.trim() : sizeChoice;
  const selectedOption = (requestedSize || color) ? (options.find((option) =>
    (!requestedSize || Boolean(option.size && option.size.toLocaleLowerCase() === requestedSize.toLocaleLowerCase()))
    && (!color || Boolean(option.color && option.color.toLocaleLowerCase() === color.toLocaleLowerCase())),
  ) || null) : null;
  const selectedPrice = selectedOption?.price ?? product.price;
  const selectedCurrency = selectedOption?.currency ?? product.currency;
  const selectedPriceTnd = selectedOption?.priceTnd ?? product.priceTnd;
  const isUrlValid = validProductUrl(manualUrl);
  const canOrder = Number(selectedPrice) > 0 && selectedCurrency != null && isUrlValid && quantity >= 1 && quantity <= 99;
  const rawRating = Number(product.rating);
  const displayRating = Number.isFinite(rawRating) && rawRating > 0 && rawRating <= 5 ? Math.round(rawRating * 10) / 10 : (priceVerified ? 5 : 4.5);
  const merchantRating = product.ratingKind === 'merchant';
  const imageUrls = [...new Set([...(product.images || []), product.image].filter(Boolean))];
  const sizeOptions = [...new Set(product.sizes)];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/commerce-config')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        const percent = Number(payload?.data?.deposit?.percent);
        if (!cancelled && Number.isFinite(percent) && percent > 0 && percent <= 100) setDepositPercent(percent);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setImageIndex(0);
    setSizeChoice('');
    setCustomSize('');
    setColor('');
    setQuantity(1);
    setCustomerNote('');
    setManualUrl(product.sourceUrl || '');
    setSubmitted(false);
  }, [product.sourceUrl, product.image]);

  return (
    <div className="space-y-5" dir={direction}>
      <article className="overflow-hidden border border-line bg-surface-base shadow-card lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(19rem,.92fr)]">
        <div className="border-b border-line bg-surface-raised lg:border-b-0 lg:border-e">
          <div className="relative aspect-[4/5] w-full p-5 sm:p-8">
            {imageUrls[imageIndex]
              ? <img src={imageUrls[imageIndex]} alt={product.title} referrerPolicy="no-referrer" onError={() => setImageIndex((current) => current + 1)} className="h-full w-full object-contain" />
              : <div className="flex h-full items-center justify-center text-muted"><ImageIcon size={48} strokeWidth={1.4} /></div>}
            <span className={`absolute start-4 top-4 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${availability.cls}`}>
              {availability[isArabic ? 'ar' : 'fr']}
            </span>
          </div>
          {imageUrls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-t border-line bg-surface-base p-3" aria-label={tr('Autres photos du produit', 'صور أخرى للمنتج')}>
              {imageUrls.map((url, index) => (
                <button key={`${url}-${index}`} type="button" onClick={() => setImageIndex(index)} aria-pressed={imageIndex === index} className={`h-16 w-14 shrink-0 border bg-surface-raised p-1 transition ${imageIndex === index ? 'border-ink' : 'border-line hover:border-muted'}`} aria-label={tr(`Afficher la photo ${index + 1}`, `عرض الصورة ${index + 1}`)}>
                  <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-7 lg:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted">{[product.brand, product.model].filter(Boolean).join(' · ') || tr('Sélection AYROVIX', 'اختيار AYROVIX')}</p>
            <span className="shrink-0 bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-surface-base">{product.source}</span>
          </div>

          <h2 className="mt-4 text-start text-2xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-3xl">{product.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-ink" title={merchantRating ? tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر') : tr('Qualité de la fiche AYROVIX', 'جودة بطاقة AYROVIX')}>
              <Star size={15} fill="currentColor" className="text-accent-highlight" />{displayRating.toFixed(1)}/5
              <span className="font-semibold text-muted">{merchantRating ? tr('marchand', 'المتجر') : tr('fiche AYROVIX', 'بطاقة AYROVIX')}</span>
            </span>
            {validProductUrl(product.sourceUrl) && <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-black text-ink underline decoration-line underline-offset-4 hover:decoration-ink">{tr('Page du marchand', 'صفحة المتجر')}<ArrowUpRight size={15} /></a>}
          </div>

          <div className="mt-6 border-y border-line py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">{tr('Prix final estimé · tout inclus', 'السعر النهائي التقديري · شامل كل الرسوم')}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">{selectedPriceTnd != null ? `${selectedPriceTnd.toFixed(2)} DT` : '—'}</p>
              <p className="text-sm font-bold text-muted">{selectedPrice != null && selectedCurrency ? `${selectedPrice.toFixed(2)} ${selectedCurrency}` : '—'}</p>
            </div>
          </div>

          {product.description ? <p className="mt-5 text-sm leading-6 text-muted">{product.description}</p> : null}

          <div className="mt-auto space-y-3 pt-6">
            {priceVerified ? (
              <p className="flex items-center gap-2 bg-success/10 px-3 py-2.5 text-xs font-black text-success"><CheckCircle className="h-4 w-4 shrink-0" />{tr('Prix confirmé sur la fiche source', 'السعر مؤكّد في صفحة المصدر')}</p>
            ) : (
              <div className="bg-accent-highlight/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">
                <p className="flex items-start gap-2"><Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-accent-highlight" />{tr(`Prix estimé — vérification manuelle par notre équipe après l’acompte de ${depositPercent}%.`, `السعر تقديري — يتحقق منه فريقنا يدويًا بعد دفع عربون ${depositPercent}%.`)}</p>
                {verificationReason(product.verificationFailureCode, isArabic) && <p className="mt-1 ps-6 text-muted">{tr('Motif :', 'السبب:')} {verificationReason(product.verificationFailureCode, isArabic)}.</p>}
              </div>
            )}
          </div>
        </div>
      </article>

      <section className="border border-line bg-surface-base p-5 shadow-card sm:p-7 lg:p-8">
        <div className="border-b border-line pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{tr('Étape 1', 'الخطوة 1')}</p>
          <h3 className="mt-1 text-xl font-black text-ink sm:text-2xl">{tr('Choisissez vos options', 'اختر مواصفات المنتج')}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted">{tr("Ces informations seront transmises à l'équipe d'achat avec votre commande.", 'ستُرسل هذه المعلومات إلى فريق الشراء مع طلبك.')}</p>
        </div>

        <div className="mt-6 space-y-6">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-ink">{tr('Lien exact du produit', 'الرابط الدقيق للمنتج')} <span className="text-danger">*</span></span>
            <div className="flex min-h-12 border border-line bg-surface-base transition focus-within:border-ink">
              <input type="url" value={manualUrl} onChange={(event) => setManualUrl(event.target.value.slice(0, 4096))} onBlur={() => setSubmitted(true)} placeholder="https://boutique.com/produit-exact" autoComplete="url" maxLength={4096} className="min-w-0 flex-1 bg-transparent px-4 text-sm font-semibold text-ink outline-none" aria-invalid={submitted && !isUrlValid} required />
              {isUrlValid && <CheckCircle className="me-4 h-5 w-5 self-center text-success" />}
            </div>
            <span className="mt-1.5 block text-[11px] text-muted">{tr("Ce lien sert à l’achat manuel et ne relance pas l’extraction du prix.", 'يُستخدم الرابط للشراء اليدوي ولا يعيد استخراج السعر.')}</span>
            {submitted && !isUrlValid && <span className="mt-1 block text-xs font-bold text-danger">{tr('Ajoutez un lien public complet commençant par http:// ou https://.', 'أضف رابطًا عامًا كاملًا يبدأ بـ http:// أو https://.')}</span>}
          </label>

          <fieldset>
            <legend className="mb-3 text-sm font-black text-ink">{tr('Taille', 'المقاس')} <span className="font-semibold text-muted">{tr('(optionnel)', '(اختياري)')}</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => setSizeChoice('')} className={`min-h-12 border px-3 text-sm font-black transition ${sizeChoice === '' ? 'border-interactive-primary bg-interactive-primary text-white' : 'border-line bg-surface-base text-ink hover:border-ink'}`}>{tr('Sans préférence', 'دون تفضيل')}</button>
              {sizeOptions.map((item) => <button type="button" key={item} onClick={() => setSizeChoice(item)} className={`min-h-12 border px-3 text-sm font-black transition ${sizeChoice === item ? 'border-interactive-primary bg-interactive-primary text-white' : 'border-line bg-surface-base text-ink hover:border-ink'}`}>{item}</button>)}
              <button type="button" onClick={() => setSizeChoice('__other__')} className={`min-h-12 border px-3 text-sm font-black transition ${sizeChoice === '__other__' ? 'border-interactive-primary bg-interactive-primary text-white' : 'border-line bg-surface-base text-ink hover:border-ink'}`}>{tr('Autre taille', 'مقاس آخر')}</button>
            </div>
            {sizeChoice === '__other__' && <input autoFocus value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder={tr('Précisez la taille souhaitée', 'اكتب المقاس المطلوب')} aria-label={tr('Autre taille', 'مقاس آخر')} className="mt-3 min-h-12 w-full border border-line bg-surface-base px-4 text-sm font-bold text-ink outline-none focus:border-ink" />}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-ink">{tr('Couleur', 'اللون')} <span className="font-semibold text-muted">{tr('(optionnel)', '(اختياري)')}</span></span>
              <input list="ayrovix-colors" value={color} onChange={(event) => setColor(event.target.value.slice(0, 100))} placeholder={tr('Ex. Noir, beige…', 'مثال: أسود، بيج…')} className="min-h-12 w-full border border-line bg-surface-base px-4 text-sm font-bold text-ink outline-none focus:border-ink" />
              {product.colors.length > 0 && <datalist id="ayrovix-colors">{product.colors.map((item) => <option key={item} value={item} />)}</datalist>}
            </label>
            <div>
              <span className="mb-2 block text-sm font-black text-ink">{tr('Quantité', 'الكمية')} <span className="text-danger">*</span></span>
              <div className="flex min-h-12 items-center border border-line bg-surface-base">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} className="h-12 w-12 text-xl font-bold text-ink disabled:opacity-30">−</button>
                <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label={tr('Quantité', 'الكمية')} className="h-12 min-w-0 flex-1 border-x border-line bg-surface-base text-center text-sm font-black text-ink outline-none" required />
                <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} className="h-12 w-12 text-xl font-bold text-ink disabled:opacity-30">+</button>
              </div>
            </div>
          </div>

          {(product.sizes.length > 0 || product.colors.length > 0) && <p className="border-s-2 border-brand bg-surface-raised px-4 py-3 text-xs font-semibold leading-5 text-muted">{tr('Options détectées sur la fiche :', 'المواصفات المكتشفة في الصفحة:')} {[product.sizes.length ? `${tr('tailles', 'المقاسات')} ${product.sizes.join(', ')}` : '', product.colors.length ? `${tr('couleurs', 'الألوان')} ${product.colors.join(', ')}` : ''].filter(Boolean).join(' · ')}. {tr("La disponibilité finale sera confirmée par l’équipe.", 'سيؤكد الفريق التوفر النهائي.')}</p>}

          <label className="block">
            <span className="mb-2 block text-sm font-black text-ink">{tr('Commentaire spécial', 'ملاحظة خاصة')} <span className="font-semibold text-muted">{tr('(optionnel)', '(اختياري)')}</span></span>
            <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={3} placeholder={tr('Ex. emballage cadeau, variante précise…', 'مثال: تغليف هدية أو مواصفة دقيقة…')} className="w-full resize-none border border-line bg-surface-base px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-ink" />
          </label>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <button type="button" onClick={() => { setSubmitted(true); if (canOrder) onOrder({ size: requestedSize, color: color.trim(), option: selectedOption, quantity, customerNote: customerNote.trim(), manualUrl: manualUrl.trim() }); }} disabled={ordering || Number(selectedPrice) <= 0 || selectedCurrency == null} className="flex min-h-14 w-full items-center justify-center gap-2 bg-interactive-primary px-6 text-base font-black text-white shadow-card transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-45">
            {ordering ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-surface-base/70 border-e-transparent" /> {tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</> : <>{tr(`Ajouter au panier · acompte ${depositPercent}%`, `أضف إلى السلة · عربون ${depositPercent}%`)}</>}
          </button>
          <p className="mt-3 text-center text-[11px] font-semibold text-muted">{tr('Vous pourrez vérifier le panier et le prix avant de confirmer.', 'يمكنك مراجعة السلة والسعر قبل التأكيد.')}</p>
        </div>
      </section>
    </div>
  );
};
