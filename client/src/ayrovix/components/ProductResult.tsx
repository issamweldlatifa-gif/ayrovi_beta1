import { MerchantRating } from './MerchantRating';
import { Plus, Minus } from '../../components/QatafoIcons';
import React, { useEffect, useMemo, useState, useId } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import { Loader2, ArrowUpRight, CheckCircle2 as CheckCircle, Hourglass, Image as ImageIcon, Star } from '../../components/QatafoIcons';
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
  const [depositPercent, setDepositPercent] = useState<number | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const formId = useId();
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
  const validPrice = typeof selectedPrice === 'number' && Number.isFinite(selectedPrice) && selectedPrice > 0 && Boolean(selectedCurrency);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const canOrder = validPrice && isUrlValid && validQuantity && depositPercent !== null;
  const imageUrls = useMemo(
    () => [...new Set([...(product.images || []), product.image].filter(Boolean))],
    [product.image, product.images],
  );
  const activeImage = imageUrls[imageIndex] || '';
  const sizeOptions = [...new Set(product.sizes)];

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setConfigError(false); setDepositPercent(null);
    fetch('/api/public/commerce-config', { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('CONFIG_UNAVAILABLE')))
      .then(payload => {
        const percent = Number(payload?.data?.deposit?.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('INVALID_DEPOSIT');
        if (!cancelled) setDepositPercent(percent);
      })
      .catch(() => { if (!cancelled) setConfigError(true); })
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [configAttempt]);

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
          <div className="ayrovix-product-gallery overflow-hidden rounded-control bg-white">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-3">
              <span className={`ay-readable-label rounded-control px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${availability.cls}`}>
                {availability[isArabic ? 'ar' : 'fr']}
              </span>
              <span className="ay-readable-label rounded-control bg-ink/85 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
                {product.source}
              </span>
            </div>
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
                : <div className="flex h-full w-full items-center justify-center text-muted"><ImageIcon size={40} /></div>}

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
                      className={`ayrovix-thumbnail shrink-0 rounded-control border-2 bg-surface ${selected ? 'border-ink ring-2 ring-black/10' : 'border-line'}`}
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
            <h1 className="break-words text-xl font-black leading-tight text-ink lg:text-xl">{product.title}</h1>
            <p className="break-words text-sm font-semibold leading-snug text-muted">
              {[product.brand, product.model].filter(Boolean).join(' · ') || tr('Produit identifié par AYROVIX', 'منتج تعرّفت عليه AYROVIX')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <MerchantRating value={product}/>
              {validProductUrl(product.sourceUrl) && (
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  {tr('Page du marchand', 'صفحة المتجر')}<ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Price — no card, just hierarchy + subtle left rule */}
          <div className="border-s-2 border-ink ps-4 py-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{priceVerified ? tr('Prix total calculé', 'السعر الإجمالي المحسوب') : tr('Prix total estimé', 'السعر الإجمالي التقديري')}</p>
            <p className="mt-1 break-words text-3xl font-black leading-none tracking-tight text-ink">
              <bdi dir="ltr">{selectedPriceTnd != null && Number.isFinite(selectedPriceTnd) ? `${selectedPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}` : '—'}</bdi>
            </p>
            <p className="mt-1 break-words text-xs font-semibold leading-snug text-muted">
              {validPrice && selectedPrice != null && selectedCurrency
                ? `${tr('Prix boutique', 'سعر المتجر')} ${selectedPrice.toFixed(2)} ${selectedCurrency}`
                : tr('Prix boutique à confirmer', 'سعر المتجر بانتظار التأكيد')}
            </p>
            {/* verification — subtle, not card */}
            {priceVerified ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1 text-xs font-bold text-ink"><CheckCircle className="h-3.5 w-3.5 shrink-0" />{tr('Prix confirmé', 'السعر مؤكّد')}</p>
            ) : (
              <div className="mt-2 space-y-1 text-xs leading-snug text-muted">
                <p className="inline-flex items-start gap-1.5 font-semibold text-ink"><Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tr('Prix estimé — une vérification manuelle reste nécessaire.', 'السعر تقديري — ما زال يحتاج إلى تحقق يدوي.')}</p>
                {verificationReason(product.verificationFailureCode, isArabic) && <p className="break-words text-muted">{tr('Motif :', 'السبب:')} {verificationReason(product.verificationFailureCode, isArabic)}.</p>}
              </div>
            )}
          </div>

          {product.description ? <p className="break-words text-sm leading-relaxed text-muted">{product.description}</p> : null}
        </div>
      </div>

      <div className="my-6 h-px bg-line lg:my-8" />

      {/* ── 2. DETAILS — no card-on-card, just spacing + inputs ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-ink">{tr('Détails de votre demande', 'تفاصيل طلبك')}</h2>
          <p className="mt-1 break-words text-xs leading-relaxed text-muted">{tr("Ces informations seront transmises à l'équipe d'achat avec votre commande.", 'ستُرسل هذه المعلومات إلى فريق الشراء مع طلبك.')}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Lien exact du produit', 'الرابط الدقيق للمنتج')} <span className="text-danger">*</span></span>
          <input
            type="url"
            aria-describedby={`${formId}-url-hint ${formId}-url-error`}
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value.slice(0, 4096))}
            onBlur={() => setSubmitted(true)}
            placeholder="https://boutique.com/produit-exact"
            autoComplete="url"
            maxLength={4096}
            className="min-h-[46px] w-full rounded-control border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-ink"
            aria-invalid={submitted && !isUrlValid}
            required
          />
          <span id={`${formId}-url-hint`} className="mt-1 block break-words text-xs leading-snug text-muted">{tr("Ce lien sert à l’achat manuel et ne relance pas l’extraction du prix.", 'يُستخدم الرابط للشراء اليدوي ولا يعيد استخراج السعر.')}</span>
          {submitted && !isUrlValid && <span id={`${formId}-url-error`} role="alert" className="mt-1 block break-words text-xs font-semibold text-danger">{tr('Ajoutez un lien public complet commençant par http:// ou https://.', 'أضف رابطًا عامًا كاملًا يبدأ بـ http:// أو https://.')}</span>}
        </label>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-start">
          <div>
            <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Quantité', 'الكمية')} <span className="text-danger">*</span></span>
            <div className="flex min-h-[46px] max-w-[180px] items-center rounded-control border border-line bg-white">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} className="inline-flex items-center justify-center h-11 w-11 text-lg font-bold text-ink disabled:opacity-30"><Minus size={18} /></button>
              <input type="number" min={1} max={99} step={1} aria-invalid={!validQuantity} aria-describedby={!validQuantity ? `${formId}-quantity-error` : undefined} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label={tr('Quantité', 'الكمية')} className="h-11 min-w-0 flex-1 border-x border-line bg-white text-center text-sm font-extrabold text-ink outline-none" required />
              <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} className="inline-flex items-center justify-center h-11 w-11 text-lg font-bold text-ink disabled:opacity-30"><Plus size={18} /></button>
            </div>
          </div>

          <details className="rounded-control border border-line bg-surface px-3 py-2 open:bg-white">
            <summary className="cursor-pointer list-none break-words text-xs font-extrabold text-ink">{tr('Taille, couleur et commentaire', 'المقاس واللون والملاحظة')} <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span></summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Couleur', 'اللون')}</span>
                <input list={`${formId}-colors`} value={color} onChange={(event) => setColor(event.target.value.slice(0, 100))} placeholder={tr('Ex. Noir', 'مثال: أسود')} className="min-h-[46px] w-full rounded-control border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink" />
                {product.colors.length > 0 && <datalist id={`${formId}-colors`}>{product.colors.map((item) => <option key={item} value={item} />)}</datalist>}
              </label>
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Taille', 'المقاس')}</span>
                <select value={sizeChoice} onChange={(event) => setSizeChoice(event.target.value)} className="min-h-[46px] w-full rounded-control border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink">
                  <option value="">{tr('Sans préférence', 'دون تفضيل')}</option>
                  {sizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="__other__">{tr('Autre', 'مقاس آخر')}</option>
                </select>
              </label>
              {sizeChoice === '__other__' && (
                <input value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder={tr('Précisez la taille souhaitée', 'اكتب المقاس المطلوب')} aria-label={tr('Autre taille', 'مقاس آخر')} className="min-h-[46px] w-full rounded-control border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink" />
              )}
              {product.sizes.length > 0 || product.colors.length > 0 ? (
                <p className="break-words rounded-icon bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
                  {tr('Options détectées sur la fiche :', 'المواصفات المكتشفة في الصفحة:')} {[product.sizes.length ? `${tr('tailles', 'المقاسات')} ${product.sizes.join(', ')}` : '', product.colors.length ? `${tr('couleurs', 'الألوان')} ${product.colors.join(', ')}` : ''].filter(Boolean).join(' · ')}.
                </p>
              ) : (
                <div className="break-words rounded-icon border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                  <p className="font-bold">{tr('Tailles/couleurs non listées par le marchand', 'المقاسات/الألوان غير مدرجة لدى المتجر')}</p>
                  <p className="mt-1 font-medium text-amber-800/80">{tr('Aucune variante n’a été trouvée sur la fiche. Vérifiez les options disponibles sur la page marchand et précisez votre choix ci-dessus. Votre lien sera utilisé pour la commande manuelle.', 'لم يُعثر على أي متغير في الصفحة. تحقق من الخيارات المتاحة على صفحة المتجر وحدد اختيارك أعلاه. سيُستخدم رابطك للطلب اليدوي.')}</p>
                  {validProductUrl(product.sourceUrl) && (
                    <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-words text-xs font-extrabold text-amber-900 underline">
                      {tr('Ouvrir la fiche marchand', 'فتح صفحة المتجر')} <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block break-words text-xs font-bold text-ink">{tr('Commentaire spécial', 'ملاحظة خاصة')}</span>
                <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={3} placeholder={tr('Ex. emballage cadeau, variante précise…', 'مثال: تغليف هدية أو مواصفة دقيقة…')} className="w-full resize-none rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ink" />
              </label>
            </div>
          </details>
        </div>
      </div>

      {/* ── 3. CTA — primary action clearly accessible, content-driven ── */}
      <div className="mt-6 space-y-2 border-t border-line pt-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          {validProductUrl(product.sourceUrl) && (
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
            disabled={ordering || !validPrice || depositPercent === null}
            className="ay-btn-cta min-h-[52px] flex-1 px-5 text-sm break-words"
          >
            {ordering ? <><Loader2 className="h-4 w-4 animate-spin" /> {tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</> : <>{depositPercent !== null ? tr(`Commander · ${depositPercent}%`, `اطلب · عربون ${depositPercent}%`) : configError ? tr('Commande indisponible', 'الطلب غير متاح') : tr('Conditions en cours de chargement…', 'جارٍ تحميل شروط الطلب…')}</>}
          </button>
        </div>
        {configError ? <div role="alert" className="border border-line p-3 text-sm text-danger"><p>{tr('Impossible de charger les conditions du serveur. Aucune commande n’a été envoyée.', 'تعذّر تحميل شروط الطلب من الخادم. لم يُرسل أي طلب.')}</p><button type="button" className="ay-btn-secondary mt-2 min-h-11" onClick={() => setConfigAttempt(value => value + 1)}>{tr('Réessayer', 'إعادة المحاولة')}</button></div> : depositPercent !== null ? <p className="break-words text-center text-xs font-medium text-muted">{tr(`Acompte ${depositPercent}% · Suivi après expédition réelle`, `عربون ${depositPercent}% · التتبع بعد الشحن الفعلي`)}</p> : <p role="status" className="text-sm text-muted">{tr('Chargement des conditions…','جارٍ تحميل الشروط…')}</p>}
      </div>
    </div>
  );
};
