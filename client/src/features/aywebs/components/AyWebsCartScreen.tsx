import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  bridgeAyWebsCartToAyrovi, getAyWebsCart, removeAyWebsCartItem, trackAyWebsEvent,
  updateAyWebsCartItem, type AyWebsCartPayload,
} from '../api';
import { AyWebsTabBar, type AyWebsTab } from './AyWebsTabBar';

/**
 * AYWEBs — panier proxy (référence Add-to-Buyee, captures 5 et 6).
 *
 * Une ligne par élément : image, titre, prix source, variante/format, état,
 * quantité modifiable (serveur), sous-total, suppression. Bloc total :
 * « Total item amount (N Item(s)) » + total TND calculé SERVEUR uniquement.
 * « Proceed to order page » = pont §2 vers le panier/checkout AYROVI existant
 * (une seule voie de paiement, jamais un second checkout).
 */
export interface AyWebsCartScreenProps {
  tab: AyWebsTab;
  onTab: (tab: AyWebsTab) => void;
  onOpenAyroviCheckout: () => void;
  onCartChanged?: (count: number) => void;
}

export const AyWebsCartScreen: React.FC<AyWebsCartScreenProps> = ({ tab, onTab, onOpenAyroviCheckout, onCartChanged }) => {
  const { tr } = useLocale();
  const [cart, setCart] = useState<AyWebsCartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [bridging, setBridging] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getAyWebsCart();
      setCart(payload);
      onCartChanged?.(payload.totals?.units || 0);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [onCartChanged]);

  useEffect(() => { void load(); }, [load]);

  const changeQty = async (itemId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    const result = await updateAyWebsCartItem(itemId, { quantity });
    setCart(result.cart);
    onCartChanged?.(result.cart?.totals?.units || 0);
  };

  const remove = async (itemId: string) => {
    const next = await removeAyWebsCartItem(itemId);
    setCart(next);
    onCartChanged?.(next?.totals?.units || 0);
  };

  const proceed = async () => {
    if (bridging) return;
    setBridging(true);
    setNotice('');
    try {
      const result = await bridgeAyWebsCartToAyrovi();
      trackAyWebsEvent('capture_succeeded', { code: `bridge:${result.moved.length}` });
      onOpenAyroviCheckout();
    } catch (caught: any) {
      setNotice(String(caught?.message || caught));
    } finally {
      setBridging(false);
    }
  };

  const items = cart?.items || [];
  const units = cart?.totals?.units || items.length;

  return (
    <div className="ayw-screen" data-aywebs-screen="cart">
      <header className="ayw-head">
        <h1 className="ayw-title">{tr('Cart', 'السلة')}</h1>
      </header>

      {loading && (
        <div className="ayw-center"><Loader2 className="animate-spin" size={26} aria-hidden="true" /></div>
      )}

      {!loading && items.length === 0 && (
        <p className="ayw-notice ayw-pad">{tr('Your proxy cart is empty.', 'سلّة الوكالة فارغة.')}</p>
      )}

      {!loading && items.map((item) => (
        <article className="ayw-cartline" key={item.id}>
          {item.images[0] && <img className="ayw-cartline-img" src={item.images[0]} alt="" loading="lazy" />}
          <div className="ayw-cartline-body">
            <h3 className="ayw-cartline-title">{item.title}</h3>
            <dl className="ayw-cartline-meta">
              <div><dt>{tr('Price', 'السعر')}</dt><dd>{item.unit_price.toLocaleString()} {item.currency}</dd></div>
              {item.variant_label && <div><dt>{tr('Format', 'المواصفات')}</dt><dd>{item.variant_label}</dd></div>}
              <div><dt>{tr('Item Condition', 'حالة المنتج')}</dt><dd>{item.availability === 'in_stock' ? tr('New', 'جديد') : item.availability}</dd></div>
            </dl>
            <div className="ayw-cartline-row">
              <label className="ayw-qty">
                {tr('Desired Quantity', 'الكمية المطلوبة')}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={item.quantity}
                  onChange={(event) => void changeQty(item.id, Number(event.target.value))}
                />
              </label>
              <p className="ayw-subtotal">
                <span>{tr('Sub total', 'المجموع الفرعي')}</span>
                <strong>{(item.unit_price * item.quantity).toLocaleString()} {item.currency}</strong>
              </p>
              <button type="button" className="ayw-delete" onClick={() => void remove(item.id)} aria-label={tr('Delete', 'حذف')}>
                <Trash2 size={16} aria-hidden="true" /> {tr('Delete', 'حذف')}
              </button>
            </div>
            {item.status !== 'READY' && item.status_reason && (
              <p className="ayw-notice">{item.status_reason}</p>
            )}
          </div>
        </article>
      ))}

      {!loading && items.length > 0 && (
        <section className="ayw-carttotal">
          <p className="ayw-carttotal-label">
            {tr('Total item amount', 'إجمالي قيمة المنتجات')}
            <span>{'(' + units + ' ' + tr('Item(s)', 'منتج') + ')'}</span>
          </p>
          <p className="ayw-carttotal-value">
            {Number(cart?.totals?.product_subtotal_tnd || 0).toFixed(2)} <span>{tr('DT', 'د.ت')}</span>
          </p>
          <button type="button" className="ayw-cta" disabled={bridging} onClick={() => void proceed()}>
            {bridging ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : tr('Proceed to order page', 'المتابعة إلى صفحة الطلب')}
          </button>
          <p className="ayw-carttotal-note">
            {tr(
              'To place an order, your AYROVI account and login are required.',
              'لإتمام الطلب يلزم حساب AYROVI وتسجيل الدخول.',
            )}
          </p>
          {notice && <p className="ayw-notice">{notice}</p>}
        </section>
      )}

      <AyWebsTabBar tab={tab} onTab={onTab} cartCount={units} />
    </div>
  );
};
