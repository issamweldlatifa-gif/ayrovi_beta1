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
  in_stock: { fr: 'Disponible', ar: 'متوفر', cls: 'border border-line bg-white text-ink' },
  limited: { fr: 'Stock limité', ar: 'مخزون محدود', cls: 'border border-amber-200 bg-amber-50 text-amber-800' },
  out_of_stock: { fr: 'Rupture signalée', ar: 'غير متوفر', cls: 'border border-danger/20 bg-danger/5 text-danger' },
  unknown: { fr: 'Disponibilité à confirmer', ar: 'التوفر يحتاج إلى تأكيد', cls: 'border border-line bg-surface text-muted' },
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

  useEffect(() => {
    imageUrls.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [imageUrls]);

  return (
    <div className="flow-product" dir={direction}>
      {/* ── 1. FIRST VIEWPORT: PRODUCT FIRST — image + info side-by-side on desktop ── */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.95fr] lg:gap-8 lg:items-start">
        {/* Media — priority, no card — uses ayrovix-product-gallery classes for contain + no crop (730 tests) */}
        <div className="flow-media min-w-0">
          <div className="ayrovix-product-gallery overflow-hidden rounded-xl bg-white">
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
              <div className="ayrovix-thumbnail-strip flex gap-2 overflow-x-auto bg-white px-3 py-3" aria-label={tr('Autres photos du produit', 'صور أخرى للمنتج')}>
                {imageUrls.map((url, index) => {
                  const selected = imageIndex === index;
                  return (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      onClick={() => setImageIndex(index)}
                      className={`ayrovix-thumbnail shrink-0 rounded-xl border-2 bg-surface ${selected ? 'border-ink ring-2 ring-black/10' : 'border-line'}`}
                      aria-label={tr(`Afficher la photo ${index + 1}`, `عرض الصورة ${index + 1}`)}
                      aria-current={selected ? 'true' : undefined}
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" className="ayrovix-thumbnail-image" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Info — typography hierarchy, no card */}
        <div className="flow-info min-w-0 space-y-3">
          <div className="space-y-2">
            {/* title — wraps naturally, never clipped */}
            <h1 className="break-words text-[20px] font-black leading-tight text-ink lg:text-[22px]">{product.title}</h1>
            <p className="break-words text-[13px] font-semibold leading-snug text-muted">
              {[product.brand, product.model].filter(Boolean).join(' · ') || tr('Produit identifié par AYROVIX', 'منتج تعرّفت عليه AYROVIX')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[12px] font-extrabold text-ink" title={merchantRating ? tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر') : tr('Qualité de la fiche AYROVIX', 'جودة بطاقة AYROVIX')}>
                <Star size={14} fill="currentColor" style={{color:'#FFC107'}} />{displayRating.toFixed(1)}/5 <span className="font-semibold text-muted">{merchantRating ? tr('marchand', 'المتجر') : tr('fiche AYROVIX', 'بطاقة AYROVIX')}</span>
              </span>
              {validProductUrl(product.sourceUrl) && (
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  {tr('Page du marchand', 'صفحة المتجر')}<ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Price — no card, just hierarchy + subtle left rule */}
          <div className="border-l-2 border-ink pl-4 py-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">{tr('Prix final tout inclus', 'السعر النهائي الشامل')}</p>
            <p className="mt-1 break-words text-[30px] font-black leading-none tracking-tight text-ink">
              {selectedPriceTnd != null ? `${selectedPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}` : '—'}
            </p>
            <p className="mt-1 break-words text-[12px] font-semibold leading-snug text-muted">
              {selectedPrice != null && selectedCurrency
                ? `${tr('Prix boutique', 'سعر المتجر')} ${selectedPrice.toFixed(2)} ${selectedCurrency}`
                : tr('Prix boutique à confirmer', 'سعر المتجر بانتظار التأكيد')}
            </p>
            {/* verification — subtle, not card */}
            {priceVerified ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-bold text-ink"><CheckCircle className="h-3.5 w-3.5 shrink-0" />{tr('Prix confirmé', 'السعر مؤكّد')}</p>
            ) : (
              <div className="mt-2 space-y-1 text-[11px] leading-snug text-muted">
                <p className="inline-flex items-start gap-1.5 font-semibold text-ink"><Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tr(`Prix estimé — vérification manuelle par notre équipe après l’acompte de ${depositPercent}%.`, `السعر تقديري — يتحقق منه فريقنا يدويًا بعد دفع عربون ${depositPercent}%.`)}</p>
                {verificationReason(product.verificationFailureCode, isArabic) && <p className="break-words text-muted">{tr('Motif :', 'السبب:')} {verificationReason(product.verificationFailureCode, isArabic)}.</p>}
              </div>
            )}
          </div>

          {product.description ? <p className="break-words text-[13px] leading-relaxed text-muted">{product.description}</p> : null}
        </div>
      </div>

      <div className="my-6 h-px bg-line lg:my-8" />

      {/* ── 2. DETAILS — no card-on-card, just spacing + inputs ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-[14px] font-extrabold text-ink">{tr('Détails de votre demande', 'تفاصيل طلبك')}</h2>
          <p className="mt-1 break-words text-[11px] leading-relaxed text-muted">{tr("Ces informations seront transmises à l'équipe d'achat avec votre commande.", 'ستُرسل هذه المعلومات إلى فريق الشراء مع طلبك.')}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Lien exact du produit', 'الرابط الدقيق للمنتج')} <span className="text-danger">*</span></span>
          <input
            type="url"
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value.slice(0, 4096))}
            onBlur={() => setSubmitted(true)}
            placeholder="https://boutique.com/produit-exact"
            autoComplete="url"
            maxLength={4096}
            className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-ink"
            aria-invalid={submitted && !isUrlValid}
            required
          />
          <span className="mt-1 block break-words text-[10px] leading-snug text-muted">{tr("Ce lien sert à l’achat manuel et ne relance pas l’extraction du prix.", 'يُستخدم الرابط للشراء اليدوي ولا يعيد استخراج السعر.')}</span>
          {submitted && !isUrlValid && <span className="mt-1 block break-words text-[11px] font-semibold text-danger">{tr('Ajoutez un lien public complet commençant par http:// ou https://.', 'أضف رابطًا عامًا كاملًا يبدأ بـ http:// أو https://.')}</span>}
        </label>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-start">
          <div>
            <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Quantité', 'الكمية')} <span className="text-danger">*</span></span>
            <div className="flex min-h-[46px] max-w-[180px] items-center rounded-xl border border-line bg-white">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">−</button>
              <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label={tr('Quantité', 'الكمية')} className="h-11 min-w-0 flex-1 border-x border-line bg-white text-center text-sm font-extrabold text-ink outline-none" required />
              <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">+</button>
            </div>
          </div>

          <details className="rounded-xl border border-line bg-surface px-3 py-2 open:bg-white">
            <summary className="cursor-pointer list-none break-words text-xs font-extrabold text-ink">{tr('Taille, couleur et commentaire', 'المقاس واللون والملاحظة')} <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span></summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Couleur', 'اللون')}</span>
                <input list="ayrovix-colors" value={color} onChange={(event) => setColor(event.target.value.slice(0, 100))} placeholder={tr('Ex. Noir', 'مثال: أسود')} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink" />
                {product.colors.length > 0 && <datalist id="ayrovix-colors">{product.colors.map((item) => <option key={item} value={item} />)}</datalist>}
              </label>
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Taille', 'المقاس')}</span>
                <select value={sizeChoice} onChange={(event) => setSizeChoice(event.target.value)} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink">
                  <option value="">{tr('Sans préférence', 'دون تفضيل')}</option>
                  {sizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="__other__">{tr('Autre', 'مقاس آخر')}</option>
                </select>
              </label>
              {sizeChoice === '__other__' && (
                <input value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder={tr('Précisez la taille souhaitée', 'اكتب المقاس المطلوب')} aria-label={tr('Autre taille', 'مقاس آخر')} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink" />
              )}
              {product.sizes.length > 0 || product.colors.length > 0 ? (
                <p className="break-words rounded-lg bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted">
                  {tr('Options détectées sur la fiche :', 'المواصفات المكتشفة في الصفحة:')} {[product.sizes.length ? `${tr('tailles', 'المقاسات')} ${product.sizes.join(', ')}` : '', product.colors.length ? `${tr('couleurs', 'الألوان')} ${product.colors.join(', ')}` : ''].filter(Boolean).join(' · ')}.
                </p>
              ) : (
                <div className="break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
                  <p className="font-bold">{tr('Tailles/couleurs non listées par le marchand', 'المقاسات/الألوان غير مدرجة لدى المتجر')}</p>
                  <p className="mt-1 font-medium text-amber-800/80">{tr('Aucune variante n’a été trouvée sur la fiche. Vérifiez les options disponibles sur la page marchand et précisez votre choix ci-dessus. Votre lien sera utilisé pour la commande manuelle.', 'لم يُعثر على أي متغير في الصفحة. تحقق من الخيارات المتاحة على صفحة المتجر وحدد اختيارك أعلاه. سيُستخدم رابطك للطلب اليدوي.')}</p>
                  {validProductUrl(product.sourceUrl) && (
                    <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-words text-[11px] font-extrabold text-amber-900 underline">
                      {tr('Ouvrir la fiche marchand', 'فتح صفحة المتجر')} <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Commentaire spécial', 'ملاحظة خاصة')}</span>
                <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={3} placeholder={tr('Ex. emballage cadeau, variante précise…', 'مثال: تغليف هدية أو مواصفة دقيقة…')} className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ink" />
              </label>
            </div>
          </details>
        </div>
      </div>

      {/* ── 3. CTA — primary action clearly accessible, content-driven ── */}
      <div className="mt-6 space-y-2 border-t border-line pt-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          {product.sourceUrl && (
            <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary min-h-[52px] px-4 text-sm break-words">
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
            className="ay-btn-cta min-h-[52px] flex-1 px-5 text-sm break-words"
          >
            {ordering ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-r-transparent" /> {tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</> : <>{tr(`Commander · ${depositPercent}%`, `اطلب · عربون ${depositPercent}%`)}</>}
          </button>
        </div>
        <p className="break-words text-center text-[11px] font-bold text-muted">{tr(`Acompte ${depositPercent}% · Suivi après expédition réelle`, `عربون ${depositPercent}% · التتبع بعد الشحن الفعلي`)}</p>
      </div>
    </div>
  );
};
