import React, { useRef, useState } from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import { SizeDrape } from './SizeDrape';
import { refusalReason, type ProductActions, type ProductView, type SizeOption } from './types';

/**
 * Mobile product page: a full-bleed, full-height source gallery stays under the
 * app bar. Its source photos are swipeable in place; the details sheet remains
 * in document flow and rises over the gallery with a soft shadow on scroll.
 */
export interface ProductPageProps {
  product: ProductView;
  actions?: ProductActions;
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  priceChecking?: boolean;
  onCalculateAnother?: () => void;
  defaultLink?: string;
  canAdd?: boolean;
  onChosenSize?: (value: string) => void;
  selectionNotice?: { text: string; alert: boolean } | null;
}

export const ProductPage: React.FC<ProductPageProps> = ({
  product,
  actions,
  tr,
  formatMoney,
  direction = 'ltr',
  priceChecking = false,
  onCalculateAnother,
  defaultLink = '',
  canAdd = true,
  onChosenSize,
  selectionNotice = null,
}) => {
  const [slide, setSlide] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [mediaStep, setMediaStep] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [link, setLink] = useState(defaultLink);
  const [drapeOpen, setDrapeOpen] = useState(false);
  const [chosen, setChosen] = useState<SizeOption | null>(null);
  const [refusal, setRefusal] = useState<'unavailable' | 'unknown' | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [duplicateUpdated, setDuplicateUpdated] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [shake, setShake] = useState(false);
  const touchStart = useRef<number | null>(null);

  // A source product contributes at most four canonical gallery frames. Keep
  // the full ProductView intact; this screen shows the merchant's primary four.
  const media = product.media.slice(0, 4);
  const slides = media.length;
  const sizeMissing = product.sizes.length > 0 && !chosen;
  const colorMissing = product.colors.length > 1 && !product.colors.some((color) => color.selected);
  const checkedMs = product.availabilityCheckedAt ? Date.parse(product.availabilityCheckedAt) : NaN;
  const expiryMs = product.availabilityExpiresAt ? Date.parse(product.availabilityExpiresAt) : NaN;
  const availabilityFresh = Number.isFinite(checkedMs) && Date.now() >= checkedMs - 5 * 60_000
    && (Number.isFinite(expiryMs) ? Date.now() < expiryMs : Date.now() - checkedMs <= 6 * 60 * 60_000);
  const currentProductAvailability = availabilityFresh ? product.availability : 'unknown';
  const currentSizes = product.sizes.map((size) => ({ ...size, state: availabilityFresh || size.state !== 'available' ? size.state : 'unknown' as const }));
  const purchaseAvailability = colorMissing ? 'unknown' : chosen
    ? (currentProductAvailability === 'unavailable' ? 'unavailable' : currentSizes.find((size) => size.value === chosen.value)?.state || 'unknown')
    : product.sizes.length > 0 ? 'unknown' : currentProductAvailability;
  const availabilityBlocked = purchaseAvailability === 'unavailable';
  const checkedAt = product.availabilityCheckedAt && Number.isFinite(Date.parse(product.availabilityCheckedAt))
    ? new Date(product.availabilityCheckedAt).toLocaleString(direction === 'rtl' ? 'ar-TN' : 'fr-TN', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  const go = (next: number) => {
    if (!slides) return;
    setSlide(((next % slides) + slides) % slides);
  };
  const renderRail = (className: string) => (actions?.onNotify || actions?.onFavorite || actions?.onOpenBag) ? (
    <div className={className} aria-label={tr('Actions du produit', 'إجراءات المنتج')}>
      {actions?.onNotify && <button type="button" className="s-rail__btn" onClick={actions.onNotify} aria-label={tr('Créer une alerte produit', 'أنشئ تنبيهًا للمنتج')}><EditorialIcon name="Bell" size={22} /></button>}
      {actions?.onFavorite && <button type="button" className="s-rail__btn" aria-pressed={Boolean(actions.favorite)} onClick={actions.onFavorite} aria-label={tr('Ajouter aux favoris', 'أضف للمفضّلة')}><EditorialIcon name={actions.favorite ? 'HeartFilled' : 'Heart'} size={22} fill={actions.favorite ? 'currentColor' : undefined} /></button>}
      {actions?.onOpenBag && <button type="button" className="s-rail__btn" data-solid="true" onClick={actions.onOpenBag} aria-label={tr('Ouvrir le panier', 'افتح السلة')}><EditorialIcon name="Bag" size={22} /></button>}
    </div>
  ) : null;

  const pickSize = (size: SizeOption) => {
    const reason = availabilityFresh ? refusalReason(size) : size?.state === 'available' ? 'unknown' : refusalReason(size);
    if (reason) {
      setRefusal(reason);
      setChosen(null);
      onChosenSize?.('');
      setDrapeOpen(false);
      setShake(true);
      window.setTimeout(() => setShake(false), 300);
      return;
    }
    setRefusal(null);
    setChosen(size);
    onChosenSize?.(size.value);
    setDrapeOpen(false);
  };

  const add = async () => {
    if (!actions?.onAddToBag || adding || !canAdd) return;
    if (sizeMissing) {
      setDrapeOpen(true);
      return;
    }
    setAdding(true);
    setOrderError('');
    try {
      const result = await actions.onAddToBag(chosen, quantity, { note: note.trim(), link: link.trim() });
      setAdded(true);
      setDuplicateUpdated(Boolean(result && typeof result === 'object' && result.duplicate));
      window.setTimeout(() => { setAdded(false); setDuplicateUpdated(false); }, 2400);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : tr('Le devis de cette sélection est incomplet.', 'عرض سعر هذا الاختيار غير مكتمل.'));
    } finally {
      setAdding(false);
    }
  };

  const sizeWord = product.sizeKind === 'shoes'
    ? tr('Votre pointure', 'مقاسك')
    : product.sizeKind === 'clothing'
      ? tr('Votre taille', 'قياسك')
      : product.sizeKind === 'capacity'
        ? tr('Choisir une contenance', 'اختار السعة')
        : product.sizeKind === 'storage'
          ? tr('Choisir le stockage', 'اختار سعة التخزين')
          : tr('Votre option', 'الخيار الذي تريده');
  const rawOptionLabel = product.optionLabel?.trim() || '';
  const optionLabel = /^(?:taille|size)$/i.test(rawOptionLabel) ? tr('Taille', 'المقاس')
    : /^(?:pointure|shoe size)$/i.test(rawOptionLabel) ? tr('Pointure', 'المقاس')
      : /^(?:stockage|storage|memory|mémoire)$/i.test(rawOptionLabel) ? tr('Stockage', 'التخزين')
        : /^(?:volume|contenance|capacity)$/i.test(rawOptionLabel) ? tr('Contenance', 'السعة')
          : /^(?:référence|reference|ref)$/i.test(rawOptionLabel) ? tr('Référence', 'المرجع')
            : /^(?:modèle|model)$/i.test(rawOptionLabel) ? tr('Modèle', 'الموديل')
          : rawOptionLabel || (product.sizeKind === 'shoes' ? tr('Pointure', 'المقاس')
            : product.sizeKind === 'clothing' ? tr('Taille', 'المقاس')
              : product.sizeKind === 'capacity' ? tr('Contenance', 'السعة')
                : product.sizeKind === 'storage' ? tr('Stockage', 'التخزين') : tr('Option', 'الخيار'));
  const sizeListTitle = product.sizeKind === 'shoes'
    ? tr('Pointures disponibles', 'المقاسات المتوفرة')
    : product.sizeKind === 'capacity'
      ? tr('Contenances disponibles', 'السعات المتوفرة')
      : product.sizeKind === 'storage'
        ? tr('Stockages disponibles', 'سعات التخزين المتوفرة')
        : tr('Options disponibles', 'الخيارات المتوفرة');

  return (
    <div className="s-root s-page s-product-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={actions?.onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title">
          <span>{product.brand || product.merchant?.name || tr('Produit', 'منتج')}</span>
          <small>{product.title}</small>
        </div>
        {actions?.onShare
          ? <button type="button" className="s-iconbtn" onClick={actions.onShare} aria-label={tr('Partager ce produit', 'شارك هذا المنتج')}><EditorialIcon name="Share" /></button>
          : <span className="s-appbar__spacer" aria-hidden="true" />}
      </header>

      <main className="s-stage">
        <section className="s-media" aria-label={tr('Photos du produit', 'صور المنتج')}>
          <div
            className="s-media__viewport"
            onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (start == null || slides < 2) return;
              const delta = (event.changedTouches[0]?.clientX ?? start) - start;
              if (Math.abs(delta) >= 40) go(slide + (delta < 0 ? 1 : -1) * (direction === 'rtl' ? -1 : 1));
            }}
          >
            {slides > 0 ? (
              <div className="s-media__track" style={{ transform: `translateX(${(direction === 'rtl' ? 1 : -1) * slide * 100}%)` }}>
                {media.map((item, index) => {
                  const chain = [item.src, ...item.fallbacks];
                  const isolated = chain.find((src) => src.startsWith('/api/public/media/isolated?'));
                  // Full-screen hero uses the trimmed transparent cutout first,
                  // not the 9:13 catalogue composition that leaves extra margins.
                  const heroChain = isolated && item.src.startsWith('/api/public/media/card?')
                    ? [isolated, ...chain.filter((src) => src !== isolated)]
                    : chain;
                  const step = Math.min(mediaStep[index] ?? 0, heroChain.length - 1);
                  return (
                    <div className="s-media__slide" key={`${item.src}-${index}`}>
                      <button type="button" className="s-media__open" onClick={() => setZoomed(true)} aria-label={tr('Agrandir la photo', 'كبّر الصورة')}>
                        {Math.abs(index - slide) <= 1
                          ? <img
                              src={heroChain[step]}
                              alt={item.alt}
                              decoding="async"
                              referrerPolicy="no-referrer"
                              draggable={false}
                              onError={() => setMediaStep((current) => ({ ...current, [index]: Math.min((current[index] ?? 0) + 1, heroChain.length - 1) }))}
                            />
                          : <span className="s-media__placeholder" aria-hidden="true" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="s-media__empty" role="status">{tr('Photo du produit indisponible', 'صورة المنتج غير متوفّرة')}</div>
            )}
          </div>

          {product.flags.length > 0 && (
            <div className="s-card__flags s-product__flags">
              {product.flags.map((flag) => <span key={flag.label} className={`s-flag s-flag--${flag.kind}`}>{flag.label}</span>)}
            </div>
          )}
          {renderRail('s-rail s-rail--desktop')}
          {slides > 1 && (
            <nav className="s-gallery-progress" aria-label={tr('Photos du produit', 'صور المنتج')}>
              {media.map((item, index) => (
                <button key={`${item.src}-progress-${index}`} type="button" aria-current={slide === index ? 'true' : undefined} aria-label={tr(`Afficher la photo ${index + 1}`, `اعرض الصورة ${index + 1}`)} onClick={() => go(index)}>
                  <span aria-hidden="true" />
                </button>
              ))}
            </nav>
          )}
          {slides > 1 && (
            <>
              <span className="s-counter s-gallery-desktop-only">{slide + 1} / {slides}</span>
              <div className="s-gallery-nav s-gallery-desktop-only">
                <button type="button" className="s-rail__btn" onClick={() => go(slide - 1)} aria-label={tr('Photo précédente', 'الصورة السابقة')}><EditorialIcon name="ChevronLeft" size={18} direction={direction} /></button>
                <button type="button" className="s-rail__btn" onClick={() => go(slide + 1)} aria-label={tr('Photo suivante', 'الصورة التالية')}><EditorialIcon name="ChevronRight" size={18} direction={direction} /></button>
              </div>
              <div className="s-gallery-thumbs s-gallery-desktop-only" role="group" aria-label={tr('Choisir une photo', 'اختار صورة')}>
                {media.map((item, index) => <button key={`${item.src}-desktop-thumb-${index}`} type="button" aria-current={slide === index ? 'true' : undefined} aria-label={tr(`Afficher la photo ${index + 1}`, `اعرض الصورة ${index + 1}`)} onClick={() => go(index)}><img src={item.src} alt="" loading="lazy" /></button>)}
              </div>
            </>
          )}
        </section>

        <section className="s-sheet" aria-label={tr('Détails du produit', 'تفاصيل المنتج')}>
          {renderRail('s-rail s-rail--sheet')}
          {product.colors.length > 1 && (
            <div className="s-swatches" role="group" aria-label={tr('Couleurs', 'الألوان')}>
              {product.colors.map((color) => <button key={color.name} type="button" className="s-swatch" aria-pressed={color.selected} aria-label={color.name} onClick={() => actions?.onSelectColor?.(color.name)}>{color.media ? <img src={color.media.src} alt="" /> : <span>{color.name.slice(0, 3)}</span>}</button>)}
            </div>
          )}
          {product.brand && <div className="s-brand">{product.brand}</div>}
          <h1 className="s-title">{product.title}</h1>
          {product.merchant?.name && <p className="s-merchant">{tr('Source : ', 'المصدر: ')}{product.merchant.name}</p>}
          {product.description && <p className="s-desc">{product.description}</p>}
          {product.capacity && <p className="s-capacity">{product.capacity}</p>}

          {!product.price && (
            <div className="s-price s-price--pending" role="status">
              <span className="s-price__label">{tr('Prix AYROVI', 'سعر AYROVI')}</span>
              <span>{priceChecking ? tr('Vérification du prix à la source…', 'نتثبّتو في السعر عند المصدر…') : tr('Prix à confirmer', 'السعر قيد التأكيد')}</span>
            </div>
          )}
          {product.price && (
            <>
              <div className="s-price" data-deal={Boolean(product.price.reference)}>
                <span className="s-price__label">{product.price.verifiedAtSource ? tr('Prix AYROVI', 'سعر AYROVI') : tr('Prix AYROVI', 'سعر AYROVI')}</span>
                <strong data-product-price-tnd={product.price.current.tnd}>{formatMoney(product.price.current.tnd)}</strong>
                {priceChecking && <span className="s-price__note" role="status">{tr('Vérification à la source…', 'نتثبّتو في السعر عند المصدر…')}</span>}
              </div>
              {product.price.reference && <p className="s-was">{tr('Prix de référence : ', 'السعر المرجعي: ')}<s>{formatMoney(product.price.reference.tnd)}</s>{product.price.discountPercent != null && <b> −{product.price.discountPercent}%</b>}</p>}
              {product.price.current.source && <p className="s-was">{Number(product.price.current.source.amount).toFixed(2)} {product.price.current.source.currency}{product.price.verifiedAtSource ? ` · ${tr('prix vérifié à la source', 'السعر متثبّت عند المصدر')}` : ''}</p>}
            </>
          )}

          <details className="s-details">
            <summary>{tr('Lien et note (facultatif)', 'الرابط والملاحظة (اختياري)')}</summary>
            <label><span>{tr('Lien du produit chez le marchand', 'رابط المنتج عند التاجر')}</span><input value={link} onChange={(event) => setLink(event.target.value)} inputMode="url" placeholder="https://" aria-invalid={link.trim().length > 0 && !/^https?:\/\/\S+$/i.test(link.trim())} /></label>
            <label><span>{tr('Note pour notre équipe', 'ملاحظة لفريقنا')}</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} /></label>
          </details>
        </section>

        <section className="s-buybar s-buybar--product" aria-label={tr('Choix et achat', 'الاختيار والشراء')}>
          <div className="s-availability" data-state={purchaseAvailability} role="status" aria-live="polite">
            <strong>{purchaseAvailability === 'available'
              ? tr('Disponibilité confirmée par la source', 'المصدر أكّد التوفّر')
              : purchaseAvailability === 'unavailable'
                ? tr('Épuisé', 'نفدت الكمية')
                : tr('Disponibilité à confirmer', 'التوفّر قيد التأكيد')}</strong>
            <small>{[product.availabilitySource ? `${tr('Source', 'المصدر')} : ${product.availabilitySource}` : '', checkedAt ? `${availabilityFresh ? tr('Vérifié', 'آخر تثبّت') : tr('Dernière vérification', 'آخر تثبّت')} : ${checkedAt}` : ''].filter(Boolean).join(' · ') || tr('Aucune date de vérification disponible', 'تاريخ التثبّت غير متوفر')}</small>
          </div>
          {product.sizes.length > 0 && <span className="s-select__label">{optionLabel}</span>}
          {product.sizes.length > 0 && (
            <button type="button" className="s-select" data-error={shake || undefined} onClick={() => setDrapeOpen(true)} aria-expanded={drapeOpen}>
              <span>{chosen ? `${optionLabel} : ${chosen.value}` : sizeWord}</span><EditorialIcon name="ChevronDown" size={20} />
            </button>
          )}
          {refusal && <p className="s-refusal" role="status">{refusal === 'unavailable' ? tr('Cette option est indisponible chez la source. Choisissez-en une autre.', 'الخيار هذا موش متوفّر عند المصدر. اختار غيره.') : tr('La source ne confirme pas le stock de cette option : la commande est bloquée.', 'المصدر ما أكّدش توفّر الخيار هذا: الطلب متوقّف.')}</p>}
          {selectionNotice && <p className="s-refusal" data-variant-selection-notice role={selectionNotice.alert ? 'alert' : 'status'}>{selectionNotice.text}</p>}
          {orderError && <p className="s-refusal" role="alert">{orderError}</p>}
          <div className="s-qty" role="group" aria-label={tr('Quantité', 'الكمية')}>
            <button type="button" className="s-iconbtn" aria-label={tr('Diminuer la quantité', 'نقّص الكمية')} disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><EditorialIcon name="Minus" size={18} /></button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" className="s-iconbtn" aria-label={tr('Augmenter la quantité', 'زيد الكمية')} onClick={() => setQuantity((value) => Math.min(99, value + 1))}><EditorialIcon name="Plus" size={18} /></button>
          </div>
          <button type="button" className="s-cta" data-done={added || undefined} onClick={add} disabled={adding || sizeMissing || colorMissing || availabilityBlocked || !canAdd || !actions?.onAddToBag}>
            {added ? <><EditorialIcon name="Check" size={18} />{duplicateUpdated ? tr('Déjà au panier · quantité mise à jour', 'موجود في السلة · تم تحديث الكمية') : tr('Ajouté au panier', 'تزاد للسلة')}</> : adding ? tr('Ajout…', 'جارٍ الإضافة…') : tr('Ajouter au panier', 'أضف إلى السلة')}
          </button>
          {duplicateUpdated && <p className="s-refusal" role="status">{tr('Aucune ligne en double n’a été créée.', 'لم تتم إضافة سطر مكرر إلى السلة.')}</p>}
          {onCalculateAnother && <button type="button" className="s-cta s-cta--ghost" onClick={onCalculateAnother}>{tr('Calculer un autre article', 'احسب منتجًا آخر')}</button>}
        </section>
      </main>

      {zoomed && media[slide] && (
        <div className="s-zoom" role="dialog" aria-modal="true" aria-label={tr('Photo agrandie', 'الصورة مكبّرة')}>
          <button type="button" className="s-zoom__close s-iconbtn" onClick={() => setZoomed(false)} aria-label={tr('Fermer', 'إغلاق')}><EditorialIcon name="Close" /></button>
          <img src={media[slide].src} alt={media[slide].alt} />
        </div>
      )}
      <SizeDrape open={drapeOpen} sizes={currentSizes} title={sizeListTitle} selected={chosen?.value ?? null} scaleLabel={product.sizeScaleLabel} tr={tr} onClose={() => setDrapeOpen(false)} onSelect={pickSize} />
    </div>
  );
};
