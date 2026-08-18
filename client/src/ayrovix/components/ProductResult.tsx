import React, { useEffect, useMemo, useState } from 'react';
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
  unknown: { fr: 'Disponibilité à confirmer', ar: 'التوفر يحتاج إلى تأكيد', cls: 'bg-surface text-muted' },
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
  const imageUrls = useMemo(
    () => [...new Set([...(product.images || []), product.image].filter(Boolean))],
    [product.image, product.images],
  );
  const activeImage = imageUrls[imageIndex] || '';
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

  // Preload the same original gallery sources used by the thumbnails. Switching
  // images then remains stable without introducing a cropped preview derivative.
  useEffect(() => {
    imageUrls.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [imageUrls]);

  return (
    <div className="space-y-4" dir={direction}>
      <div className="ayrovix-product-gallery overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="ayrovix-product-gallery-stage bg-surface">
          {activeImage
            ? <img
                src={activeImage}
                alt={product.title}
                referrerPolicy="no-referrer"
                decoding="async"
                fetchPriority="high"
                draggable={false}
                onError={() => setImageIndex((current) => Math.min(current + 1, imageUrls.length))}
                className="ayrovix-product-gallery-image"
              />
            : <div className="flex h-full w-full items-center justify-center text-muted"><ImageIcon size={40} strokeWidth={1.4} /></div>}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${availability.cls}`}>
            {availability[isArabic ? 'ar' : 'fr']}
          </span>
          <span className="absolute right-3 top-3 max-w-[45%] truncate rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
            {product.source}
          </span>
        </div>
        {imageUrls.length > 1 && (
          <div className="ayrovix-thumbnail-strip flex gap-2 overflow-x-auto border-t border-line bg-white px-4 py-3" aria-label={tr('Autres photos du produit', 'صور أخرى للمنتج')}>
            {imageUrls.map((url, index) => {
              const selected = imageIndex === index;
              return (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  className={`ayrovix-thumbnail shrink-0 rounded-xl border-2 bg-surface ${selected ? 'border-brand ring-2 ring-brand/15' : 'border-line'}`}
                  aria-label={tr(`Afficher la photo ${index + 1}`, `عرض الصورة ${index + 1}`)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" className="ayrovix-thumbnail-image" />
                </button>
              );
            })}
          </div>
        )}
        <div className="space-y-3 p-4">
          <div>
            <h3 className="text-[15px] font-extrabold leading-snug text-ink">{product.title}</h3>
            <p className="mt-0.5 text-xs font-semibold text-muted">{[product.brand, product.model].filter(Boolean).join(' · ') || tr('Produit identifié par AYROVIX', 'منتج تعرّفت عليه AYROVIX')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-warning" title={merchantRating ? tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر') : tr('Qualité de la fiche AYROVIX', 'جودة بطاقة AYROVIX')}><Star size={14} fill="currentColor" />{displayRating.toFixed(1)}/5 <span className="font-semibold text-muted">{merchantRating ? tr('marchand', 'المتجر') : tr('fiche AYROVIX', 'بطاقة AYROVIX')}</span></span>
              {validProductUrl(product.sourceUrl) && <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-[11px] font-extrabold text-brand underline decoration-brand/30 underline-offset-4">{tr('Page du marchand', 'صفحة المتجر')}<ArrowUpRight size={14} /></a>}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 rounded-2xl bg-surface p-3.5 ayrovix-glass price-morph">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{tr('Prix proposé', 'السعر المقترح')}</p>
              <p className="text-sm font-bold text-ink">
                {selectedPrice != null && selectedCurrency ? `${selectedPrice.toFixed(2)} ${selectedCurrency}` : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand">{tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
              <p className="text-xl font-extrabold text-ink price-pulse">
                {selectedPriceTnd != null ? `≈ ${selectedPriceTnd.toFixed(2)} DT` : '—'}
              </p>
              <p className="text-[10px] font-semibold text-brand">{tr('Calcul AYROVI • Tout inclus', 'حساب AYROVI • شامل كل الرسوم')}</p>
            </div>
          </div>

          {priceVerified ? (
            <p className="flex items-center gap-1.5 rounded-xl border border-brand/25 bg-brand/5 px-3 py-2 text-[11px] font-bold text-brand-dark"><CheckCircle className="h-3.5 w-3.5 shrink-0" />{tr('Prix confirmé', 'السعر مؤكّد')}</p>
          ) : (
            <div className="rounded-xl border border-accent bg-accent/10 px-3 py-2 text-[11px] font-semibold text-ink">
              <p className="flex items-start gap-1.5"><Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tr(`Prix estimé — vérification manuelle par notre équipe après l’acompte de ${depositPercent}%.`, `السعر تقديري — يتحقق منه فريقنا يدويًا بعد دفع عربون ${depositPercent}%.`)}</p>
              {verificationReason(product.verificationFailureCode, isArabic) && <p className="mt-1 font-medium">{tr('Motif :', 'السبب:')} {verificationReason(product.verificationFailureCode, isArabic)}.</p>}
            </div>
          )}
          {product.description ? <p className="text-xs leading-relaxed text-muted">{product.description}</p> : null}
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-line bg-white p-4">
        <div>
          <h4 className="text-sm font-extrabold text-ink">{tr('Détails de votre demande', 'تفاصيل طلبك')}</h4>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{tr("Ces informations seront transmises à l'équipe d'achat avec votre commande.", 'ستُرسل هذه المعلومات إلى فريق الشراء مع طلبك.')}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Lien exact du produit', 'الرابط الدقيق للمنتج')} <span className="text-danger">*</span></span>
          <input
            type="url"
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value.slice(0, 4096))}
            onBlur={() => setSubmitted(true)}
            placeholder="https://boutique.com/produit-exact"
            autoComplete="url"
            maxLength={4096}
            className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand"
            aria-invalid={submitted && !isUrlValid}
            required
          />
          <span className="mt-1 block text-[10px] text-muted">{tr("Ce lien sert à l’achat manuel et ne relance pas l’extraction du prix.", 'يُستخدم الرابط للشراء اليدوي ولا يعيد استخراج السعر.')}</span>
          {submitted && !isUrlValid && <span className="mt-1 block text-[11px] font-semibold text-danger">{tr('Ajoutez un lien public complet commençant par http:// ou https://.', 'أضف رابطًا عامًا كاملًا يبدأ بـ http:// أو https://.')}</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Quantité', 'الكمية')} <span className="text-danger">*</span></span>
            <div className="flex min-h-[46px] items-center rounded-xl border border-line bg-white">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">−</button>
              <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label={tr('Quantité', 'الكمية')} className="h-11 min-w-0 flex-1 border-x border-line bg-white text-center text-sm font-extrabold text-ink outline-none" required />
              <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">+</button>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Couleur', 'اللون')} <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span></span>
            <input list="ayrovix-colors" value={color} onChange={(event) => setColor(event.target.value.slice(0, 100))} placeholder={tr('Ex. Noir', 'مثال: أسود')} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
            {product.colors.length > 0 && <datalist id="ayrovix-colors">{product.colors.map((item) => <option key={item} value={item} />)}</datalist>}
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Taille', 'المقاس')} <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span></span>
          <select value={sizeChoice} onChange={(event) => setSizeChoice(event.target.value)} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand">
            <option value="">{tr('Sans préférence', 'دون تفضيل')}</option>
            {sizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__other__">{tr('Autre', 'مقاس آخر')}</option>
          </select>
        </label>
        {sizeChoice === '__other__' && (
          <input value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder={tr('Précisez la taille souhaitée', 'اكتب المقاس المطلوب')} aria-label={tr('Autre taille', 'مقاس آخر')} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
        )}

        {product.sizes.length > 0 || product.colors.length > 0 ? (
          <p className="rounded-xl bg-surface px-3 py-2 text-[10px] leading-relaxed text-muted">
            {tr('Options détectées sur la fiche :', 'المواصفات المكتشفة في الصفحة:')} {[product.sizes.length ? `${tr('tailles', 'المقاسات')} ${product.sizes.join(', ')}` : '', product.colors.length ? `${tr('couleurs', 'الألوان')} ${product.colors.join(', ')}` : ''].filter(Boolean).join(' · ')}. {tr("La disponibilité finale sera confirmée par l’équipe.", 'سيؤكد الفريق التوفر النهائي.')}
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Commentaire spécial', 'ملاحظة خاصة')} <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span></span>
          <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={3} placeholder={tr('Ex. emballage cadeau, variante précise…', 'مثال: تغليف هدية أو مواصفة دقيقة…')} className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
        </label>
      </div>

      <div className="sticky bottom-3 flex gap-2.5">
        {product.sourceUrl && (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary min-h-[52px] px-4 text-sm">
            {tr('Voir chez le marchand', 'عرض صفحة المتجر')}
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setSubmitted(true);
            if (canOrder) onOrder({ size: requestedSize, color: color.trim(), option: selectedOption, quantity, customerNote: customerNote.trim(), manualUrl: manualUrl.trim() });
          }}
          disabled={ordering || Number(selectedPrice) <= 0 || selectedCurrency == null}
          className="ay-btn-primary min-h-[52px] flex-1 px-5 text-sm"
        >
          {ordering ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-r-transparent" /> {tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</> : <>{tr(`Commander · acompte ${depositPercent}%`, `اطلب الآن · عربون ${depositPercent}%`)}</>}
        </button>
      </div>
    </div>
  );
};
