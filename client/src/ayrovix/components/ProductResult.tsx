import { resolveProductSelection, productSelectionLabels } from '../services/productSelection';
import { MerchantRating } from './MerchantRating';
import { Plus, Minus } from '../../components/QatafoIcons';
import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import {
  ArrowUpRight, Check, Image as ImageIcon, X, ChevronLeft, ChevronRight, ChevronDown, ShoppingBag,
} from '../../components/QatafoIcons';
import { validProductUrl } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';
import { classifyProduct, productClassLabel, extractCapacity, presentSizes, usesCapacity } from '../services/productAttributes';
import { isolatedSrc } from '../services/mediaIsolation';

export interface AyrovixOrderSelection {
  size: string;
  color: string;
  option: AyrovixVariantOption | null;
  quantity: number;
  customerNote: string;
  manualUrl: string;
}

export interface ProductResultProps {
  product: AyrovixProduct;
  ordering?: boolean;
  priceVerified?: boolean;
  onOrder: (selection: AyrovixOrderSelection) => void | Promise<void>;
  onBack?: () => void;
  onCalculateAnother?: () => void;
  onOpenCart?: () => void;
}

interface CartLineQuote {
  lineTotalTND: number;
  originalLineTotalTND: number | null;
  promo: { percent: number; label: string; discountTND: number } | null;
  pricingVersion: number;
}

/* Preuve de disponibilité honnête (restaurée de 1c48683 — les redesigns
   l'avaient écrasée ; l'étape CI «variant eligibility» la vérifie). */
const AVAILABILITY: Record<string, { fr: string; ar: string; cls: string }> = {
  in_stock: { fr: 'Disponible', ar: 'متوفر', cls: 'border border-line bg-white text-ink' },
  limited: { fr: 'Stock limité', ar: 'مخزون محدود', cls: 'border border-amber-200 bg-amber-50 text-amber-800' },
  out_of_stock: { fr: 'Rupture signalée', ar: 'غير متوفر', cls: 'border border-danger/20 bg-danger/5 text-danger' },
  unknown: { fr: 'Disponibilité à confirmer', ar: 'التوفر يحتاج إلى تأكيد', cls: 'border border-line bg-surface text-muted' },
};

