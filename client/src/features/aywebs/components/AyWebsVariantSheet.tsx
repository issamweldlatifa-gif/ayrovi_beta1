import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShoppingBag, X } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  addAyWebsCartItem, createAyWebsPurchaseRequest, getAyWebsVariants, resolveAyWebsProduct, trackAyWebsEvent,
  type AyWebsCartItemPayload, type AyWebsProductPayload, type AyWebsPurchaseRequestPayload, type AyWebsVariantPriceOption,
} from '../api';

/**
 * AYWEBs — feuille de variantes PAR-DESSUS l'expérience marchand
 * (référence Add-to-Buyee, captures 1 à 4) puis confirmation d'ajout.
 *
 * Contrat permanent (AYWEBS_ADD_TO_CART_ORDER.md) :
 *  • tout vient du serveur (resolve + variants) : groupes libres, prix, dispo ;
 *  • seules les options RÉELLEMENT publiées par le marchand sont affichées ;
 *  • aucun état « New » imposé : l'état du produit n'apparaît que si la source
 *    le publie (JSON-LD `itemCondition`), et il n'est JAMAIS un critère de
 *    correspondance de variante (régression du 03/10/2026 corrigée) ;
 *  • après ajout : confirmation avec la ligne réellement enregistrée, puis deux
 *    sorties — Proceed to Checkout (panier AYROVI) ou Return to Shopping.
 *
 * Cartes de variantes (04/10/2026, captures marchand 1-2) : quand le marchand
 * publie une image ou un prix propre à chaque valeur d'un attribut (couleur…),
 * les valeurs s'affichent en CARTES façon fiche Amazon — image, nom, prix,
 * disponibilité, bordure de sélection — au lieu d'un menu déroulant anonyme.
 */
export interface AyWebsVariantSheetProps {
  url: string;
  storeId?: string | null;
  onClose: () => void;
  onCheckout: () => void;
}

type Phase = 'loading' | 'ready' | 'added' | 'error';

interface VariantCard {
  value: string;
  image: string | null;
  price: number | null;
  currency: string | null;
  availability: string;
}

