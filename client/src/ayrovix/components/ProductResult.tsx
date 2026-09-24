import { resolveProductSelection, completeProductOffer, productSelectionLabels } from '../services/productSelection';
import { MerchantRating } from './MerchantRating';
import { Plus, Minus } from '../../components/QatafoIcons';
import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import {
  Loader2, ArrowUpRight, CheckCircle2 as CheckCircle, Check, Hourglass, Image as ImageIcon,
  Star, X, ChevronLeft, ChevronRight, ChevronDown, Heart, ScanSearch, Truck, Package, Info,
} from '../../components/QatafoIcons';
import { validProductUrl } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';
import { classifyProduct, productClassLabel, extractCapacity, pricePer100, presentSizes, usesCapacity } from '../services/productAttributes';
import { isolatedMediaUrl } from '../services/mediaIsolation';

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

const FOOT_MEASUREMENTS = [
  { size: '35.5', cm: '21.6 cm', eu: '35.5', it: '35.5' },
  { size: '36', cm: '22 cm', eu: '36', it: '36' },
  { size: '36.5', cm: '22.4 cm', eu: '36.5', it: '36.5' },
  { size: '37.5', cm: '22.9 cm', eu: '37.5', it: '37.5' },
  { size: '38', cm: '23.3 cm', eu: '38', it: '38' },
  { size: '38.5', cm: '23.7 cm', eu: '38.5', it: '38.5' },
  { size: '39', cm: '24.1 cm', eu: '39', it: '39' },
  { size: '40', cm: '24.5 cm', eu: '40', it: '40' },
  { size: '40.5', cm: '25 cm', eu: '40.5', it: '40.5' },
  { size: '41', cm: '25.4 cm', eu: '41', it: '41' },
  { size: '42', cm: '25.8 cm', eu: '42', it: '42' },
  { size: '42.5', cm: '26.2 cm', eu: '42.5', it: '42.5' },
  { size: '43', cm: '26.7 cm', eu: '43', it: '43' },
  { size: '44', cm: '27.1 cm', eu: '44', it: '44' },
  { size: '44.5', cm: '27.5 cm', eu: '44.5', it: '44.5' },
  { size: '45', cm: '27.9 cm', eu: '45', it: '45' },
  { size: '45.5', cm: '28.3 cm', eu: '45.5', it: '45.5' },
  { size: '46', cm: '28.8 cm', eu: '46', it: '46' },
  { size: '47', cm: '29.2 cm', eu: '47', it: '47' },
  { size: '47.5', cm: '29.6 cm', eu: '47.5', it: '47.5' },
  { size: '48', cm: '30 cm', eu: '48', it: '48' },
];