export const ProductResult: React.FC<ProductResultProps> = ({
  product,
  ordering,
  priceVerified,
  onOrder,
  onBack,
  onCalculateAnother,
  onOpenCart,
}) => {
  const { tr, direction, isArabic, formatMoney } = useLocale();
  const [sizeChoice, setSizeChoice] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerNote, setCustomerNote] = useState('');
  const [manualUrl, setManualUrl] = useState(product.sourceUrl || '');
  const [submitted, setSubmitted] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  // ISOLATION PAR IMAGE (fix 24/09/2026) : chaque image de la galerie tente sa
  // version isolée (fond marchand → PNG transparent) ; si le PNG isolé échoue
  // on note l'URL et on rend l'original — jamais d'image cassée, et la galerie
  // ENTIÈRE est isolée (avant : seule la 1re image l'était).
  const [isolatedMiss, setIsolatedMiss] = useState<Record<string, boolean>>({});
  const markIsolatedMiss = (url: string) => setIsolatedMiss((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  const withIsolated = (url: string) => isolatedSrc(url, isolatedMiss);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // SWIPE sur la grande photo (remplace les flèches supprimées — référence Zalando).
  const stageTouchStart = useRef<number | null>(null);
  const [sizeDrawerOpen, setSizeDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [addedRecently, setAddedRecently] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [quote, setQuote] = useState<{ key: string; data: CartLineQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<{ key: string; message: string } | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const formId = useId();

  const requestedSize = sizeChoice;
  const resolvedColor = color || (product.colors.length === 1 ? product.colors[0] : '');
  const selection = resolveProductSelection(product, requestedSize, resolvedColor);
  const selectedOption = selection.option;
  const { price: selectedPrice, currency: selectedCurrency } = selection.offer;
  const incompleteVariantQuote = selection.offer.fromVariant && (
    selectedPrice == null || !selectedCurrency || Boolean(product.priceToken && !selection.offer.priceToken)
  );
  const selectionNotice = incompleteVariantQuote ? productSelectionLabels.incomplete : selection.kind === 'ambiguous' ? productSelectionLabels.ambiguous : productSelectionLabels.general;
  const isUrlValid = validProductUrl(manualUrl);
  const validPrice = typeof selectedPrice === 'number' && Number.isFinite(selectedPrice) && selectedPrice > 0 && Boolean(selectedCurrency);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const quoteKey = JSON.stringify([product.title, selectedPrice, selectedCurrency, quantity]);
  const currentQuote = quote?.key === quoteKey ? quote.data : null;
  const currentQuoteError = quoteError?.key === quoteKey ? quoteError.message : '';

  // ── Compréhension produit : classe, capacité, tailles ──
  const productClass = useMemo(() => classifyProduct(product.title, product.description), [product.title, product.description]);
  const isShoes = productClass === 'shoes';
  const isClothing = productClass === 'clothing';
  const isBeauty = usesCapacity(productClass);

/**
 * État de stock d'un groupe de variantes correspondant au choix du client.
 * Une seule variante réellement disponible suffit ; une rupture constatée
 * l'emporte sur l'inconnu ; l'inconnu n'est jamais promu en disponible.
 */
function variantStockState(options: { available: boolean; availability?: 'available' | 'unavailable' | 'unknown' }[]):
  'available' | 'unavailable' | 'unknown' | null {
  const stated = options.filter(option => option.availability);
  if (stated.length === 0) return null;
  if (stated.some(option => option.availability === 'available')) return 'available';
  if (stated.every(option => option.availability === 'unavailable')) return 'unavailable';
  return 'unknown';
}


  // Show only a brand supplied by the source. Never parse a title into a brand.
  const detectedBrand = product.brand?.trim() || '';
  const cleanTitle = detectedBrand && product.title.toLocaleLowerCase().startsWith(detectedBrand.toLocaleLowerCase() + ' ')
    ? product.title.slice(detectedBrand.length).replace(/^\s*[-–—|:]?\s*/, '')
    : product.title;
  const capacity = useMemo(
    () => (isBeauty ? extractCapacity(`${product.title} ${product.description || ''}`) : null),
    [isBeauty, product.title, product.description],
  );
  // Variants come from the merchant's recorded sizes/options only; a description
  // that happens to contain "50 ml" is a label, not proof of an additional SKU.
  const sourcedSizes = useMemo(() => [...new Set([
    ...product.sizes, ...(product.variantOptions || []).map(option => option.size || ''),
  ].map(size => size.trim()).filter(Boolean))], [product.sizes, product.variantOptions]);
  const sizePresentation = useMemo(
    () => presentSizes(productClass, product.title, sourcedSizes),
    [productClass, product.title, sourcedSizes],
  );
  const availableSizes = isBeauty
    ? sizePresentation.options.filter(size => extractCapacity(size) !== null)
    : isShoes || isClothing ? sizePresentation.options : [];
  const shownCapacity = isBeauty && sizeChoice ? extractCapacity(sizeChoice) : capacity;
  const matchingVariants = (product.variantOptions || []).filter(option =>
    (!requestedSize || option.size === requestedSize) && (!resolvedColor || option.color === resolvedColor));
  // Stock de la variante choisie, en trois états honnêtes (25/09/2026).
  // `availability` absent = fiche héritée : on retombe sur l'ancien booléen.
  // Un stock non confirmé n'autorise pas la commande, mais ne ment pas non plus.
  const unavailableChoice = matchingVariants.length > 0 && matchingVariants.every(option => option.available === false);
  const variantStock = variantStockState(matchingVariants);
  const unconfirmedChoice = variantStock === 'unknown';
  const refusedChoice = unavailableChoice || variantStock === 'unavailable';
  const canOrder = validPrice && isUrlValid && validQuantity && !incompleteVariantQuote && !refusedChoice && !unconfirmedChoice
    && product.availability !== 'out_of_stock' && Boolean(currentQuote)
    && (availableSizes.length === 0 || Boolean(sizeChoice))
    && (product.colors.length <= 1 || Boolean(color));

  const imageUrls = useMemo(() => {
    const raw = [...(product.images || []), product.image].filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of raw) {
      const clean = String(url).trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
    return out;
  }, [product.image, product.images]);

  // Source-backed gallery: each color may have
  // its own scraped photos. Otherwise keep the original gallery.
  // EXTRAIT COURT sous le nom (demande client 24/09/2026) : 1-2 phrases
  // propres de la description (déjà nettoyée côté scraper) — le reste vit
  // dans la section Détails & description.
  const shortDescription = useMemo(() => {
    const clean = (product.description || '').replace(/\s+/g, ' ').trim();
    if (clean.length < 30) return '';
    const cut = clean.slice(0, 180);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('؟ '));
    return (lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '')).trim();
  }, [product.description]);
  const colorImageSets = product.colorImages && typeof product.colorImages === 'object' ? product.colorImages : null;
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const galleryImages = useMemo(() => {
    const set = activeColor ? colorImageSets?.[activeColor.toLocaleLowerCase()] : null;
    // Show at most four source photos in one integrated stage. The crawl
    // retains the remaining photos; no separate thumbnails below the stage.
    const merged = set && set.length ? set : imageUrls;
    return merged.slice(0, 4);
  }, [activeColor, colorImageSets, imageUrls]);

  const activeImage = galleryImages[imageIndex] || '';
  const availabilityBadge = AVAILABILITY[product.availability] || AVAILABILITY.unknown;
  useEffect(() => {
    if (!validPrice || !validQuantity || incompleteVariantQuote || !selectedCurrency) return;
    const controller = new AbortController();
    setQuote(null);
    setQuoteError(null);
    fetch('/api/public/pricing/cart-line', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: product.title, sourcePrice: selectedPrice, sourceCurrency: selectedCurrency, quantity }),
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || payload.success !== true || !Number.isFinite(payload.data?.lineTotalTND)) {
          throw new Error(payload.error || 'Devis indisponible.');
        }
        return payload.data as CartLineQuote;
      })
      .then(data => { if (!controller.signal.aborted) setQuote({ key: quoteKey, data }); })
      .catch(() => { if (!controller.signal.aborted) setQuoteError({ key: quoteKey, message: tr('Devis indisponible. Réessayez.', 'تعذّر حساب السعر. أعد المحاولة.') }); });
    return () => controller.abort();
  }, [quoteKey, quoteAttempt, validPrice, validQuantity, incompleteVariantQuote]);

  useEffect(() => {
    setImageIndex(0);
    setSizeChoice('');
    setColor('');
    setActiveColor(null);
    setQuantity(1);
    setCustomerNote('');
    setManualUrl(product.sourceUrl || '');
    setSubmitted(false);
    setLightboxOpen(false);
    setSizeDrawerOpen(false);
    setFormOpen(false);
    setAddedRecently(false);
    setSubmitError('');
  }, [product.sourceUrl, product.image]);

  useEffect(() => {
    imageUrls.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [imageUrls]);

  useEffect(() => { setAddedRecently(false); setSubmitError(''); }, [quoteKey, requestedSize, resolvedColor]);
  useEffect(() => {
    if (!sizeDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSizeDrawerOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [sizeDrawerOpen]);

  /* FICHE « feuille montante » (mobile, 25/09/2026) — au repos le produit est
     ENTIER ; dès qu'on remonte la page, le panneau d'information passe devant
     et l'image s'éteint derrière lui. Une seule variable pilote tout le rendu,
     écrite ici et lue par client/src/styles/product-sheet.css. */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = sheetRef.current;
    if (!host || typeof window === 'undefined') return;
    const media = host.querySelector<HTMLElement>('.flow-media');
    if (!media) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const info = host.querySelector<HTMLElement>('.flow-info');
      const mediaBox = media.getBoundingClientRect();
      // Recouvrement réel : de combien la feuille d'information mord sur l'image.
      // La course utile s'arrête aux 4/5 de la hauteur du média — au-delà, la
      // feuille a fini de le couvrir et continuer à assombrir ne dit plus rien.
      const overlap = info ? mediaBox.bottom - info.getBoundingClientRect().top : 0;
      const travel = Math.max(1, mediaBox.height * 0.8);
      const reveal = Math.min(1, Math.max(0, overlap / travel));
      host.style.setProperty('--ay-pdp-reveal', reveal.toFixed(3));
      host.dataset.ayPdpCovered = String(reveal > 0.6);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [galleryImages.length]);

  const showNext = () => setImageIndex((current) => Math.min(current + 1, galleryImages.length - 1));
  const showPrev = () => setImageIndex((current) => Math.max(current - 1, 0));

  const handleAddToCart = async () => {
    setSubmitted(true);
    if (!isUrlValid || !validQuantity) { setFormOpen(true); return; }
    if (!canOrder || submitting || ordering || addedRecently) return;
    setSubmitting(true);
    setSubmitError('');
    setAddedRecently(false);
    try {
      await onOrder({
        size: requestedSize,
        color: resolvedColor.trim(),
        option: selectedOption,
        quantity,
        customerNote: customerNote.trim(),
        manualUrl: manualUrl.trim(),
      });
      setAddedRecently(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : tr("L'article n'a pas pu être ajouté. Réessayez.", 'تعذّرت إضافة المنتج. أعد المحاولة.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flow-product pb-10" dir={direction} ref={sheetRef} data-ay-product-sheet>
      {/* ── En-tête mobile épuré Zalando : < [Catégorie] à gauche, Panier à droite ── */}
      <div className="flex min-h-14 items-center justify-between gap-3 py-2 mb-3 border-b border-line/40">
        <button
          type="button"
          onClick={() => {
            if (onBack) onBack();
            else if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:opacity-80 transition"
          aria-label={tr('Retour à la catégorie', 'رجوع للفئة')}
        >
          <ChevronLeft size={20} className="rtl:rotate-180 text-ink" />
          <span className="text-base font-bold text-ink">{productClassLabel(productClass, isArabic)}</span>
        </button>
        {onOpenCart && <button type="button" onClick={onOpenCart}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface"
          aria-label={tr('Ouvrir le panier', 'فتح السلة')}>
          <ShoppingBag size={22} />
        </button>}
      </div>

      {/* ── 1. LE PRODUIT D'ABORD — image immersive studio + infos ── */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:items-start">
        {/* Media — canvas studio unifié, image spacieuse, pure et confortable sans assombrissement */}
        <div className="flow-media min-w-0">
          <div className="relative overflow-hidden rounded-2xl bg-[#f6f6f6]">
            {/* Voile de mise en retrait : il ne s'active QUE lorsque la feuille
                d'information monte par-dessus l'image (variable --ay-pdp-reveal). */}
            <div className="ay-pdp-scrim" aria-hidden="true" />

            {/* Overlay Badges */}
            <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
              {currentQuote?.promo && <span className="rounded-md bg-[#c82332] px-2.5 py-1 text-xs font-bold text-white">
                {currentQuote.promo.label || tr('Promotion', 'تخفيض')}
              </span>}
            </div>

            {/* Stage de l'image — ratio ZALANDO RÉEL 9/13 (packshot mesuré 1000×1444),
                canvas studio #f6f6f6 (couleur mesurée au pixel près sur la page marchand),
                image entière en object-fit contain — jamais de rognage du produit. */}
            <div
              className="ayrovix-product-gallery-stage bg-[#f6f6f6] relative flex w-full items-center justify-center overflow-hidden"
              onTouchStart={(event) => { stageTouchStart.current = event.touches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                const start = stageTouchStart.current;
                stageTouchStart.current = null;
                if (start == null || galleryImages.length < 2) return;
                const delta = (event.changedTouches[0]?.clientX ?? start) - start;
                if (Math.abs(delta) < 40) return;
                if (delta < 0) showNext(); else showPrev();
              }}
            >
              {activeImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={tr('Agrandir la photo du produit', 'تكبير صورة المنتج')}
                  className="flex h-full w-full items-center justify-center cursor-zoom-in"
                >
                  <img
                    src={withIsolated(activeImage)}
                    alt={cleanTitle}
                    referrerPolicy="no-referrer"
                    decoding="async"
                    fetchPriority="high"
                    draggable={false}
                    data-isolated={withIsolated(activeImage) !== activeImage}
                    onError={() => {
                      if (withIsolated(activeImage) !== activeImage) markIsolatedMiss(activeImage);
                      else setImageIndex((current) => Math.min(current + 1, galleryImages.length - 1));
                    }}
                    className="ayrovix-product-gallery-image h-full w-full transition-transform duration-300"
                  />
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted"><ImageIcon size={48} /></div>
              )}

              {/* Bouton de recherche visuelle supprimé (décision client 24/09/2026) —
                  la recherche visuelle reste accessible depuis Lens. */}

              {/* Indicateur de pagination photo 1 / N (en bas à gauche, identique Zalando Screenshot 2) */}
              {galleryImages.length > 1 && (
                <div className="ay-pdp-media-controls absolute bottom-3.5 left-3.5 z-10 pointer-events-none">
                  <span className="rounded-md bg-white/90 backdrop-blur-xs px-2.5 py-1 text-xs font-bold text-ink shadow-xs">
                    {imageIndex + 1} / {galleryImages.length}
                  </span>
                </div>
              )}

              {galleryImages.length > 1 && <div className="ay-pdp-media-controls absolute inset-x-3 bottom-3 z-10 flex items-center justify-end gap-2">
                <button type="button" onClick={showPrev} disabled={imageIndex === 0}
                  aria-label={tr('Photo précédente', 'الصورة السابقة')}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink disabled:opacity-40"><ChevronLeft size={18} /></button>
                <button type="button" onClick={showNext} disabled={imageIndex === galleryImages.length - 1}
                  aria-label={tr('Photo suivante', 'الصورة التالية')}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink disabled:opacity-40"><ChevronRight size={18} /></button>
              </div>}
            </div>

            {/* Bandeau « Article populaire » supprimé (décision client 24/09/2026). */}

          </div>
        </div>

        {/* Info — hiérarchie Zalando : Marque, Titre, Notes, Prix, Couleurs, Tailles */}
        <div className="flow-info min-w-0 space-y-4">
          <div className="space-y-1">
            {/* Marque — encre forte, soulignée */}
            {detectedBrand && <h2 className="text-xl sm:text-2xl font-black tracking-tight text-ink">{detectedBrand}</h2>}
            {/* Titre complet propre */}
            <h1 className="text-base sm:text-lg font-medium leading-snug text-ink/90 pt-0.5">
              {cleanTitle}
            </h1>
            {/* Avis / Évaluation sociale */}
            {shortDescription && (
              <p className="break-words text-sm leading-relaxed text-ink/80 line-clamp-2">{shortDescription}</p>
            )}
            <MerchantRating value={product} stars />
          </div>

          {/* Prix — Élément le plus fort, ROUGE si promo */}
          <div className="pt-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-3xl sm:text-4xl font-black tracking-tight"
                data-product-price-tnd={currentQuote?.lineTotalTND}
                style={{ color: currentQuote?.promo ? 'var(--ayrovi-promo, #dc2626)' : 'var(--ayrovi-text-primary, #000)' }}
              >
                <bdi dir="ltr">{currentQuote ? formatMoney(currentQuote.lineTotalTND) : tr('Prix à confirmer', 'السعر قيد التأكيد')}</bdi>
              </span>
              <span className="text-xs font-medium text-muted">
                {priceVerified ? tr('Prix source vérifié · article estimé', 'سعر المصدر موثّق · المنتج تقديري') : tr('Prix estimé de l’article', 'السعر التقديري للمنتج')}
              </span>
            </div>

            {/* SOURCE MONÉTAIRE (restauré de 1c48683) : le prix du marchand dans
                SA devise reste visible à côté de la conversion TND — contrat
                «displayed monetary source agrees with selection». */}
            {validPrice && selectedPrice != null && selectedCurrency && (
              <p className="break-words text-xs font-medium text-muted">
                {tr('Prix boutique', 'سعر المتجر')}{' '}
                <bdi dir="ltr">{selectedPrice.toFixed(2)} {selectedCurrency}</bdi>
              </p>
            )}

            {/* إشعار الاختيار غير المكتمل/التقدير العام (restauré de 1c48683 —
                contrat «general estimate is honest and localized») */}
            {(incompleteVariantQuote || selection.generalEstimate) && (
              <p data-variant-selection-notice role={incompleteVariantQuote ? 'alert' : 'status'} className="break-words border-s-2 border-line ps-3 text-sm leading-relaxed text-muted">{tr(selectionNotice[0], selectionNotice[1])}</p>
            )}

            {/* Preuve de disponibilité — jamais de stock inventé (contrat marchand) */}
            <span data-availability-badge className={`ay-readable-label inline-block w-fit rounded-control px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${availabilityBadge.cls}`}>
              {availabilityBadge[isArabic ? 'ar' : 'fr']}
            </span>

            {/* Prix de référence original barré et remise en rouge */}
            {currentQuote?.promo && currentQuote.originalLineTotalTND != null && (
              <div className="flex items-center gap-2 text-xs font-semibold text-muted mt-1.5">
                <span>{tr('Prix de référence :', 'السعر المرجعي :')} <del dir="ltr" className="text-sm font-normal leading-none text-muted line-through">{formatMoney(currentQuote.originalLineTotalTND)}</del></span>
                <span className="font-bold text-[#dc2626]" dir="ltr">−{currentQuote.promo.percent}%</span>
              </div>
            )}

            {/* Contenance du produit, uniquement si publiée par la source */}
            {shownCapacity && (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="rounded-control border border-line bg-surface px-2.5 py-0.5 text-xs font-extrabold text-ink">{shownCapacity.label}</span>
              </p>
            )}

            {/* Lien officiel vers la boutique marchand avec flèche */}
            {validProductUrl(product.sourceUrl) && (
              <div className="pt-2">
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
                >
                  {tr('Voir chez le marchand', 'عرض في المتجر الأصلي')}<ArrowUpRight size={14} />
                </a>
              </div>
            )}
          </div>

          {/* Couleur unique */}
          {product.colors.length === 1 && (
            <div className="pt-1 border-t border-line/40">
              <p className="text-xs font-bold text-ink">
                {tr('Couleur :', 'اللون :')} <span className="font-normal text-muted">{product.colors[0]}</span>
              </p>
            </div>
          )}

          {/* Palette de couleurs (si plusieurs couleurs réelles disponibles) */}
          {product.colors.length > 1 && (
            <div className="space-y-2 pt-1 border-t border-line/40">
              <p className="text-xs font-bold text-ink">
                {tr('Couleur :', 'اللون :')} <span className="font-normal text-muted">{color || tr('À choisir', 'اختر اللون')}</span>
              </p>
              <div className="flex items-center gap-2.5 overflow-x-auto py-1" role="radiogroup" aria-label={tr('Choisir une couleur', 'اختيار اللون')}>
                {product.colors.map((item) => {
                  const selected = color === item;
                  // Photo PROPRE à cette couleur (jeu colorImages du scraper) —
                  // jamais une supposition d'index : sans donnée réelle on garde
                  // l'image d'angle existante, sinon l'étiquette texte.
                  const colorSet = colorImageSets?.[item.toLocaleLowerCase()];
                  const swatchImage = colorSet?.[0];
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setColor(item);
                        setActiveColor(colorSet?.length ? item : null);
                        setImageIndex(0);
                      }}
                      role="radio"
                      aria-checked={selected}
                      aria-label={tr(`Couleur ${item}`, `اللون ${item}`)}
                      className={`shrink-0 rounded-xl overflow-hidden transition ${
                        selected ? 'border-2 border-black p-0.5' : 'border border-line/60 p-0.5 hover:border-black/50'
                      }`}
                    >
                      <div className="h-14 w-11 rounded-lg bg-[#f6f6f6] flex items-center justify-center overflow-hidden">
                        {swatchImage ? (
                          <img src={swatchImage} alt={item} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-bold text-muted uppercase">{item.slice(0, 3)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sélecteur de taille (Taille / Pointure) */}
          {(isClothing || isShoes || (isBeauty && availableSizes.length > 0)) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink">
                  {isShoes ? tr('Pointure', 'المقاس') : isBeauty ? tr('Contenance', 'السعة') : tr('Taille', 'المقاس')}
                </label>
              </div>

              {availableSizes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSizeDrawerOpen(true)}
                  className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-black bg-white px-4 text-sm font-semibold text-ink transition hover:bg-surface shadow-xs"
                  aria-expanded={sizeDrawerOpen}
                >
                  <span className={sizeChoice ? 'font-bold text-ink' : 'text-ink/80'}>
                    {sizeChoice || (isBeauty ? tr('Choisir une contenance', 'اختر السعة') : tr('Votre taille', 'اختر مقاسك'))}
                  </span>
                  <ChevronDown size={20} className={`text-ink transition-transform ${sizeDrawerOpen ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <p role="status" className="text-sm text-muted">
                  {isShoes ? tr('Pointures non communiquées', 'المقاسات غير متاحة') : isClothing ? tr('Tailles non communiquées', 'المقاسات غير متاحة') : tr('Contenance non communiquée', 'السعة غير متاحة')}
                </p>
              )}
            </div>
          )}

          {/* Description produit */}
          {product.description ? (
            <div className="pt-3 border-t border-line/60 space-y-1.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-ink">{tr('Détails & description', 'تفاصيل ووصف المنتج')}</h3>
              <p className="break-words text-sm font-normal leading-relaxed text-ink/80 whitespace-pre-line">{product.description}</p>
            </div>
          ) : null}

          {currentQuoteError && <p role="alert" className="text-sm text-danger">{currentQuoteError} <button type="button" className="underline" onClick={() => setQuoteAttempt(value => value + 1)}>{tr('Réessayer', 'أعد المحاولة')}</button></p>}
          {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}

          {/* Raison honnête du refus : le client doit savoir POURQUOI il ne peut
              pas commander cette variante — rupture constatée, ou stock que la
              source n'a pas confirmé (on ne devine jamais à sa place). */}
          {(refusedChoice || unconfirmedChoice) && (
            <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
              {refusedChoice
                ? tr('Cette variante est en rupture chez la source.', 'هذا الخيار مفقود من المخزون عند المصدر.')
                : tr("La source ne confirme pas le stock de cette variante. Choisissez-en une autre.", 'المصدر ما أكدش توفر هذا الخيار. اختار خيار آخر.')}
            </p>
          )}

          {/* ── 2. CTA — "Ajouter au panier" + "Calculer un autre article" ── */}
          <div className="pt-3 space-y-2.5">
            <button
              type="button"
              onClick={addedRecently ? undefined : handleAddToCart}
              aria-label={addedRecently ? tr('Produit ajouté', 'تمت إضافة المنتج') : tr('Ajouter au panier', 'زيد للسلة')}
              aria-disabled={addedRecently ? true : undefined}
              aria-busy={ordering || submitting ? true : undefined}
              disabled={ordering || submitting || !canOrder}
              className="ay-btn-cta w-full rounded-full bg-black py-4 px-6 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[52px] shadow-sm"
            >
              {ordering || submitting ? (
                <>
                  <span className="ay-cart-loading" aria-hidden="true" />
                  <span role="status">{tr('Ajout au panier…', 'جارٍ الإضافة إلى السلة…')}</span>
                </>
              ) : addedRecently ? (
                <>
                  <Check className="h-4 w-4 text-white" />
                  <span role="status">{tr('Produit ajouté', 'تمت إضافة المنتج')}</span>
                </>
              ) : (
                <span>{tr('Ajouter au panier', 'زيد للسلة')}</span>
              )}
            </button>

            {/* Bouton secondaire : Calculer un autre article */}
            <button
              type="button"
              onClick={() => {
                if (onCalculateAnother) {
                  onCalculateAnother();
                } else {
                  const searchTrigger = document.querySelector('[data-ayrovi-search-trigger]') as HTMLElement;
                  if (searchTrigger) searchTrigger.click();
                  else window.dispatchEvent(new CustomEvent('ayrovi:new-search'));
                }
              }}
              className="w-full rounded-full border border-black bg-white py-3.5 px-6 text-sm font-bold text-black transition hover:bg-surface active:scale-[0.99] flex items-center justify-center gap-2 min-h-[48px]"
            >
              <span>{tr('Calculer un autre article', 'حساب منتج آخر')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. FORMULAIRE AVANCÉ — replié dans « Modifier la commande » pour l'équipe d'achat ── */}
      <details className="mt-6 rounded-xl border border-line bg-white" open={formOpen} onToggle={(event) => setFormOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-extrabold text-ink [&::-webkit-details-marker]:hidden">
          {tr('Lien, quantité et note', 'الرابط والكمية والملاحظة')}

        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4">
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

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink">{tr('Note pour l’équipe d’achat', 'ملاحظة لفريق الشراء')}</span>
              <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={2}
                className="w-full resize-none rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink" />
            </label>
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
            <span className="px-2 text-xs font-extrabold text-ink" dir="ltr">{`${imageIndex + 1} / ${galleryImages.length}`}</span>
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
            {galleryImages.length > 1 && (
              <>
                <button type="button" onClick={showPrev} disabled={imageIndex === 0} aria-label={tr('Photo précédente', 'الصورة السابقة')} className="absolute start-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink disabled:opacity-30"><ChevronLeft size={20} /></button>
                <button type="button" onClick={showNext} disabled={imageIndex >= galleryImages.length - 1} aria-label={tr('Photo suivante', 'الصورة التالية')} className="absolute end-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink disabled:opacity-30"><ChevronRight size={20} /></button>
              </>
            )}
          </div>
        </div>
      )}

      {sizeDrawerOpen && availableSizes.length > 0 && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40" role="dialog" aria-modal="true"
          aria-label={isShoes ? tr('Choisir votre pointure', 'اختر مقاس الحذاء') : isBeauty ? tr('Choisir une contenance', 'اختر السعة') : tr('Choisir votre taille', 'اختر المقاس')}
          onClick={() => setSizeDrawerOpen(false)}>
          <div className="ay-product-size-sheet w-full max-w-lg rounded-t-3xl bg-white px-5 pt-3 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-neutral-300" />
            <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-muted">{productClassLabel(productClass, isArabic)}</p>
                {detectedBrand && <p className="mt-1 text-base font-black text-ink">{detectedBrand}</p>}
                <p className="mt-1 break-words text-sm text-ink">{cleanTitle}</p>
              </div>
              <button type="button" onClick={() => setSizeDrawerOpen(false)} aria-label={tr('Fermer', 'إغلاق')}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-surface"><X size={20} /></button>
            </div>
            <p className="py-3 text-sm font-bold text-ink">{isShoes ? tr('Pointures disponibles', 'المقاسات المتوفرة') : isBeauty ? tr('Contenances disponibles', 'السعات المتوفرة') : tr('Tailles disponibles', 'المقاسات المتوفرة')}</p>
            <div className="max-h-[55dvh] overflow-y-auto divide-y divide-line">
              {availableSizes.map(size => {
                const options = (product.variantOptions || []).filter(option => option.size === size);
                const stock = variantStockState(options);
                const notSelectable = (options.length > 0 && options.every(option => option.available === false))
                  || stock === 'unavailable' || stock === 'unknown';
                const labels = [...new Set(options.map(option => option.label.trim()).filter(label => label && label !== size))];
                return <button key={size} type="button" disabled={notSelectable}
                  onClick={() => { setSizeChoice(size); setSizeDrawerOpen(false); }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-start text-sm text-ink disabled:opacity-50"
                  aria-pressed={sizeChoice === size}>
                  <span><strong className="text-base">{size}</strong>
                    {labels.length === 1 && <span className="ms-2 text-xs text-muted" dir="auto">{labels[0]}</span>}
                  </span>
                  {stock === 'unknown' ? <span className="text-xs text-muted">{tr('Stock non confirmé', 'المخزون غير مؤكد')}</span>
                    : notSelectable ? <span className="text-xs text-muted">{tr('Indisponible', 'غير متاح')}</span>
                      : sizeChoice === size ? <Check size={18} /> : null}
                </button>;
              })}
            </div>
            <p className="ay-safe-bottom border-t border-line py-3 text-xs leading-relaxed text-muted">{tr('Le choix d’une option ne confirme pas son stock. Seules les tailles indiquées par la source sont proposées.', 'اختيار مقاس لا يؤكد توفره؛ نعرض الخيارات المذكورة في المصدر فقط.')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