export const AyWebsVariantSheet: React.FC<AyWebsVariantSheetProps> = ({ url, storeId, onClose, onCheckout }) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [product, setProduct] = useState<AyWebsProductPayload | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [purchaseSupportAvailable, setPurchaseSupportAvailable] = useState(false);
  const [purchaseSupportOpen, setPurchaseSupportOpen] = useState(false);
  const [supportProductName, setSupportProductName] = useState('');
  const [supportRequirements, setSupportRequirements] = useState('');
  const [supportQuantity, setSupportQuantity] = useState(1);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportRequest, setSupportRequest] = useState<AyWebsPurchaseRequestPayload | null>(null);
  const [added, setAdded] = useState<AyWebsCartItemPayload | null>(null);
  const [linked, setLinked] = useState<{ linked: boolean; reason: string } | null>(null);
  const [sourceVariants, setSourceVariants] = useState<AyWebsVariantPriceOption[]>([]);
  const [cardsByAttribute, setCardsByAttribute] = useState<Record<string, VariantCard[]>>({});
  const pendingAddRequestId = useRef('');

  const createAddRequestId = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const selectAttribute = (attribute: string, value: string) => {
    // A changed payload is a new Add intention, not a retry of the old one.
    pendingAddRequestId.current = '';
    setSelected((current) => ({ ...current, [attribute]: value }));
  };

  useEffect(() => {
    const controller = new AbortController();
    pendingAddRequestId.current = '';
    setPurchaseSupportAvailable(false);
    setPurchaseSupportOpen(false);
    setSupportRequest(null);
    setSupportProductName('');
    setSupportRequirements('');
    setSupportQuantity(1);
    setProduct(null);
    setSelected({});
    setSourceVariants([]);
    setCardsByAttribute({});
    setError('');
    setPhase('loading');
    resolveAyWebsProduct({ url, ...(storeId ? { store: storeId } : {}) }, controller.signal)
      .then(async (payload) => {
        const resolved = payload.product ?? payload;
        setProduct(resolved);
        setSourceVariants(resolved.variant_details || []);
        setPhase('ready');
        // Cartes marchand (image / prix / dispo par valeur) — meilleur effort :
        // un échec de l'appel variantes laisse les menus déroulants (Buyee).
        try {
          const variants = await getAyWebsVariants({ product_id: resolved.product_id }, controller.signal);
          setSourceVariants(variants.variants || []);
          const cards: Record<string, VariantCard[]> = {};
          for (const group of resolved.variant_groups || []) {
            if (group.values.length < 2) continue;
            const perValue = group.values.map((value) => {
              const match = (variants.variants || []).find(
                (variant) => String(variant.attributes?.[group.attribute] || '') === value,
              );
              return {
                value,
                image: match?.image || null,
                price: match?.price ?? null,
                currency: match?.currency || null,
                availability: String(match?.availability || ''),
              };
            });
            // Une valeur sur deux au moins porte une image ou un prix propre :
            // l'attribut mérite des cartes (couleur Amazon), sinon un select.
            const rich = perValue.filter((card) => card.image || card.price != null).length;
            if (rich >= 2) cards[group.attribute] = perValue;
          }
          setCardsByAttribute(cards);
        } catch {
          setCardsByAttribute({});
        }
      })
      .catch((caught) => {
        const fallback = Array.isArray(caught?.fallback) ? caught.fallback.map(String) : [];
        setPurchaseSupportAvailable(fallback.includes('purchase_request') || fallback.includes('store_request'));
        setError(String(caught?.message || caught));
        setPhase('error');
      });
    return () => controller.abort();
  }, [url, storeId]);

  const groups = useMemo(() => product?.variant_groups || [], [product]);
  const quantities = useMemo(() => Array.from({ length: 10 }, (_, index) => index + 1), []);

  /**
   * Un groupe à valeur unique est une donnée, pas un choix : il est présélectionné
   * (le serveur exige la sélection complète des attributs publiés). Un groupe à
   * plusieurs valeurs reste à choisir par le client — jamais deviné.
   */
  useEffect(() => {
    if (!groups.length) return;
    setSelected((current) => {
      const next = { ...current };
      for (const group of groups) {
        if (group.values.length === 1 && !next[group.attribute]) next[group.attribute] = group.values[0];
      }
      return next;
    });
  }, [groups]);

  const requiredGroups = useMemo(() => groups.filter((group) => group.values.length > 0), [groups]);
  const missingRequired = useMemo(
    () => requiredGroups.some((group) => !selected[group.attribute]),
    [requiredGroups, selected],
  );
  const selectionComplete = requiredGroups.length === 0 || !missingRequired;
  const selectedSourceVariant = useMemo(() => {
    if (!requiredGroups.length || !selectionComplete) return null;
    return sourceVariants.find((variant) => (
      Object.keys(variant.attributes || {}).length === requiredGroups.length
      && requiredGroups.every((group) => String(variant.attributes?.[group.attribute] || '') === selected[group.attribute])
    )) || null;
  }, [requiredGroups, selectionComplete, selected, sourceVariants]);
  const selectedVariantUnknown = selectionComplete && requiredGroups.length > 0 && !selectedSourceVariant;
  const selectedVariantUnavailable = selectedSourceVariant?.availability === 'OUT_OF_STOCK';
  const displayedPrice = selectedSourceVariant?.quoted_price ?? product?.price ?? 0;
  const displayedCurrency = selectedSourceVariant?.quoted_currency || product?.currency || '';
  const displayedPricingTnd = selectedSourceVariant
    ? selectedSourceVariant.ayrovi_pricing?.total_tnd ?? null
    : product?.ayrovi_pricing?.total_tnd ?? null;
  const displayedAvailability = selectedSourceVariant?.availability || product?.availability?.state;

  /** Disponibilité : UNKNOWN est visible comme incertitude, jamais comme disponible. */
  const availabilityLabel = (state: string | undefined, short = false): string => {
    if (state === 'AVAILABLE') return short ? tr('In Stock', 'متوفر') : tr('In stock at the merchant', 'متوفّر عند التاجر');
    if (state === 'LOW_STOCK') return short ? tr('Low stock', 'كمية محدودة') : tr('Low stock at the merchant', 'الكمية محدودة عند التاجر');
    if (state === 'OUT_OF_STOCK') return short ? tr('Out of stock', 'غير متوفر') : tr('Out of stock at the merchant', 'غير متوفّر عند التاجر');
    if (state === 'UNKNOWN') return short ? tr('Stock not confirmed', 'المخزون غير مؤكد') : tr('The merchant has not confirmed stock for this configuration', 'لم يؤكد التاجر توفر هذه التهيئة');
    return '';
  };

  const conditionLabel = useMemo(() => {
    const condition = product?.condition;
    if (condition === 'new') return tr('Condition: New', 'الحالة: جديد');
    if (condition === 'used') return tr('Condition: Used', 'الحالة: مستعمل');
    if (condition === 'refurbished') return tr('Condition: Refurbished', 'الحالة: مُجدَّد');
    return '';
  }, [product, tr]);

  const submitPurchaseSupport = async () => {
    if ((!supportProductName.trim() && !supportRequirements.trim()) || supportSubmitting || supportRequest) return;
    setSupportSubmitting(true);
    setError('');
    try {
      const result = await createAyWebsPurchaseRequest({
        product_url: url,
        quantity: supportQuantity,
        product_name: supportProductName.trim(),
        requirements: supportRequirements.trim(),
      });
      setSupportRequest(result);
    } catch (caught: any) {
      setError(String(caught?.message || caught));
    } finally {
      setSupportSubmitting(false);
    }
  };

  const submit = async () => {
    if (!product || missingRequired || selectedVariantUnknown || selectedVariantUnavailable || adding) return;
    setAdding(true);
    setError('');
    try {
      const requestId = pendingAddRequestId.current || createAddRequestId();
      pendingAddRequestId.current = requestId;
      const result = await addAyWebsCartItem({
        product_id: product.product_id,
        source_url: product.source_url,
        store_id: product.store_id,
        // Uniquement les attributs publiés réellement choisis. La coque n'ajoute
        // plus `condition` : ce n'est pas un attribut de variante chez le marchand.
        variant_attributes: Object.keys(selected).length ? selected : null,
        quantity,
        request_id: requestId,
      });
      if (!result.idempotentReplay) trackAyWebsEvent('add_to_cart_succeeded', { store: product.store_id });
      pendingAddRequestId.current = '';
      setAdded(result.item ?? null);
      setLinked(result.ayrovi ? { linked: Boolean(result.ayrovi.linked), reason: String(result.ayrovi.reason || '') } : null);
      setPhase('added');
    } catch (caught: any) {
      // Aucun faux succès : on reste sur la feuille, le message vient du serveur.
      trackAyWebsEvent('capture_failed', { code: caught?.code || 'ADD_FAILED' });
      setError(String(caught?.message || caught));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="ayw-sheet-mask" role="dialog" aria-modal="true" aria-label={tr('Select your desired item', 'اختر منتجك')}>
      <div className="ayw-sheet">
        <button type="button" className="ayw-sheet-close" onClick={onClose} aria-label={tr('Close', 'إغلاق')}>
          <X size={20} aria-hidden="true" />
        </button>

        {phase === 'loading' && (
          <div className="ayw-sheet-body ayw-center">
            <Loader2 className="animate-spin" size={26} aria-hidden="true" />
            <p>{tr('Reading the merchant page…', 'نقرأ صفحة التاجر…')}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="ayw-sheet-body">
            <h2 className="ayw-sheet-title">{purchaseSupportAvailable
              ? tr('Purchase Support', 'دعم الشراء')
              : tr('Unable to read this product', 'تعذّرت قراءة هذا المنتج')}</h2>
            <p className="ayw-notice">{error || tr('Product unreadable on the merchant page.', 'تعذّرت قراءة المنتج من صفحة التاجر.')}</p>
            {purchaseSupportAvailable && !purchaseSupportOpen && (
              <div className="ayw-support-panel">
                <p>{tr(
                  'This link cannot be added through product capture. Purchase Support sends it to the AYROVI team for review; it does not add an item to your cart or buy from the merchant.',
                  'لا يمكن إضافة هذا الرابط عبر التقاط المنتج. يرسل دعم الشراء الرابط إلى فريق AYROVI للمراجعة؛ ولا يضيفه إلى السلة أو يشتريه آلياً من التاجر.',
                )}</p>
                <button type="button" className="ayw-cta" onClick={() => setPurchaseSupportOpen(true)}>
                  {tr('Request Purchase Support', 'طلب دعم الشراء')}
                </button>
              </div>
            )}
            {purchaseSupportAvailable && purchaseSupportOpen && !supportRequest && (
              <form
                className="ayw-support-form"
                onSubmit={(event) => { event.preventDefault(); void submitPurchaseSupport(); }}
              >
                <p>{tr('Tell us what you want the team to review. No purchase is made automatically.', 'أخبرنا بما تريد من الفريق مراجعته. لا يتم الشراء تلقائياً.')}</p>
                <label className="ayw-support-field">
                  <span>{tr('Product name (optional)', 'اسم المنتج (اختياري)')}</span>
                  <input value={supportProductName} onChange={(event) => setSupportProductName(event.target.value)} maxLength={300} />
                </label>
                <label className="ayw-support-field">
                  <span>{tr('Variant or requirements', 'النسخة أو المتطلبات')}</span>
                  <textarea value={supportRequirements} onChange={(event) => setSupportRequirements(event.target.value)} maxLength={1000} rows={3} />
                </label>
                <label className="ayw-support-field">
                  <span>{tr('Quantity', 'الكمية')}</span>
                  <select value={supportQuantity} onChange={(event) => setSupportQuantity(Number(event.target.value))}>
                    {quantities.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                {error && <p className="ayw-notice">{error}</p>}
                <button type="submit" className="ayw-cta" disabled={supportSubmitting || (!supportProductName.trim() && !supportRequirements.trim())}>
                  {supportSubmitting ? tr('Sending…', 'جارٍ الإرسال…') : tr('Send for review', 'إرسال للمراجعة')}
                </button>
              </form>
            )}
            {supportRequest && (
              <div className="ayw-support-panel" role="status">
                <p><strong>{tr('Request sent for human review', 'تم إرسال الطلب للمراجعة البشرية')}</strong></p>
                <p>{tr('Reference', 'المرجع')}: {supportRequest.request_number}</p>
                <p>{tr('Status', 'الحالة')}: {supportRequest.status}</p>
                <p>{tr('This request is separate from the AYROVI cart and is not an automated merchant purchase.', 'هذا الطلب منفصل عن سلة AYROVI ولا يمثل شراءً آلياً من التاجر.')}</p>
              </div>
            )}
          </div>
        )}

        {phase === 'ready' && product && (
          <div className="ayw-sheet-body">
            <h2 className="ayw-sheet-title">{tr('Select your desired item', 'اختر منتجك')}</h2>
            <div className="ayw-sheet-product">
              {product.images[0] && <img className="ayw-sheet-thumb" src={product.images[0]} alt="" />}
              <span className="ayw-sheet-name">{product.title}</span>
            </div>

            {conditionLabel && <p className="ayw-added-meta">{conditionLabel}</p>}
            {availabilityLabel(displayedAvailability) && (
              <p className="ayw-added-meta">{availabilityLabel(displayedAvailability)}</p>
            )}
            {selectedVariantUnknown && (
              <p className="ayw-notice">{tr('This exact option combination was not verified by the merchant.', 'لم يتحقق التاجر من هذه التهيئة المحددة.')}</p>
            )}

            {groups.map((group) => {
              if (group.values.length === 1) {
                return (
                  <p className="ayw-added-meta" key={group.attribute}>
                    {group.attribute} : <strong>{group.values[0]}</strong>
                  </p>
                );
              }
              const cards = cardsByAttribute[group.attribute];
              if (cards?.length) {
                // Cartes marchand façon fiche Amazon (captures 1-2) : image,
                // nom de la valeur, prix, disponibilité, bordure de sélection.
                return (
                  <div className="ayw-cardgroup" key={group.attribute} role="radiogroup" aria-label={group.attribute}>
                    <span className="ayw-cardgroup-label">{group.attribute}</span>
                    <div className="ayw-cardrow">
                      {cards.map((card) => {
                        const isOn = selected[group.attribute] === card.value;
                        return (
                          <button
                            type="button"
                            key={card.value}
                            role="radio"
                            aria-checked={isOn}
                            className={`ayw-variantcard${isOn ? ' is-on' : ''}`}
                            onClick={() => selectAttribute(group.attribute, card.value)}
                          >
                            <img className="ayw-variantcard-img" src={card.image || product.images[0] || ''} alt="" loading="lazy" />
                            <span className="ayw-variantcard-name">{card.value}</span>
                            {card.price != null && card.price > 0 && (
                              <span className="ayw-variantcard-price">
                                {card.price.toLocaleString()} {String(card.currency || product.currency || '').trim()}
                              </span>
                            )}
                            {availabilityLabel(card.availability, true) && (
                              <span className="ayw-variantcard-stock">{availabilityLabel(card.availability, true)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <label className="ayw-selectwrap" key={group.attribute}>
                  <span className="ayw-sr">{group.attribute}</span>
                  <select
                    className="ayw-select"
                    value={selected[group.attribute] || ''}
                    onChange={(event) => selectAttribute(group.attribute, event.target.value)}
                  >
                    <option value="" disabled>{group.attribute}</option>
                    {group.values.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              );
            })}

            <label className="ayw-selectwrap">
              <span className="ayw-sr">{tr('Quantity', 'الكمية')}</span>
              <select
                className="ayw-select"
                value={quantity}
                onChange={(event) => {
                  pendingAddRequestId.current = '';
                  setQuantity(Number(event.target.value));
                }}
              >
                {quantities.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            {displayedPrice > 0 && !selectedVariantUnknown && (
              <p className="ayw-price">
                {displayedPrice.toLocaleString()} {displayedCurrency}
                {displayedPricingTnd != null && (
                  <span className="ayw-price-tnd"> ≈ {displayedPricingTnd.toFixed(2)} {tr('DT', 'د.ت')}</span>
                )}
              </p>
            )}
            {selectedSourceVariant?.price_source === 'PRODUCT' && (
              <p className="ayw-added-meta">
                {tr('No separate merchant price was published for this option; the product price is used.', 'لم ينشر التاجر سعراً منفصلاً لهذا الخيار؛ يُستخدم سعر المنتج.')}
              </p>
            )}
            {displayedPricingTnd == null && !missingRequired && !selectedVariantUnknown && (
              <p className="ayw-notice">{tr('An AYROVI quote is not available for this source price.', 'لا يتوفر تقدير AYROVI لهذا السعر المصدر.')}</p>
            )}

            <button
              type="button"
              className="ayw-cta"
              disabled={missingRequired || selectedVariantUnknown || selectedVariantUnavailable || displayedPrice <= 0 || displayedPricingTnd == null || adding}
              onClick={() => void submit()}
            >
              {adding ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : tr('Add to Cart', 'أضف إلى السلة')}
            </button>
            {error && <p className="ayw-notice">{error}</p>}
          </div>
        )}

        {phase === 'added' && (
          <div className="ayw-sheet-body ayw-added">
            <div className="ayw-added-icon">
              <ShoppingBag size={44} aria-hidden="true" />
              <CheckCircle2 size={22} aria-hidden="true" />
            </div>
            <h2 className="ayw-sheet-title">{tr('Item added to AYROVI cart', 'تمت الإضافة إلى سلة AYROVI')}</h2>
            <div className="ayw-added-sum">
              {(added?.images[0] || product?.images[0]) && (
                <img className="ayw-added-thumb" src={added?.images[0] || product?.images[0]} alt="" />
              )}
              <div>
                <p className="ayw-added-title">{added?.title || product?.title}</p>
                {added?.variant_label && <p className="ayw-added-meta">{added.variant_label}</p>}
                {added?.quantity ? (
                  <p className="ayw-added-meta">
                    {tr('Quantity', 'الكمية')} : <strong>{added.quantity}</strong>
                    {added.unit_price > 0 ? ` · ${added.unit_price.toLocaleString()} ${added.currency}` : ''}
                  </p>
                ) : null}
                {added?.line_total_tnd ? (
                  <p className="ayw-added-meta">
                    {added.line_total_tnd.toFixed(2)} {tr('DT', 'د.ت')} · {tr('before local delivery', 'قبل التوصيل المحلي')}
                  </p>
                ) : null}
                {linked && !linked.linked && (
                  <p className="ayw-added-meta">
                    {tr('Kept in the AyWebs cart — the AYROVI cart step will confirm it.', 'محفوظ في سلة AyWebs — ستُؤكَّد الإضافة عند خطوة سلة AYROVI.')}
                  </p>
                )}
              </div>
            </div>
            <button type="button" className="ayw-cta" onClick={onCheckout}>
              {tr('Proceed to Checkout', 'متابعة الدفع')}
            </button>
            <button type="button" className="ayw-cta-outline" onClick={onClose}>
              {tr('Return to Shopping', 'مواصلة التسوق')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
