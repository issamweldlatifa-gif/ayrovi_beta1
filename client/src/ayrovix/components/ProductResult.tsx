import React, { useEffect, useMemo, useState } from 'react';
import type { CommerceProduct, VariantGroup } from '../../../../shared/commerceProduct';
import { roundTnd, validateProductForCart } from '../../../../shared/commerceProduct';
import type { CustomerSession } from '../../types';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Heart, HeartFilled, Minus, Plus, X } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { useCommercePolicy } from '../../commerce/useCommercePolicy';
import { formatSourceMoney } from '../../commerce/formatSourceMoney';
import type { AyrovixCandidate, AyrovixProduct, AyrovixVariantOption } from '../types';
import { displayProduct } from '../services/displayProduct';
import { validProductUrl } from '../services/resultPolicy';
import { StudioImageFrame, QuietPromoPrice } from './quiet-card';
import { MerchantRating } from './MerchantRating';
import { useLensFavorites } from './useLensFavorites';
import './product-detail.css';

export interface AyrovixOrderSelection {
  productUrl: string; selectedOptions: Record<string, string>; quantity: number;
  size: string; color: string; note: string; variantOption?: AyrovixVariantOption | null;
}

interface Props {
  product: AyrovixProduct;
  ordering: boolean;
  priceVerified?: boolean;
  onOrder: (params: AyrovixOrderSelection) => void | Promise<void>;
  onBack?: () => void;
  customerSession?: CustomerSession | null;
  onOpenFavorites?: () => void;
}

function groupTitle(group: VariantGroup, tr: (fr: string, ar: string) => string, category: string | null, title: string): string {
  if (group.name === 'Size') {
    // This changes only the label of a documented group, never its options.
    const shoes = /^shoes?$/i.test(category || '') || /\b(?:chaussures?|sneakers?|boots?|baskets?)\b/i.test(title);
    return shoes ? tr('Pointure', 'مقاس الحذاء') : tr('Taille', 'المقاس');
  }
  if (group.name === 'Color') return tr('Couleur', 'اللون');
  return group.name; // Preserve the merchant's original variant name.
}

/** The same source facts power the gallery, price, option selection and order.
 * Unknown information is not replaced with category-based sample content.
 */