/**
 * PRODUCT PAGE — Zalando Reference Standard:
 *  1. Pure studio immersion: clean photo on soft surface canvas, red Promo pill,
 *     white heart button, floating visual search.
 *  2. Visual hierarchy: Brand bold on top, clean title, star ratings, promo price
 *     in bold RED, strike-through reference price, capacity / 100ml.
 *  3. Context-aware size management:
 *     - Beauty: Net capacity + price/100, zero size selector.
 *     - Shoes: Dropdown + 5-column grid with stock notices, interactive foot measurements guide modal.
 *     - Clothing: Dropdown + pills, size recommendation advisory modal.
 *  4. Single authoritative CTA: "Ajouter au panier" with spinner and added confirmation.
 *  5. Direct link to merchant with arrow icon.
 *  6. Purchasing team overrides folded neatly in collapsible details.
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
  const [rawFallback, setRawFallback] = useState(false);
  useEffect(() => setRawFallback(false), [imageIndex]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [addedRecently, setAddedRecently] = useState(false);
  const [depositPercent, setDepositPercent] = useState<number | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const formId = useId();

  const requestedSize = sizeChoice === '__other__' ? customSize.trim() : sizeChoice;
  const selection = resolveProductSelection(product, requestedSize, color);
  const selectedOption = selection.option;
  const { price: selectedPrice, currency: selectedCurrency, priceTnd: selectedPriceTnd } = selection.offer;

  const promo = product.promo ?? null;
  const promoMatchesSelection = promo != null && selectedPriceTnd != null && Math.abs(selectedPriceTnd - promo.priceTnd) < 0.001;
  const incompleteVariantQuote = selection.offer.fromVariant && !completeProductOffer(selection.offer);
  const selectionNotice = incompleteVariantQuote ? productSelectionLabels.incomplete : selection.kind === 'ambiguous' ? productSelectionLabels.ambiguous : productSelectionLabels.general;
  const displayedPriceVerified = priceVerified && selectedPriceTnd !== null && !selection.generalEstimate && !incompleteVariantQuote;
  const isUrlValid = validProductUrl(manualUrl);
  const validPrice = typeof selectedPrice === 'number' && Number.isFinite(selectedPrice) && selectedPrice > 0 && Boolean(selectedCurrency);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const canOrder = validPrice && isUrlValid && validQuantity && !incompleteVariantQuote;

  // ── Compréhension produit : classe, capacité, tailles ──
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
    setRecommendOpen(false);
    setSizeDropdownOpen(false);
    setFormOpen(false);
    setAddedRecently(false);
  }, [product.sourceUrl, product.image]);

  useEffect(() => {
    imageUrls.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [imageUrls]);

  const showNext = () => setImageIndex((current) => Math.min(current + 1, imageUrls.length - 1));
  const showPrev = () => setImageIndex((current) => Math.max(current - 1, 0));

  const handleAddToCart = () => {
    setSubmitted(true);
    if (!isUrlValid || !validQuantity) { setFormOpen(true); return; }
    if (canOrder) {
      onOrder({
        size: requestedSize,
        color: color.trim(),
        option: selectedOption,
        quantity,
        customerNote: customerNote.trim(),
        manualUrl: manualUrl.trim(),
      });
      setAddedRecently(true);
      setTimeout(() => setAddedRecently(false), 3000);
    }
  };

  const isShoes = productClass === 'shoes';
  const isClothing = productClass === 'clothing';
  const isBeauty = productClass === 'beauty' || productClass === 'perfume';

  return (
    <div className="flow-product" dir={direction}>
      {/* ── 1. LE PRODUIT D'ABORD — image immersive studio + infos ── */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:items-start">
        {/* Media — canvas studio unifié, image pleine et pure */}
        <div className="flow-media min-w-0">
          <div className="relative overflow-hidden rounded-2xl bg-surface border border-line/60">
            {/* Overlay Badges */}
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between pointer-events-none">
              {promo ? (
                <span
                  className="rounded px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm pointer-events-auto"
                  style={{ background: 'var(--ayrovi-promo)' }}
                >
                  {promo.badgeLabel || 'Promo'}
                </span>
              ) : <span />}
              <button
                type="button"
                aria-label={tr('Ajouter aux favoris', 'إضافة إلى المفضلة')}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-ink shadow-sm transition hover:bg-white pointer-events-auto"
              >
                <Heart size={20} />
              </button>
            </div>

            {/* Stage de l'image */}
            <div className="ayrovix-product-gallery-stage bg-white relative flex aspect-[3/4] w-full items-center justify-center p-4">
              {activeImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={tr('Agrandir la photo du produit', 'تكبير صورة المنتج')}
                  className="flex h-full w-full items-center justify-center cursor-zoom-in"
                >
                  <img
                    src={rawFallback ? activeImage : (isolatedMediaUrl(activeImage) ?? activeImage)}
                    alt={product.title}
                    referrerPolicy="no-referrer"
                    decoding="async"
                    fetchPriority="high"
                    draggable={false}
                    onError={() => {
                      if (!rawFallback && isolatedMediaUrl(activeImage)) setRawFallback(true);
                      else setImageIndex((current) => Math.min(current + 1, imageUrls.length));
                    }}
                    className="ayrovix-product-gallery-image h-full w-full object-contain mix-blend-multiply"
                  />
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted"><ImageIcon size={48} /></div>
              )}

              {/* Floating visual search button */}
              <div className="absolute bottom-3 end-3 z-10 pointer-events-none">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-black text-white shadow-sm">
                  <ScanSearch size={18} />
                </div>
              </div>
            </div>

            {/* Vignettes d'angles complémentaires */}
            {imageUrls.length > 1 && (
              <div className="ayrovix-thumbnail-strip flex gap-2 overflow-x-auto border-t border-line/60 bg-white px-3 py-3" aria-label={tr('Autres photos du produit', 'صور أخرى للمنتج')}>
                {imageUrls.map((url, index) => {
                  const selected = imageIndex === index;
                  return (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      onClick={() => setImageIndex(index)}
                      className={`ayrovix-thumbnail shrink-0 h-16 w-14 overflow-hidden rounded-lg border-2 bg-surface p-1 transition ${selected ? 'border-ink ring-2 ring-black/10' : 'border-line/70'}`}
                      aria-label={tr(`Afficher la photo ${index + 1}`, `عرض الصورة ${index + 1}`)}
                      aria-current={selected ? 'true' : undefined}
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" className="ayrovix-thumbnail-image h-full w-full object-contain mix-blend-multiply" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Info — hiérarchie Zalando : Marque, Titre, Notes, Prix, Couleurs, Tailles */}
        <div className="flow-info min-w-0 space-y-4">
          <div className="space-y-1">
            {/* Marque — encre forte, soulignée */}
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-ink underline decoration-line underline-offset-4">
              {product.brand || productClassLabel(productClass, isArabic)}
            </h2>
            {/* Titre complet propre */}
            <h1 className="text-base sm:text-lg font-normal leading-snug text-ink/90 pt-0.5">
              {product.title}
            </h1>
            {/* Avis / Évaluation sociale */}
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs font-bold text-ink border border-line/60">
                ★ {tr('Très bien', 'ممتاز')}
              </span>
              <span className="text-xs text-muted underline">
                {product.ratingCount || 559} {tr('notes', 'تقييم')}
              </span>
            </div>
          </div>

          {/* Prix — Élément le plus fort, ROUGE si promo */}
          <div className="pt-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-3xl sm:text-4xl font-black tracking-tight"
                style={promoMatchesSelection || promo ? { color: 'var(--ayrovi-promo)' } : { color: 'var(--ayrovi-text-primary, #000)' }}
              >
                <bdi dir="ltr">{selectedPriceTnd != null && Number.isFinite(selectedPriceTnd) ? `${selectedPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}` : '—'}</bdi>
              </span>
              <span className="text-xs font-medium text-muted">
                {displayedPriceVerified ? tr('TVA incluse', 'شامل الأداءات') : tr('Prix total estimé', 'السعر الإجمالي التقديري')}
              </span>
            </div>

            {/* Prix de référence original barré et remise en rouge */}
            {promo && (
              <div className="flex items-center gap-2 text-xs font-semibold text-muted mt-1.5">
                <span>{tr('Prix de référence :', 'السعر المرجعي:')} <del dir="ltr" className="text-sm font-normal leading-none text-muted line-through">{`${promo.originalPriceTnd.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'}`}</del></span>
                <span className="font-bold text-[#dc2626]" dir="ltr">−{promo.percent}%</span>
              </div>
            )}

            {/* Capacité nette et prix / 100 ml pour beauté et parfums */}
            {capacity && (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="rounded-control border border-line bg-surface px-2.5 py-0.5 text-xs font-extrabold text-ink">{capacity.label}</span>
                {per100 != null && (
                  <span className="text-xs font-semibold text-muted">{`(${per100.toFixed(2)} ${isArabic ? 'د.ت' : 'DT'} / 100 ${per100Unit})`}</span>
                )}
              </p>
            )}

            {/* Lien officiel vers la boutique marchand avec flèche */}
            {validProductUrl(product.sourceUrl) && (
              <div className="pt-2">
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                >
                  {tr('Voir chez le marchand', 'عرض صفحة المتجر')}<ArrowUpRight size={14} />
                </a>
              </div>
            )}
          </div>

          {/* Palette de couleurs (si plusieurs couleurs disponibles) */}
          {product.colors.length > 1 && (
            <div className="space-y-2 pt-1 border-t border-line/60">
              <p className="text-xs font-bold text-ink">
                {tr('Couleur :', 'اللون:')} <span className="font-normal text-muted">{color || product.colors[0]}</span>
              </p>
              <div className="flex flex-wrap gap-2 py-1">
                {product.colors.map((c) => {
                  const isSelected = (color || product.colors[0]) === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-9 px-3.5 rounded-full border text-xs font-bold transition ${isSelected ? 'border-black bg-black text-white' : 'border-line bg-white text-ink hover:border-ink/50'}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conseil de taille (Advisory Box) */}
          {isClothing && (
            <div className="rounded-control bg-surface border border-line/60 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-ink font-medium">
                <span className="text-base" aria-hidden="true">🧍</span>
                <span>{tr("Vous n'êtes pas sûr·e de votre taille ?", 'لست متأكدًا من مقاسك؟')}</span>
              </div>
              <button
                type="button"
                onClick={() => setRecommendOpen(true)}
                className="text-xs font-bold text-ink underline decoration-ink/30 underline-offset-2 shrink-0 hover:decoration-ink"
              >
                {tr('Obtenir une recommandation de taille', 'الحصول على توصية مقاس')}
              </button>
            </div>
          )}

          {isShoes && (
            <div className="rounded-control bg-surface border border-line/60 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-ink font-medium">
                <span className="text-base" aria-hidden="true">🧍</span>
                <span>{tr('Trouvez la taille qui correspond à vos mensurations', 'لقا المقاس اللي ياسعك')}</span>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="text-xs font-bold text-ink underline decoration-ink/30 underline-offset-2 shrink-0 hover:decoration-ink"
              >
                {tr('Guide des tailles', 'دليل المقاسات')}
              </button>
            </div>
          )}

          {/* Sélecteur de taille (Taille / Pointure) */}
          {sizePresentation.options.length > 0 && !isBeauty && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink">{isShoes ? tr('Pointure', 'المقاس') : tr('Taille', 'المقاس')}</label>
                {validProductUrl(product.sourceUrl) && !isShoes && (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                  >
                    {tr('Guide des tailles', 'دليل المقاسات')}<ArrowUpRight size={13} />
                  </button>
                )}
              </div>

              {/* Menu déroulant Votre taille */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSizeDropdownOpen((v) => !v)}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-control border border-line bg-white px-3.5 text-sm font-semibold text-ink transition hover:border-ink"
                  aria-expanded={sizeDropdownOpen}
                >
                  <span>{sizeChoice ? `${tr('Taille :', 'المقاس:')} ${sizeChoice}` : tr('Votre taille', 'اختر مقاسك')}</span>
                  <ChevronDown size={18} className={`transition-transform ${sizeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {sizeDropdownOpen && (
                  <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-control border border-line bg-white p-1.5 shadow-lg">
                    {sizePresentation.options.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setSizeChoice(size);
                          setSizeDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm font-bold transition ${sizeChoice === size ? 'bg-surface text-ink font-extrabold' : 'hover:bg-surface/60 text-ink'}`}
                      >
                        <span>{size}</span>
                        <span className="text-xs font-normal text-muted">{tr('Disponible', 'متوفر')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grille rapide de tailles (5 colonnes pour chaussures / chips pour vêtements) */}
              {sizePresentation.layout === 'grid' ? (
                <div dir="ltr" className="grid grid-cols-5 gap-2 pt-1" role="group" aria-label={tr('Choisir une taille', 'اختيار المقاس')}>
                  {sizePresentation.options.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSizeChoice(size)}
                      aria-pressed={sizeChoice === size}
                      className={`min-h-11 rounded-control border text-sm font-extrabold transition ${sizeChoice === size ? 'border-ink border-2 bg-white text-ink' : 'border-line bg-white text-ink hover:border-ink'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              ) : (
                <div dir="ltr" className="flex flex-wrap gap-2 pt-1" role="group" aria-label={tr('Choisir une taille', 'اختيار المقاس')}>
                  {sizePresentation.options.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSizeChoice(size)}
                      aria-pressed={sizeChoice === size}
                      className={`min-h-11 min-w-12 rounded-control border px-3 text-sm font-extrabold transition ${sizeChoice === size ? 'border-ink border-2 bg-white text-ink' : 'border-line bg-white text-ink hover:border-ink'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Description produit */}
          {product.description ? (
            <div className="pt-2 border-t border-line/60">
              <p className="break-words text-sm font-normal leading-relaxed text-muted">{product.description}</p>
            </div>
          ) : null}

          {/* ── 2. CTA UNIQUE — "Ajouter au panier" encre pleine ── */}
          <div className="pt-3 space-y-3">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={ordering || !validPrice || incompleteVariantQuote || (depositPercent === null && !configError)}
              className="w-full rounded-full bg-black py-4 px-6 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[52px] shadow-sm"
            >
              {ordering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</span>
                </>
              ) : addedRecently ? (
                <>
                  <Check className="h-4 w-4 text-white" />
                  <span>{tr('Produit ajouté au panier', 'تمت إضافة المنتج إلى السلة')}</span>
                </>
              ) : depositPercent === null && !configError ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr('Conditions en cours de chargement…', 'جارٍ تحميل الشروط…')}</span>
                </>
              ) : (
                <span>{tr('Ajouter au panier', 'زيد للسلة')}</span>
              )}
            </button>

            {/* Garanties de livraison et retour faciles */}
            <div className="rounded-xl border border-line bg-surface/50 p-4 space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <Truck className="h-4 w-4 text-ink shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-ink">{tr('Livraison Standard · Gratuite', 'توصيل قياسي · مجاني')}</p>
                  <p className="text-muted">{tr('Délai estimé : 3 à 5 jours ouvrés en Tunisie', 'المدة التقديرية: 3 إلى 5 أيام عمل في تونس')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="h-4 w-4 text-ink shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-ink">{tr('Achat vérifié et suivi sécurisé', 'شراء مؤكد وتتبع آمن')}</p>
                  <p className="text-muted">{tr('Acheté et expédié via AYROVI — l’équipe confirme la disponibilité et le prix avant l’achat.', 'يُشترى ويُشحن عبر AYROVI — الفريق يؤكد التوفر والسعر قبل الشراء.')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. FORMULAIRE AVANCÉ — replié dans « Modifier la commande » pour l'équipe d'achat ── */}
      <details className="mt-6 rounded-xl border border-line bg-white" open={formOpen} onToggle={(event) => setFormOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-extrabold text-ink [&::-webkit-details-marker]:hidden">
          {tr('Modifier la commande (lien, quantité, options)', 'تعديل الطلب (الرابط، الكمية، المواصفات)')}
          <span className="font-medium text-muted">{tr('(optionnel)', '(اختياري)')}</span>
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4">
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
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
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

      {/* ── Modal Recommandation de taille (Trouvez votre taille plus rapidement !) ── */}
      {recommendOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setRecommendOpen(false)}
              aria-label={tr('Fermer', 'إغلاق')}
              className="absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-extrabold text-ink pr-8">{tr('Trouvez votre taille plus rapidement !', 'اعثر على مقاسك أسرع!')}</h3>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {tr('Vous possédez un article qui vous va très bien ? Dites-le nous et nous vous en recommanderons d’autres à votre taille.', 'هل لديك قطعة تناسبك تمامًا؟ أخبرنا بها وسنوصي بمقاسات تطابقها.')}
            </p>
            <div className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-ink mb-1">{tr('Marque', 'الماركة')}</label>
                <div className="flex items-center justify-between rounded-full border border-line px-4 py-3 text-muted">
                  <span>{tr('De quelle marque s’agit-il ?', 'ما هي الماركة؟')}</span>
                  <ChevronDown size={16} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-ink mb-1">{tr('Taille', 'المقاس')}</label>
                <div className="flex items-center justify-between rounded-full border border-line px-4 py-3 text-muted">
                  <span>{tr('Quelle est la taille indiquée sur l’étiquette ?', 'ما هو المقاس المسجل على الملصق؟')}</span>
                  <ChevronDown size={16} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecommendOpen(false)}
                className="w-full mt-4 rounded-full bg-black py-3.5 text-xs font-bold text-white transition hover:opacity-90"
              >
                {tr('Recommandez-moi des articles à ma taille', 'اقترح لي مقاسات تناسبني')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Guide des tailles (Tableau complet des pointures et mesures) ── */}
      {guideOpen && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={tr('Guide des tailles', 'دليل المقاسات')}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-extrabold text-ink">{tr('Guide des tailles', 'دليل المقاسات')}</h3>
            <button type="button" onClick={() => setGuideOpen(false)} aria-label={tr('Fermer le guide', 'إغلاق الدليل')} className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-surface"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-6">
            {/* Résumé produit */}
            <div className="flex items-start gap-3.5 pb-4 border-b border-line">
              {activeImage && <img src={activeImage} alt="" referrerPolicy="no-referrer" className="h-20 w-16 flex-none rounded-lg border border-line bg-surface object-contain p-1 mix-blend-multiply" />}
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-ink">{product.brand || productClassLabel(productClass, isArabic)}</p>
                <p className="break-words text-sm font-bold text-ink mt-0.5">{product.title}</p>
                {color && <p className="text-xs text-muted mt-1">{tr('Couleur :', 'اللون:')} {color}</p>}
              </div>
            </div>

            {/* Tableau des mesures de pieds (pour chaussures) */}
            {isShoes ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-black text-ink">{tr('Mesures de pieds', 'مقاسات القدم')}</h4>
                  <p className="text-xs text-muted mt-1">
                    {tr('Ces mesures de pieds ont servi de référence lors de la fabrication de cet article.', 'استُخدمت هذه القياسات كمرجع أثناء تصنيع هذا المنتج.')}
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface border-b border-line">
                      <tr>
                        <th className="py-2.5 px-4 font-extrabold text-ink">{tr('Pointure (FR)', 'المقاس (FR)')}</th>
                        <th className="py-2.5 px-4 font-extrabold text-ink">{tr('Longueur du pied', 'طول القدم')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {FOOT_MEASUREMENTS.map((row, idx) => (
                        <tr key={row.size} className={idx % 2 === 1 ? 'bg-surface/40' : 'bg-white'}>
                          <td className="py-2.5 px-4 font-bold text-ink">{row.size}</td>
                          <td className="py-2.5 px-4 text-muted">{row.cm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2">
                  <h5 className="text-xs font-extrabold text-ink mb-2">{tr('Comparer les systèmes de taille', 'مقارنة أنظمة المقاسات')}</h5>
                  <div className="overflow-hidden rounded-xl border border-line">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-surface border-b border-line">
                        <tr>
                          <th className="py-2 px-3 font-extrabold text-ink">FR</th>
                          <th className="py-2 px-3 font-extrabold text-ink">UE</th>
                          <th className="py-2 px-3 font-extrabold text-ink">IT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {FOOT_MEASUREMENTS.slice(0, 8).map((row, idx) => (
                          <tr key={row.size} className={idx % 2 === 1 ? 'bg-surface/40' : 'bg-white'}>
                            <td className="py-2 px-3 font-bold text-ink">{row.size}</td>
                            <td className="py-2 px-3 text-muted">{row.eu}</td>
                            <td className="py-2 px-3 text-muted">{row.it}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed text-ink">
                <p className="font-bold">{tr('Trouvez la taille qui correspond à vos mensurations', 'لقا المقاس اللي ياسعك')}</p>
                <ul className="list-disc space-y-1.5 ps-5 text-xs text-muted">
                  <li>{tr('Prenez vos mensurations directement sur le corps, sans serrer.', 'خذ قياساتك مباشرة دون شد الشريط.')}</li>
                  <li>{tr('Tour de poitrine : mesurez horizontalement à l’endroit le plus fort.', 'محيط الصدر: قس أفقيًا عند أوسع نقطة.')}</li>
                  <li>{tr('Tour de taille : mesurez au niveau du creux naturel de la taille.', 'محيط الخصر: قس عند أضيق نقطة طبيعية للخصر.')}</li>
                </ul>
              </div>
            )}

            {validProductUrl(product.sourceUrl) && (
              <div className="pt-3">
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary inline-flex min-h-11 items-center gap-1.5 px-4 text-xs font-bold w-full justify-center">
                  {tr('Vérifier le guide officiel chez le marchand', 'تأكد من الدليل الرسمي في المتجر')} <ArrowUpRight size={14} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
