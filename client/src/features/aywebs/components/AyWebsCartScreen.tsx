import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import { openMerchantPage } from '../../../services/nativeShell';
import {
  bridgeAyWebsCartToAyrovi, getAyWebsCart, removeAyWebsCartItem, trackAyWebsEvent,
  updateAyWebsCartItem, type AyWebsCartItemPayload, type AyWebsCartPayload,
} from '../api';
import { AyWebsTabBar, type AyWebsTab } from './AyWebsTabBar';

/**
 * AYWEBs — panier proxy UNIQUE (référence Add-to-Buyee, captures 5 à 7).
 *
 * Une seule lecture possible : les lignes sont GROUPÉES PAR BOUTIQUE comme sur
 * la page panier Buyee (en-tête « Amazon », lignes article, sous-total), et le
 * bloc total affiche LE montant AYROVI en dinars, recalculé par le moteur
 * tarifaire côté serveur — c'est ce montant qui fait foi au checkout (§2 :
 * une seule voie de paiement, jamais un second checkout).
 *
 * « Proceed to order page » = pont §2 vers le panier/checkout AYROVI existant :
 * les lignes AYWEBs y sont synchronisées (idempotent), le client paie UNE seule
 * commande mixte — les deux paniers ne font qu'un au moment du paiement.
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
      onCartChanged?.(Number(payload.totals?.unlinked_units ?? 0));
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
    onCartChanged?.(Number(result.cart?.totals?.unlinked_units ?? 0));
  };

  const remove = async (itemId: string) => {
    const next = await removeAyWebsCartItem(itemId);
    setCart(next);
    onCartChanged?.(Number(next?.totals?.unlinked_units ?? 0));
  };

  const proceed = async () => {
    if (bridging) return;
    setBridging(true);
    setNotice('');
    try {
      const result = await bridgeAyWebsCartToAyrovi();
      // Le pont est une SYNCHRONISATION (idempotente) : ni doublon, ni perte.
      const synced = result.moved.filter((line) => line.synced).length;
      trackAyWebsEvent('capture_succeeded', { code: `bridge:${result.moved.length}:synced:${synced}` });
      onOpenAyroviCheckout();
    } catch (caught: any) {
      setNotice(String(caught?.message || caught));
      // A source recheck can block the handoff and update availability/status.
      await load();
    } finally {
      setBridging(false);
    }
  };

  const availabilityText = (state: string): string => {
    if (state === 'AVAILABLE') return tr('In stock', 'متوفر');
    if (state === 'LOW_STOCK') return tr('Low stock', 'كمية محدودة');
    if (state === 'OUT_OF_STOCK') return tr('Out of stock', 'غير متوفر');
    return tr('Not confirmed by the store', 'غير مؤكد من المتجر');
  };

  const renderItem = (item: AyWebsCartItemPayload) => (
    <article className="ayw-cartline" key={item.id}>
      {item.images[0] && <img className="ayw-cartline-img" src={item.images[0]} alt="" loading="lazy" />}
      <div className="ayw-cartline-body">
        <h3 className="ayw-cartline-title">{item.title}</h3>
        <dl className="ayw-cartline-meta">
          {/* Boutique + lien source : la traçabilité demandée, sans quitter le parcours. */}
          <div>
            <dt>{tr('Store', 'المتجر')}</dt>
            <dd>{item.store_name}{' '}
              <button
                type="button"
                className="ayw-source-link"
                onClick={() => openMerchantPage(item.source_url)}
              >
                {tr('View on the store', 'عرض عند المتجر')}
              </button>
            </dd>
          </div>
          <div><dt>{tr('Price', 'السعر')}</dt><dd>{item.unit_price.toLocaleString()} {item.currency}</dd></div>
          {item.variant_label && <div><dt>{tr('Options', 'الخيارات')}</dt><dd>{item.variant_label}</dd></div>}
          {/* Panier unifié : la ligne synchronisée vit déjà dans le panier AYROVI. */}
          {item.linked_to_ayrovi && (
            <div>
              <dt>{tr('AYROVI cart', 'سلة AYROVI')}</dt>
              <dd>{tr('Already in your AYROVI cart', 'موجود بالفعل في سلة AYROVI')}</dd>
            </div>
          )}
          {/* UNKNOWN is visible, never silently omitted or treated as available. */}
          <div>
            <dt>{tr('Availability', 'التوفّر')}</dt>
            <dd>{availabilityText(item.availability)}</dd>
          </div>
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
            {/* Le montant AYROVI est TOUJOURS celui du serveur (jamais un calcul client). */}
            {item.line_total_tnd > 0 && (
              <em className="ayw-line-tnd">
              ≈ {item.line_total_tnd.toFixed(2)} {tr('DT', 'د.ت')} · {tr('before local delivery', 'قبل التوصيل المحلي')}
            </em>
            )}
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
  );

  const groups = cart?.groups?.length ? cart.groups : null;
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

      {/* Bandeau façon page panier Buyee (capture 6) : le compte exact, rien d'autre. */}
      {!loading && items.length > 0 && (
        <p className="ayw-cartbanner">
          {tr('There are {n} items in your cart.', 'يوجد {n} منتجات في سلتك.').replace('{n}', String(units))}
        </p>
      )}

      {!loading && items.length === 0 && (
        <p className="ayw-notice ayw-pad">{tr('Your proxy cart is empty.', 'سلّة الوكالة فارغة.')}</p>
      )}

      {!loading && groups && groups.map((group) => (
        <section className="ayw-cartgroup" key={group.store_id}>
          <h2 className="ayw-cartgroup-head">
            {group.store_name}
            {group.blocked_items > 0 && (
              <span> · {group.blocked_items} {tr('item(s) need attention', 'منتج يحتاج مراجعة')}</span>
            )}
          </h2>
          {group.items.map(renderItem)}
        </section>
      ))}

      {!loading && !groups && items.map(renderItem)}

      {!loading && items.length > 0 && (
        <section className="ayw-carttotal">
          <p className="ayw-carttotal-label">
            {tr('Estimated AYROVI amount before local delivery', 'تقدير AYROVI قبل التوصيل المحلي')}
            <span>{'(' + units + ' ' + tr('Item(s)', 'منتج') + ')'}</span>
          </p>
          {/* Le montant qui fait foi : dinars, moteur tarifaire AYROVI (serveur). */}
          <p className="ayw-carttotal-value">
            {Number(cart?.totals?.product_subtotal_tnd || 0).toFixed(2)} <span>{tr('DT', 'د.ت')}</span>
          </p>
          <p className="ayw-carttotal-note">
            {tr(
              'Estimate from the AYROVI pricing engine (customs, freight, service); local delivery is added once at checkout.',
              'تقدير من محرك تسعير AYROVI (الديوانة والشحن والخدمة)؛ تُضاف كلفة التوصيل المحلي مرة واحدة عند الدفع.',
            )}
          </p>
          {cart?.blockers?.length ? (
            <div className="ayw-notice" role="status">
              {cart.blockers.map((blocker) => <p key={`${blocker.itemId}:${blocker.code}`}>{blocker.message}</p>)}
            </div>
          ) : null}
          <button type="button" className="ayw-cta" disabled={bridging} onClick={() => void proceed()}>
            {bridging ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : tr('Verify and proceed', 'التحقق والمتابعة')}
          </button>
          {/* Rester dans le parcours : retour aux boutiques, sans quitter AYWEBs. */}
          <button type="button" className="ayw-cta-outline" onClick={() => onTab('stores')}>
            {tr('Continue shopping', 'مواصلة التسوق')}
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