export const ProductResult: React.FC<Props> = ({ product, ordering, priceVerified, onOrder, onBack, customerSession, onOpenFavorites }) => {
  const { tr, locale, formatMoney } = useLocale();
  const canonical = useMemo(() => displayProduct(product), [product]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [note, setNote] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    setSelected({}); setQuantity(1); setActiveIndex(0); setLightbox(false); setNote(''); setManualUrl(''); setSubmitted(false);
  }, [canonical.id]);
  const colorGroup = canonical.variants.groups.find(group => group.type === 'color');
  const colorOption = colorGroup?.options.find(option => selected[colorGroup.id] === option.id);
  const documentedColorPhotos = colorOption ? canonical.media.colorImages[colorOption.id]
    || canonical.media.colorImages[colorOption.label]
    || canonical.media.colorImages[colorOption.label.toLocaleLowerCase()] || [] : [];
  const photos = [...new Set([
    ...documentedColorPhotos, canonical.media.primaryImage, ...canonical.media.originalImages,
  ].filter((image): image is string => Boolean(image)))];
  const activeImage = photos[Math.min(activeIndex, Math.max(photos.length - 1, 0))] || null;
  const url = canonical.identity.sourceUrl || (!product.canonical && validProductUrl(manualUrl) ? manualUrl.trim() : null);
  const selectionProduct: CommerceProduct = url && !product.canonical && !canonical.identity.sourceUrl
    ? { ...canonical, identity: { ...canonical.identity, sourceUrl: url } } : canonical;
  const validation = validateProductForCart(selectionProduct, selected, quantity);
  const offer = validation.ok === true ? canonical.variants.offers.find(item => item.id === validation.price.offerId && item.id !== null) || null : null;
  const hasSelection = Object.values(selected).some(Boolean);
  const unitTnd = validation.ok === true ? validation.price.unitPriceTnd
    : hasSelection ? null : canonical.pricing.ayroviPriceTnd;
  // An invalid/unfinished choice has no applicable source price or breakdown.
  // Keep the sourced general price visible only before the first selection.
  const showPrice = validation.ok || !hasSelection;
  const sourcePrice = showPrice ? offer?.sourcePrice ?? canonical.pricing.sourcePrice : null;
  const currency = showPrice ? offer?.sourceCurrency ?? canonical.pricing.sourceCurrency : null;
  const promotion = showPrice ? offer?.promotion ?? canonical.pricing.promotion : null;
  const originalTnd = showPrice ? (offer ? offer.promotion?.originalPriceTnd ?? null : canonical.pricing.ayroviReferenceTnd) : null;
  const unitBreakdown = showPrice ? offer?.unitBreakdown ?? canonical.pricing.unitBreakdown : null;
  const disabled = ordering || !validation.ok || (!product.canonical && !product.priceToken);
  const sourceLink = canonical.identity.sourceUrl;
  const favoriteCandidate = useMemo<AyrovixCandidate>(() => ({
    id: canonical.identity.source === 'catalog' && canonical.identity.sourceProductId ? canonical.identity.sourceProductId : canonical.id,
    kind: canonical.identity.source === 'catalog' ? 'catalog' : 'external',
    title: canonical.basic.title, brand: canonical.basic.brand, model: null, source: canonical.identity.merchant || '',
    sourceUrl: sourceLink || '', image: canonical.media.primaryImage || '', images: canonical.media.originalImages,
    colors: [], sizes: [], price: canonical.pricing.sourcePrice, currency: canonical.pricing.sourceCurrency,
    priceTnd: canonical.pricing.ayroviPriceTnd, match: 0, // hook-only candidate; similarity is not displayed
  }), [canonical, sourceLink]);
  const favorites = useLensFavorites(customerSession, onOpenFavorites);
  const commerce = useCommercePolicy(true);

  function placeOrder() {
    setSubmitted(true);
    if (disabled || !url) return;
    const sizeGroup = canonical.variants.groups.find(group => group.type === 'size');
    const colorGroup = canonical.variants.groups.find(group => group.type === 'color');
    const size = sizeGroup?.options.find(option => option.id === selected[sizeGroup.id])?.label || '';
    const color = colorGroup?.options.find(option => option.id === selected[colorGroup.id])?.label || '';
    const variantOption = (product.variantOptions || []).find(option => option.id === offer?.id) || null;
    void onOrder({ productUrl: url, selectedOptions: { ...selected }, quantity, size, color, note: note.trim(), variantOption });
  }
  const selectionMessage = validation.ok === false ? (
    validation.reason === 'VARIANT_REQUIRED' ? tr('Choisissez les options requises.', 'اختر الخيارات المطلوبة.') :
    validation.reason === 'VARIANT_UNAVAILABLE' || validation.reason === 'INVALID_VARIANT' ? tr('Cette combinaison est indisponible.', 'هذه التركيبة غير متاحة.') :
    validation.reason === 'PRICE_UNAVAILABLE' || validation.reason === 'VARIANT_PRICE_UNAVAILABLE' ? tr('Prix indisponible pour cette sélection.', 'السعر غير متوفر لهذا الخيار.') :
    validation.reason === 'PRODUCT_UNAVAILABLE' ? tr('Un lien marchand valide est nécessaire.', 'يلزم رابط متجر صالح.') :
    tr('Produit indisponible.', 'المنتج غير متاح.')
  ) : null;

  return <main className="ay-product" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="ay-product__top">
      {onBack && <button type="button" className="ay-product__icon" onClick={onBack} aria-label={tr('Retour aux résultats', 'العودة للنتائج')}><ArrowLeft size={20} /></button>}
      <span className="ay-product__source">{canonical.identity.merchant || tr('Marchand non renseigné', 'المتجر غير مذكور')}</span>
      {sourceLink && <a className="ay-product__source-link" href={sourceLink} target="_blank" rel="noopener noreferrer">{tr('Voir la source', 'عرض المصدر')} <ExternalLink size={14}/></a>}
      {sourceLink && <button className="ay-product__icon ay-product__save" type="button" disabled={favorites.busy}
        aria-label={favorites.isSaved(favoriteCandidate) ? tr('Retirer des favoris', 'إزالة من المفضلة') : tr('Ajouter aux favoris', 'أضف للمفضلة')}
        onClick={() => void favorites.toggle(favoriteCandidate)}>
        {favorites.isSaved(favoriteCandidate) ? <HeartFilled size={20}/> : <Heart size={20}/>}</button>}
    </header>
    {favorites.message && <p role="status" className="ay-product__help">{favorites.message === 'auth' ? tr('Connectez-vous pour enregistrer ce produit.', 'سجّل الدخول لحفظ المنتج.') : tr('Impossible de mettre à jour les favoris.', 'تعذّر تحديث المفضلة.')}</p>}
    <div className="ay-product__layout">
      <div className="ay-product__gallery">
        <button type="button" className="ay-product__stage" onClick={() => activeImage && setLightbox(true)}
          disabled={!activeImage} aria-label={tr('Agrandir la photo', 'تكبير الصورة')}>
          <StudioImageFrame key={activeImage || 'empty'} src={activeImage} fallbackSources={activeImage ? [activeImage] : []}
            alt={canonical.basic.title} placeholderLabel={canonical.identity.merchant || undefined} ratio="1 / 1" />
        </button>
        {photos.length > 1 && <div className="ay-product__thumbnails" aria-label={tr('Photos du produit', 'صور المنتج')}>
          {photos.map((image, index) => <button key={image} type="button" aria-label={`${tr('Photo', 'صورة')} ${index + 1}`}
            aria-current={index === activeIndex} className="ay-product__thumbnail" onClick={() => setActiveIndex(index)}>
            <StudioImageFrame src={image} fallbackSources={[image]} alt="" ratio="1 / 1" />
          </button>)}
        </div>}
        {photos.length > 1 && <span className="ay-product__count">{Math.min(activeIndex + 1, photos.length)} / {photos.length}</span>}
      </div>
      <div className="ay-product__information">
        {canonical.basic.brand && <p className="ay-product__brand">{canonical.basic.brand}</p>}
        <h1>{canonical.basic.title || tr('Produit sans titre', 'منتج بلا عنوان')}</h1>
        <MerchantRating value={{ rating: canonical.rating.value, ratingCount: canonical.rating.reviewCount, ratingKind: canonical.rating.value === null ? undefined : 'merchant' }} stars />
        <div className="ay-product__price" aria-live="polite">
          <span className="ay-product__help">{tr('Prix AYROVI par article', 'سعر AYROVI للقطعة')}</span>
          {!validation.ok && unitTnd !== null && <span className="ay-product__help">{tr('Prix de base — choix à confirmer', 'السعر الأساسي — اختر الخيارات')}</span>}
          {unitTnd !== null ? <QuietPromoPrice priceTnd={unitTnd} originalTnd={originalTnd} promo={promotion}
            format={formatMoney} variant="list" /> : <strong>{tr('Prix indisponible', 'السعر غير متوفر')}</strong>}
          {!product.canonical && unitTnd !== null && <span className="ay-product__help">{tr('Estimation sous réserve de vérification', 'تقدير يخضع للتحقق')}</span>}
          {formatSourceMoney(sourcePrice, currency, locale) && <span className="ay-product__help">{tr('Prix boutique', 'سعر المتجر')} : {formatSourceMoney(sourcePrice, currency, locale)}</span>}
          {showPrice && !offer && canonical.pricing.referencePrice !== null && formatSourceMoney(canonical.pricing.referencePrice, canonical.pricing.sourceCurrency, locale) &&
            <span className="ay-product__help">{tr('Prix de référence boutique', 'سعر المتجر المرجعي')} : <s>{formatSourceMoney(canonical.pricing.referencePrice, canonical.pricing.sourceCurrency, locale)}</s></span>}
          {unitBreakdown && <p className="ay-product__breakdown">
            {tr('Produit', 'المنتج')} {formatMoney(unitBreakdown.convertedPriceTND)} · {tr('Service', 'الخدمة')} {formatMoney(unitBreakdown.serviceFeeTND)}
            {unitBreakdown.shippingFeeTND > 0 && <> · {tr('Livraison', 'التوصيل')} {formatMoney(unitBreakdown.shippingFeeTND)}</>}
          </p>}
          {unitTnd !== null && <span className="ay-product__help">{tr('Hors livraison locale éventuelle, calculée une fois au panier.', 'باستثناء التوصيل المحلي المحتمل، يُحتسب مرة واحدة في السلة.')}</span>}
          <span className="ay-product__help">{commerce.status === 'ready' && commerce.policy.deposit.percent > 0
            ? tr(`Acompte : ${commerce.policy.deposit.percent}% selon les conditions de paiement.`, `العربون: ${commerce.policy.deposit.percent}% حسب شروط الدفع.`)
            : commerce.status === 'loading' ? tr('Conditions de paiement en cours de chargement.', 'يتم تحميل شروط الدفع.')
              : tr('Conditions de paiement indisponibles.', 'شروط الدفع غير متاحة.')}</span>
        </div>
        {canonical.basic.description && <section className="ay-product__section">
          <h2>{tr('Description du marchand', 'وصف المتجر')}</h2>
          <p className="ay-product__description">{canonical.basic.description}</p>
        </section>}
        {Object.keys(canonical.attributes).length > 0 && <section className="ay-product__section">
          <h2>{tr('Caractéristiques', 'المواصفات')}</h2>
          <dl className="ay-product__attributes">{Object.entries(canonical.attributes).map(([key, value]) =>
            <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        </section>}
        <section className="ay-product__selection" aria-label={tr('Choisir les options', 'اختيار الخيارات')}>
          {canonical.variants.groups.map(group => <div className="ay-product__group" key={group.id}>
            <label htmlFor={`ay-variant-${group.id}`}>{groupTitle(group, tr, canonical.basic.category, canonical.basic.title)}{group.required && <span aria-label={tr('obligatoire', 'مطلوب')}> *</span>}</label>
            {group.options.length > 12 ? <select id={`ay-variant-${group.id}`} value={selected[group.id] || ''}
              onChange={event => { setSelected(current => ({ ...current, [group.id]: event.target.value })); if (group.type === 'color') setActiveIndex(0); }}>
              <option value="">{tr('Choisir', 'اختر')}…</option>
              {group.options.map(option => <option key={option.id} value={option.id} disabled={option.available === false}>{option.label}{option.available === false ? ` — ${tr('Indisponible', 'غير متوفر')}` : ''}</option>)}
            </select> : <div className="ay-product__choices" role="group" aria-label={groupTitle(group, tr, canonical.basic.category, canonical.basic.title)} id={`ay-variant-${group.id}`}>
              {group.options.map(option => <button key={option.id} type="button" aria-pressed={selected[group.id] === option.id}
                disabled={option.available === false} onClick={() => { setSelected(current => ({ ...current, [group.id]: current[group.id] === option.id && !group.required ? '' : option.id })); if (group.type === 'color') setActiveIndex(0); }}>
                {option.label}</button>)}
            </div>}
            {group.type === 'size' && sourceLink && <a className="ay-product__guide-link" href={sourceLink} target="_blank" rel="noopener noreferrer">
              {tr('Guide des tailles/pointures : consulter la fiche du marchand', 'دليل المقاسات: راجع صفحة المتجر')} <ExternalLink size={14}/></a>}
          </div>)}
          {!canonical.identity.sourceUrl && !product.canonical && <div className="ay-product__group">
            <label htmlFor="ay-product-link">{tr('Lien exact du produit', 'رابط المنتج الأصلي')}</label>
            <input id="ay-product-link" type="url" inputMode="url" placeholder="https://" value={manualUrl} onChange={event => setManualUrl(event.target.value)} aria-invalid={submitted && !validProductUrl(manualUrl)} />
          </div>}
          <div className="ay-product__group ay-product__quantity">
            <label>{tr('Quantité', 'الكمية')}</label>
            <div className="ay-product__counter">
              <button type="button" aria-label={tr('Diminuer la quantité', 'تقليل الكمية')} disabled={quantity <= 1} onClick={() => setQuantity(q => q - 1)}><Minus size={16}/></button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} disabled={quantity >= 99} onClick={() => setQuantity(q => q + 1)}><Plus size={16}/></button>
            </div>
          </div>
          <label className="ay-product__note" htmlFor="ay-product-note">{tr('Précision pour la commande (facultatif)', 'ملاحظة للطلب (اختياري)')}
            <textarea id="ay-product-note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
          <button type="button" className="ay-product__buy" disabled={disabled} onClick={placeOrder}>
            {ordering ? tr('Ajout en cours…', 'جارٍ الإضافة…') : tr('Ajouter au panier', 'أضف إلى السلة')}
            {unitTnd !== null && validation.ok ? ` · ${formatMoney(roundTnd(unitTnd * quantity))}` : ''}
          </button>
          {selectionMessage && <p className="ay-product__validation" role="status">{selectionMessage}</p>}
          {!product.canonical && !product.priceToken && <p className="ay-product__validation">{tr('Devis indisponible. Relancez la recherche.', 'عرض السعر غير متوفر. أعد البحث.')}</p>}
          {(canonical.verificationStatus === 'PENDING_MANUAL' || (!product.canonical && !priceVerified)) && <p className="ay-product__help">{tr('Prix et disponibilité à confirmer auprès du marchand.', 'السعر والتوفر يخضعان لتأكيد المتجر.')}</p>}
        </section>
      </div>
    </div>
    {lightbox && activeImage && <div className="ay-product__lightbox" role="dialog" aria-modal="true" aria-label={tr('Photo du produit', 'صورة المنتج')} onKeyDown={event => {
      if (event.key === 'Escape') setLightbox(false);
      if (event.key === 'ArrowRight') setActiveIndex(index => (index + 1) % photos.length);
      if (event.key === 'ArrowLeft') setActiveIndex(index => (index + photos.length - 1) % photos.length);
    }}>
      <button type="button" className="ay-product__lightbox-close" autoFocus onClick={() => setLightbox(false)} aria-label={tr('Fermer', 'إغلاق')}><X size={24}/></button>
      {photos.length > 1 && <button type="button" className="ay-product__lightbox-nav" onClick={() => setActiveIndex(index => (index + photos.length - 1) % photos.length)} aria-label={tr('Photo précédente', 'الصورة السابقة')}><ChevronLeft size={24}/></button>}
      <StudioImageFrame key={activeImage} src={activeImage} fallbackSources={[activeImage]} alt={canonical.basic.title} ratio="1 / 1" />
      {photos.length > 1 && <button type="button" className="ay-product__lightbox-nav" onClick={() => setActiveIndex(index => (index + 1) % photos.length)} aria-label={tr('Photo suivante', 'الصورة التالية')}><ChevronRight size={24}/></button>}
    </div>}
  </main>;
};
