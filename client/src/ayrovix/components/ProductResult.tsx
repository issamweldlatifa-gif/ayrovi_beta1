import { resolveProductSelection, completeProductOffer, productSelectionLabels } from '../services/productSelection';
import { MerchantRating } from './MerchantRating';
import { Plus, Minus } from '../../components/QatafoIcons';
import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import { Loader2, ArrowUpRight, CheckCircle2 as CheckCircle, Hourglass, Image as ImageIcon, Star, X, ChevronLeft, ChevronRight } from '../../components/QatafoIcons';
import { validProductUrl } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';
import { classifyProduct, productClassLabel, extractCapacity, pricePer100, presentSizes, usesCapacity } from '../services/productAttributes';

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
  if (code === 'MERCHANT_EXTRACTION_FAILED') return arabic ? 'تعذرت قراءة صفحة المتجر' : 'la fiche marchand n\u2019a pas pu être lue';
  return arabic ? `التحقق الآلي غير متاح (${code})` : `vérification automatique indisponible (${code})`;
}

/**
 * PRODUCT CARD v2 (référence Zalando, décision client 23-09-2026) :
 *  1. produit d'abord : image (clic = plein écran) ← marque ← titre ← note
 *     ← PRIX (rouge si promo) ← capacité/prix-100 ← tailles + guide ← description
 *  2. CTA unique, toujours visible ;
 *  3. le formulaire (lien/quantité/options) vit dans un accordéon « Modifier » —
 *     l'équipe d'achat le retrouve, le client n'est plus noyé ;
 *  4. la page s'adapte à la classe de produit : beauté → capacité, pas de
 *     sélecteur de taille ; chaussures → grille ; vêtements → pastilles.
 */
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [depositPercent, setDepositPercent] = useState<number | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const formId = useId();
  const availability = AVAILABILITY[product.availability] || AVAILABILITY.unknown;
  const requestedSize = sizeChoice === '__other__' ? customSize.trim() : sizeChoice;
  const selection = resolveProductSelection(product, requestedSize, color);
  const selectedOption = selection.option;
  const { price: selectedPrice, currency: selectedCurrency, priceTnd: selectedPriceTnd } = selection.offer;
  // Promo (management 23/09/2026) : le serveur fournit prix remisé + original ;
  // on n'affiche le barré + badge QUE si la sélection correspond au devis remisé.
  const promo = product.promo ?? null;
  const promoMatchesSelection = promo != null && selectedPriceTnd != null && Math.abs(selectedPriceTnd - promo.priceTnd) < 0.001;
  const incompleteVariantQuote = selection.offer.fromVariant && !completeProductOffer(selection.offer);
  const selectionNotice = incompleteVariantQuote ? productSelectionLabels.incomplete : selection.kind === 'ambiguous' ? productSelectionLabels.ambiguous : productSelectionLabels.general;
  const displayedPriceVerified = priceVerified && selectedPriceTnd !== null && !selection.generalEstimate && !incompleteVariantQuote;
  const isUrlValid = validProductUrl(manualUrl);
  const validPrice = typeof selectedPrice === 'number' && Number.isFinite(selectedPrice) && selectedPrice > 0 && Boolean(selectedCurrency);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const canOrder = validPrice && isUrlValid && validQuantity && depositPercent !== null && !incompleteVariantQuote;

  // ── Compréhension produit (P1) : classe, capacité, tailles — jamais inventées. ──
  const productClass = useMemo(() => classifyProduct(product.title, product.description), [product.title, product.description]);
  const capacity = useMemo(
    () => (usesCapacity(productClass) ? extractCapacity(`${product.title} ${product.description || ''}`) : null),
    [productClass, product.title, product.description],
  );
  const per100 = capacity && selectedPriceTnd != null ? pricePer100(selectedPriceTnd, capacity) : null;
  const per100Unit = capacity ? (capacity.unit === 'g' || capacity.unit === 'kg' ? 'g' : 'ml') : 'ml';
  const sizePresentation = useMemo(
    () => presentSizes(productClass, product.title, product.sizes),
    [productClass, product.title, product.sizes],
  );

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
    setLightboxOpen(false);
    setGuideOpen(false);
    setFormOpen(false);
  }, [product.sourceUrl, product.image]);

  useEffect(() => {
    imageUrls.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [imageUrls]);

  // ── Lightbox : swipe latéral + flèches + fermeture. ──
  const showNext = () => setImageIndex((current) => Math.min(current + 1, imageUrls.length - 1));
  const showPrev = () => setImageIndex((current) => Math.max(current - 1, 0));

  return (
    <div className="flow-product" dir={direction}>
      {/* ── 1. LE PRODUIT D'ABORD — image (clic = plein écran) + infos côte à côte ── */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.95fr] lg:gap-8 lg:items-start">
        {/* Media — canvas blanc unifié (Quiet Card v2), classes galerie inchangées (tests) */}
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
            <div className="ayrovix-product-gallery-stage bg-white">
              {activeImage
                ? <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label={tr('Agrandir la photo du produit', 'تكبير صورة المنتج')}
                    className="flex h-full w-full items-center justify-center"
                  >
                    <img
                      src={activeImage}
                      alt={product.title}
                      referrerPolicy="no-referrer"
                      decoding="async"
                      fetchPriority="high"
                      draggable={false}
                      onError={() => setImageIndex((current) => Math.min(current + 1, imageUrls.length))}
                      className="ayrovix-product-gallery-image"
                    />
                  </button>
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

        {/* Info — hiérarchie Zalando : marque, titre, note, prix, capacité, tailles, description */}
        <div className="flow-info min-w-0 space-y-3">
          <div className="space-y-2">
            {/* marque — au-dessus, comme la référence */}
            <p className="text-xs font-black uppercase tracking-[0.14em] text-ink">{product.brand || productClassLabel(productClass, isArabic)}</p>
            {/* titre — propre, jamais coupé */}
            <h1 className="break-words text-xl font-black leading-tight text-ink lg:text-xl">{product.title}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <MerchantRating value={product}/>
              {validProductUrl(product.sourceUrl) && (
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  {tr('Page du marchand', 'صفحة المتجر')}<ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </div>

          {/* Prix — l'élément le plus fort ; rouge si promo (Quiet Card v2) */}
          <div className="border-s-2 border-ink ps-4 py-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{displayedPriceVerified ? tr('Prix total calculé', 'السعر الإجمالي المحسوب') : tr('Prix total estimé', 'السعر الإجمالي التقديري')}</p>
            <p className="mt-1 break-words text-3xl font-black leading-none tracking-tight text-ink">
              <bdi dir="ltr" style={promoMatchesSelection ? { color: 'var(--ayrovi-promo)' } : undefined}>{selectedPriceTnd != null && Number.isFinite(selectedPriceTnd) ? `${selectedPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}` : '—'}</bdi>
              {promoMatchesSelection && promo && (
                <bdi dir="ltr" className="ms-2 align-middle text-base font-bold leading-none text-muted line-through">{`${promo.originalPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}`}</bdi>
              )}
            </p>
            {promoMatchesSelection && promo && (
              <p className="mt-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black text-white" style={{ background: 'var(--ayrovi-promo)' }}>
                  {tr(`Offre du jour −${promo.percent} %`, `عرض اليوم −${promo.percent}٪`)}
                </span>
              </p>
            )}
            <p className="mt-1 break-words text-xs font-semibold leading-snug text-muted">
              {validPrice && selectedPrice != null && selectedCurrency
                ? `${tr('Prix boutique', 'سعر المتجر')} ${selectedPrice.toFixed(2)} ${selectedCurrency}`
                : tr('Prix boutique à confirmer', 'سعر المتجر بانتظار التأكيد')}
            </p>
            {/* capacité nette + prix /100 — modèle Zalando (beauté & parfums) */}
            {capacity && (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-extrabold text-ink">{capacity.label}</span>
                {per100 != null && (
                  <span className="text-xs font-semibold text-muted">{`(${per100.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'} / 100 ${per100Unit})`}</span>
                )}
              </p>
            )}
            {/* vérification — discrète */}
            {displayedPriceVerified ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1 text-xs font-bold text-ink"><CheckCircle className="h-3.5 w-3.5 shrink-0" />{tr('Prix confirmé', 'السعر مؤكّد')}</p>
            ) : (
              <div className="mt-2 space-y-1 text-xs leading-snug text-muted">
                <p className="inline-flex items-start gap-1.5 font-semibold text-ink"><Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tr('Prix estimé — une vérification manuelle reste nécessaire.', 'السعر تقديري — ما زال يحتاج إلى تحقق يدوي.')}</p>
                {verificationReason(product.verificationFailureCode, isArabic) && <p className="break-words text-muted">{tr('Motif :', 'السبب:')} {verificationReason(product.verificationFailureCode, isArabic)}.</p>}
              </div>
            )}
          </div>

          {/* Tailles — la page comprend le produit : chaussures = grille, vêtements = pastilles */}
          {sizePresentation.options.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-ink">{tr('Taille', 'المقاس')}</span>
                {validProductUrl(product.sourceUrl) && (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                  >
                    {tr('Guide des tailles', 'دليل المقاسات')}<ArrowUpRight size={13} />
                  </button>
                )}
              </div>
              {sizePresentation.layout === 'grid' ? (
                <div dir="ltr" className="grid grid-cols-5 gap-2" role="group" aria-label={tr('Choisir une taille', 'اختيار المقاس')}>
                  {sizePresentation.options.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSizeChoice(size)}
                      aria-pressed={sizeChoice === size}
                      className={`min-h-11 rounded-control border text-sm font-extrabold transition ${sizeChoice === size ? 'border-ink border-2 bg-white text-ink' : 'border-line bg-white text-ink hover:border-ink'}`}
                    >{size}</button>
                  ))}
                </div>
              ) : (
                <div dir="ltr" className="flex flex-wrap gap-2" role="group" aria-label={tr('Choisir une taille', 'اختيار المقاس')}>
                  {sizePresentation.options.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSizeChoice(size)}
                      aria-pressed={sizeChoice === size}
                      className={`min-h-11 min-w-12 rounded-control border px-3 text-sm font-extrabold transition ${sizeChoice === size ? 'border-ink border-2 bg-white text-ink' : 'border-line bg-white text-ink hover:border-ink'}`}
                    >{size}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedOption && <p data-selected-variant className="break-words text-sm leading-relaxed text-ink">{tr('Option retenue :', 'الخيار المحدد:')} {selectedOption.label || [selectedOption.size, selectedOption.color].filter(Boolean).join(' · ')}</p>}
          {(incompleteVariantQuote || selection.generalEstimate) && <p data-variant-selection-notice role={incompleteVariantQuote ? 'alert' : 'status'} className="break-words border-s-2 border-line ps-3 text-sm leading-relaxed text-muted">{tr(selectionNotice[0], selectionNotice[1])}</p>}

          {/* Description — même corps de texte que le reste (jamais un pavé minuscule) */}
          {product.description ? <p className="break-words text-sm leading-relaxed text-ink/90">{product.description}</p> : null}
        </div>
      </div>

      {/* ── 2. CTA — action unique, toujours visible ── */}
      <div className="mt-5 space-y-2">
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
              // Lien/quantité à corriger ? On ouvre l'accordéon « Modifier » au lieu d'échouer muettement.
              if (!isUrlValid || !validQuantity) { setFormOpen(true); return; }
              if (canOrder) onOrder({ size: requestedSize, color: color.trim(), option: selectedOption, quantity, customerNote: customerNote.trim(), manualUrl: manualUrl.trim() });
            }}
            disabled={ordering || !validPrice || depositPercent === null || incompleteVariantQuote}
            className="ay-btn-cta min-h-[52px] flex-1 px-5 text-sm break-words"
          >
            {ordering ? <><Loader2 className="h-4 w-4 animate-spin" /> {tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</> : <>{depositPercent !== null ? tr(`Commander · ${depositPercent}%`, `اطلب · عربون ${depositPercent}%`) : configError ? tr('Commande indisponible', 'الطلب غير متاح') : tr('Conditions en cours de chargement…', 'جارٍ تحميل شروط الطلب…')}</>}
          </button>
        </div>
        {/* Confiance — vraie, vérifiable : notre modèle d'achat manuel confirmé par l'équipe. */}
        <p className="break-words text-xs font-semibold leading-relaxed text-muted">
          {tr('Acheté et expédié via AYROVI — l’équipe confirme la disponibilité et le prix avant l’achat.', 'يُشترى ويُشحن عبر AYROVI — الفريق يؤكد التوفر والسعر قبل الشراء.')}
        </p>
        {configError ? <div role="alert" className="border border-line p-3 text-sm text-danger"><p>{tr('Impossible de charger les conditions du serveur. Aucune commande n’a été envoyée.', 'تعذّر تحميل شروط الطلب من الخادم. لم يُرسل أي طلب.')}</p><button type="button" className="ay-btn-secondary mt-2 min-h-11" onClick={() => setConfigAttempt(value => value + 1)}>{tr('Réessayer', 'إعادة المحاولة')}</button></div> : depositPercent !== null ? <p className="break-words text-center text-xs font-medium text-muted">{tr(`Acompte ${depositPercent}% · Suivi après expédition réelle`, `عربون ${depositPercent}% · التتبع بعد الشحن الفعلي`)}</p> : <p role="status" className="text-sm text-muted">{tr('Chargement des conditions…','جارٍ تحميل الشروط…')}</p>}
      </div>

      {/* ── 3. FORMULAIRE — replié dans « Modifier la commande » (l'équipe d'achat le retrouve) ── */}
      <details className="mt-5 rounded-control border border-line bg-white" open={formOpen} onToggle={(event) => setFormOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-extrabold text-ink [&::-webkit-details-marker]:hidden">
          {tr('Modifier la commande (lien, quantité, options)', 'تعديل الطلب (الرابط، الكمية، المواصفات)')}
          <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span>
        </summary>
        <div className="space-y-4 border-t border-line px-3 py-3">
          <p className="break-words text-xs leading-relaxed text-muted">{tr("Ces informations seront transmises à l'équipe d'achat avec votre commande.", 'ستُرسل هذه المعلومات إلى فريق الشراء مع طلبك.')}</p>
          <p data-variant-stock-notice className="break-words text-xs leading-relaxed text-muted">{tr('Le choix d’une taille ou couleur ne confirme pas son stock.', 'اختيار المقاس أو اللون لا يؤكّد توفره لدى المتجر.')}</p>

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
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} className="inline-flex items-center justify-center h-11 w-[44px] shrink-0 text-lg font-bold text-ink disabled:opacity-30"><Minus size={18} /></button>
                <input type="number" min={1} max={99} step={1} aria-invalid={!validQuantity} aria-describedby={!validQuantity ? `${formId}-quantity-error` : undefined} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label={tr('Quantité', 'الكمية')} className="h-11 min-w-0 flex-1 border-x border-line bg-white text-center text-sm font-extrabold text-ink outline-none" required />
                <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} className="inline-flex items-center justify-center h-11 w-[44px] shrink-0 text-lg font-bold text-ink disabled:opacity-30"><Plus size={18} /></button>
              </div>
            </div>

            <div className="space-y-3 rounded-control border border-line bg-surface px-3 py-2">
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
                  <input value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder={tr('Précisez la taille souhaitée', 'اكتب المقاس المطلوب')} aria-label={tr('Autre taille', 'مقاس آخر')} className="min-h-[46px] w-full rounded-control border border-line bg-white px-3 text-sm text-ink outline-none" />
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
          </div>
        </div>
      </details>

      {/* ── Lightbox — photo plein écran : fermeture ✕, flèches, swipe latéral ── */}
      {lightboxOpen && activeImage && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Photo du produit en plein écran', 'صورة المنتج بملء الشاشة')}
          onTouchStart={(event) => { touchStartRef.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (start == null) return;
            const delta = (event.changedTouches[0]?.clientX ?? start) - start;
            if (Math.abs(delta) < 40) return;
            if (delta < 0) showPrev(); else showNext();
          }}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="px-2 text-xs font-extrabold text-ink" dir="ltr">{`${imageIndex + 1} / ${imageUrls.length}`}</span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label={tr('Fermer la photo', 'إغلاق الصورة')}
              className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink"
            >
              <X size={20} />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            <img src={activeImage} alt={product.title} referrerPolicy="no-referrer" decoding="async" draggable={false} className="max-h-full max-w-full object-contain" />
            {imageUrls.length > 1 && (
              <>
                <button type="button" onClick={showPrev} disabled={imageIndex === 0} aria-label={tr('Photo précédente', 'الصورة السابقة')} className="absolute start-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink disabled:opacity-30"><ChevronLeft size={20} /></button>
                <button type="button" onClick={showNext} disabled={imageIndex >= imageUrls.length - 1} aria-label={tr('Photo suivante', 'الصورة التالية')} className="absolute end-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink disabled:opacity-30"><ChevronRight size={20} /></button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Guide des tailles — produit en haut, guide en bas, fermeture ✕ ── */}
      {guideOpen && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={tr('Guide des tailles', 'دليل المقاسات')}>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="px-2 text-xs font-extrabold uppercase tracking-wide text-ink">{tr('Guide des tailles', 'دليل المقاسات')}</span>
            <button type="button" onClick={() => setGuideOpen(false)} aria-label={tr('Fermer le guide', 'إغلاق الدليل')} className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {/* Le produit, en haut — comme la référence */}
            <div className="flex items-start gap-3">
              {activeImage && <img src={activeImage} alt="" referrerPolicy="no-referrer" className="h-16 w-16 flex-none rounded-control border border-line object-contain p-1" />}
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-ink">{product.brand || productClassLabel(productClass, isArabic)}</p>
                <p className="break-words text-sm font-bold text-ink">{product.title}</p>
                {product.description ? <p className="mt-1 break-words text-xs leading-relaxed text-muted line-clamp-3">{product.description}</p> : null}
              </div>
            </div>
            {/* Le guide, en bas — honnête : mesure + confirmation marchand, jamais de table inventée */}
            <div className="mt-5 space-y-3 text-sm leading-relaxed text-ink">
              <p className="font-bold">{tr('Trouvez la taille qui correspond à vos mensurations', 'لقا المقاس اللي ياسعك')}</p>
              <ul className="list-disc space-y-1.5 ps-5 text-muted">
                <li>{tr('Debout, mesurez votre pied du talon à l’orteil le plus long (en cm).', 'واقف، قيس قدام رجلك من الكعب للأصبع الأطول (بالسم).')}</li>
                <li>{tr('Ajoutez 0,5 à 1 cm d’aisance, puis reportez-vous au tableau des tailles du marchand.', 'زيد 0,5 إلى 1 سم راحة، ورجع لجدول مقاسات المتجر.')}</li>
                <li>{tr('Entre deux pointures, prenez la plus grande.', 'إذا كنت بين مقاسين، خوذ الأكبر.')}</li>
              </ul>
              {sizePresentation.options.length > 0 && (
                <p className="break-words text-xs font-semibold text-muted">
                  {tr('Tailles disponibles sur cette fiche :', 'المقاسات المتوفرة في هذه الصفحة:')} <span dir="ltr" className="font-extrabold text-ink">{sizePresentation.options.join(' · ')}</span>
                </p>
              )}
              {validProductUrl(product.sourceUrl) && (
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary inline-flex min-h-11 items-center gap-1 px-4 text-xs">
                  {tr('Vérifier le guide officiel chez le marchand', 'تأكد من الدليل الرسمي في المتجر')} <ArrowUpRight size={14} />
                </a>
              )}
              <p className="text-xs leading-relaxed text-muted">{tr('Nos conseils sont indicatifs : le tableau officiel du marchand reste la référence — notre équipe confirme votre choix avant l’achat.', 'نصائحنا استرشادية: الجدول الرسمي للمتجر يبقى المرجع — فريقنا يؤكد اختيارك قبل الشراء.')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
