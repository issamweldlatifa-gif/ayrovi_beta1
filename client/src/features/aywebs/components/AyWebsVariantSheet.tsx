import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShoppingBag, X } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  addAyWebsCartItem, resolveAyWebsProduct, trackAyWebsEvent,
  type AyWebsCartItemPayload, type AyWebsProductPayload,
} from '../api';

/**
 * AYWEBs — feuille de variantes PAR-DESSUS l'expérience marchand
 * (référence Add-to-Buyee, captures 3 et 4) puis confirmation d'ajout.
 *
 * Contrat permanent (AYWEBS_ADD_TO_CART_ORDER.md) :
 *  • tout vient du serveur (resolve) : groupes de variantes libres, prix, dispo ;
 *  • variantes requises non choisies → ajout impossible ;
 *  • après ajout : confirmation « Item added to AYROVI cart » avec deux sorties
 *    (Proceed to Checkout / Return to Shopping), sans quitter le contexte.
 */
export interface AyWebsVariantSheetProps {
  url: string;
  storeId?: string | null;
  onClose: () => void;
  onCheckout: () => void;
}

type Phase = 'loading' | 'ready' | 'added' | 'error';

export const AyWebsVariantSheet: React.FC<AyWebsVariantSheetProps> = ({ url, storeId, onClose, onCheckout }) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [product, setProduct] = useState<AyWebsProductPayload | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [condition, setCondition] = useState('new');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<AyWebsCartItemPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPhase('loading');
    resolveAyWebsProduct({ url, ...(storeId ? { store: storeId } : {}) }, controller.signal)
      .then((payload) => {
        setProduct(payload.product ?? payload);
        setPhase('ready');
      })
      .catch((caught) => {
        setError(String(caught?.message || caught));
        setPhase('error');
      });
    return () => controller.abort();
  }, [url, storeId]);

  const groups = useMemo(() => product?.variant_groups || [], [product]);
  const quantities = useMemo(() => Array.from({ length: 10 }, (_, index) => index + 1), []);

  const missingRequired = useMemo(
    () => groups.some((group) => group.values.length > 1 && !selected[group.attribute]),
    [groups, selected],
  );

  const submit = async () => {
    if (!product || missingRequired || adding) return;
    setAdding(true);
    setError('');
    try {
      const result = await addAyWebsCartItem({
        product_id: product.product_id,
        source_url: product.source_url,
        store_id: product.store_id,
        variant_attributes: { ...selected, condition },
        quantity,
      });
      trackAyWebsEvent('add_to_cart_succeeded', { store: product.store_id });
      setAdded(result.item ?? null);
      setPhase('added');
    } catch (caught: any) {
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
          <div className="ayw-sheet-body ayw-center">
            <p className="ayw-notice">{error || tr('Product unreadable on the merchant page.', 'تعذّرت قراءة المنتج من صفحة التاجر.')}</p>
          </div>
        )}

        {phase === 'ready' && product && (
          <div className="ayw-sheet-body">
            <h2 className="ayw-sheet-title">{tr('Select your desired item', 'اختر منتجك')}</h2>
            <div className="ayw-sheet-product">
              {product.images[0] && <img className="ayw-sheet-thumb" src={product.images[0]} alt="" />}
              <span className="ayw-sheet-name">{product.title}</span>
            </div>

            <fieldset className="ayw-cond">
              <legend className="ayw-sr">{tr('Item condition', 'حالة المنتج')}</legend>
              <label className="ayw-radio">
                <input type="radio" name="ayw-cond" checked={condition === 'new'} onChange={() => setCondition('new')} />
                <span className="ayw-radio-dot" aria-hidden="true" />
                {tr('New', 'جديد')}
              </label>
            </fieldset>

            {groups.map((group) => (
              <label className="ayw-selectwrap" key={group.attribute}>
                <span className="ayw-sr">{group.attribute}</span>
                <select
                  className="ayw-select"
                  value={selected[group.attribute] || ''}
                  onChange={(event) => setSelected((current) => ({ ...current, [group.attribute]: event.target.value }))}
                >
                  <option value="" disabled>{group.attribute}</option>
                  {group.values.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}

            <label className="ayw-selectwrap">
              <span className="ayw-sr">{tr('Quantity', 'الكمية')}</span>
              <select className="ayw-select" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                {quantities.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            {product.price > 0 && (
              <p className="ayw-price">
                {product.price.toLocaleString()} {product.currency}
                {product.ayrovi_pricing && (
                  <span className="ayw-price-tnd"> ≈ {product.ayrovi_pricing.total_tnd.toFixed(2)} {tr('DT', 'د.ت')}</span>
                )}
              </p>
            )}

            <button type="button" className="ayw-cta" disabled={missingRequired || adding} onClick={() => void submit()}>
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
