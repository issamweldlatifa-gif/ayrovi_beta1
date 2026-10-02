import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRightLeft, CheckCircle2, Loader2, Minus, Plus, RefreshCw,
  ShoppingBag, Trash2,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  AyWebsRequestError, acceptAyWebsCartPrice, bridgeAyWebsCartToAyrovi, getAyWebsCart,
  removeAyWebsCartItem, trackAyWebsShoppingEvent, updateAyWebsCartItem, verifyAyWebsCart,
  type AyWebsCartPayload, type AyWebsCartItemPayload,
} from '../api';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs Cart (§16, §17, §18, §29, §30) — panier AYROVI, pas le panier du marchand.
 *
 * Multi-boutiques : les lignes sont groupées par boutique, chacune avec son
 * snapshot de variante, son prix source, son devis AYROVI et son statut. Un prix
 * changé bloque la ligne et exige une décision explicite (accepter le nouveau
 * prix, ou retirer) : jamais d'achat silencieux au nouveau prix. Une variante
 * disparue bloque aussi, sans substitution automatique.
 *
 * Deux sorties honnêtes :
 *   • « Passer au paiement AYWEBs » → checkout AYWEBs (§19-§21) ;
 *   • « Transférer vers le panier AYROVI » → le pont (§2) qui convertit les
 *     lignes prêtes dans le panier AYROVI existant, sans rien détruire ici.
 */

export interface AyWebsCartScreenProps {
  onBack: () => void;
  onCheckout: () => void;
  onOpenAyroviCart: () => void;
  onOpenProduct: (url: string, storeId?: string | null) => void;
  onOpenOrders: () => void;
  onCartChanged?: (count: number) => void;
}

type Phase = 'loading' | 'ready' | 'error';

export const AyWebsCartScreen: React.FC<AyWebsCartScreenProps> = ({
  onBack, onCheckout, onOpenAyroviCart, onOpenProduct, onOpenOrders, onCartChanged,
}) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<unknown>(null);
  const [cart, setCart] = useState<AyWebsCartPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'warning' | 'danger'; text: string } | null>(null);

  const applyCart = useCallback((next: AyWebsCartPayload) => {
    setCart(next);
    if (onCartChanged) onCartChanged(next.items.length);
  }, [onCartChanged]);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      applyCart(await getAyWebsCart());
      setPhase('ready');
    } catch (caught) {
      setError(caught);
      setPhase('error');
    }
  }, [applyCart]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError
          ? caught.contract?.userMessage || caught.message
          : tr('L’action n’a pas abouti.', 'لم يكتمل الإجراء.'),
      });
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const changeQuantity = (item: AyWebsCartItemPayload, delta: number) =>
    run(`qty-${item.id}`, async () => {
      const quantity = Math.min(99, Math.max(0, item.quantity + delta));
      const result = await updateAyWebsCartItem(item.id, { quantity });
      applyCart(result.cart);
    });

  const remove = (item: AyWebsCartItemPayload) =>
    run(`remove-${item.id}`, async () => {
      applyCart(await removeAyWebsCartItem(item.id));
    });

  const acceptPrice = (item: AyWebsCartItemPayload) =>
    run(`accept-${item.id}`, async () => {
      const result = await acceptAyWebsCartPrice(item.id);
      applyCart(result.cart);
      setNotice({ tone: 'success', text: tr('Nouveau prix accepté : la ligne est de nouveau commandable.', 'تم قبول السعر الجديد: أصبح السطر قابلاً للطلب.') });
    });

  const verify = async (recheckSource: boolean) => {
    setVerifying(true);
    setNotice(null);
    try {
      const result = await verifyAyWebsCart(recheckSource);
      applyCart(result.cart);
      if (!result.changes.length) {
        setNotice({ tone: 'success', text: tr('Panier vérifié : rien n’a changé chez les marchands.', 'تم التحقق من السلة: لا تغييرات لدى المتاجر.') });
      } else {
        setNotice({
          tone: 'warning',
          text: result.changes.map((change) => change.message).join(' · '),
        });
      }
    } catch (caught) {
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError ? caught.contract?.userMessage || caught.message : tr('Vérification impossible pour le moment.', 'لا يمكن التحقق حاليًا.'),
      });
    } finally {
      setVerifying(false);
    }
  };

  const bridge = async () => {
    setBridging(true);
    setNotice(null);
    try {
      const result = await bridgeAyWebsCartToAyrovi();
      setNotice({
        tone: result.skipped.length ? 'warning' : 'success',
        text: `${result.message}${result.skipped.length ? ` ${result.skipped.map((line) => line.message).join(' · ')}` : ''}`,
      });
      await load();
      onOpenAyroviCart();
    } catch (caught) {
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError ? caught.contract?.userMessage || caught.message : tr('Transfert impossible.', 'لا يمكن التحويل.'),
      });
    } finally {
      setBridging(false);
    }
  };

  if (phase === 'loading') return <AyWebsLoading label={tr('Lecture de votre panier AyWebs…', 'جارٍ قراءة سلة AyWebs…')} />;
  if (phase === 'error' && !cart) {
    return <AyWebsErrorState error={error} onRetry={() => void load()} actions={(
      <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
        {tr('Retour', 'رجوع')}
      </button>
    )} />;
  }

  const items = cart?.items || [];
  const groups = cart?.groups || [];
  const totals = cart?.totals;
  const blockers = cart?.blockers || [];

  if (!items.length) {
    return (
      <div className="grid gap-3">
        <div className="rounded-card border border-line bg-white p-8 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted" />
          <h1 className="mt-4 font-display text-xl font-black text-ink">{tr('Votre panier AyWebs est vide', 'سلة AyWebs فارغة')}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-muted">
            {tr(
              'Ouvrez une boutique, collez le lien exact d’un produit : AyWebs lit le prix, les versions et le stock, puis ajoute la ligne ici — dans un panier qui appartient à AYROVI, pas au marchand.',
              'افتح متجرًا والصق رابط المنتج الدقيق: يقرأ AyWebs السعر والنسخ والمخزون، ثم يضيف السطر هنا — في سلة تابعة لـ AYROVI وليست للمتجر.',
            )}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onBack} className="ay-btn-cta flex min-h-11 items-center justify-center gap-2 px-5 text-xs font-black">
              <ShoppingBag className="h-4 w-4" />
              {tr('Parcourir les boutiques', 'تصفّح المتاجر')}
            </button>
            <button type="button" onClick={onOpenOrders} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
              {tr('Mes achats AyWebs', 'مشترياتي في AyWebs')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">{tr('Panier AyWebs', 'سلة AyWebs')}</h1>
          <p className="mt-1 text-xs font-semibold text-muted">
            {tr(`${items.length} ligne(s) · ${totals?.units ?? 0} article(s)`, `${items.length} سطر · ${totals?.units ?? 0} منتج`)}
            {groups.length > 1 ? ` · ${tr(`${groups.length} boutiques`, `${groups.length} متاجر`)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void verify(false)} disabled={verifying} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black disabled:opacity-50">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {tr('Vérifier le panier', 'تحقق من السلة')}
          </button>
          <button type="button" onClick={() => void verify(true)} disabled={verifying} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black disabled:opacity-50">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {tr('Relire chez les marchands', 'إعادة القراءة من المتاجر')}
          </button>
        </div>
      </div>

      {notice && <AyWebsNotice tone={notice.tone}>{notice.text}</AyWebsNotice>}

      {blockers.length > 0 && (
        <AyWebsNotice tone="danger">
          {tr('Certaines lignes doivent être tranchées avant le paiement : ', 'بعض الأسطر تحتاج قرارًا قبل الدفع: ')}
          {blockers.map((blocker) => blocker.message).join(' · ')}
        </AyWebsNotice>
      )}

      {/* ---- Lignes groupées par boutique ---- */}
      <div className="grid gap-4">
        {groups.map((group) => (
          <section key={group.store_id} className="overflow-hidden rounded-card border border-line bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black text-ink">{group.store_name}</h2>
                <p className="truncate text-micro font-bold uppercase tracking-[0.12em] text-muted">
                  {group.integration_type.replace(/_/g, ' ')}
                  {group.blocked_items > 0 ? ` · ${tr(`${group.blocked_items} bloquée(s)`, `${group.blocked_items} محجوبة`)}` : ''}
                </p>
              </div>
              <strong className="text-sm font-black text-ink">{group.subtotal_tnd.toFixed(2)} TND</strong>
            </header>

            <ul className="divide-y divide-line">
              {group.items.map((item) => (
                <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  {item.images[0]
                    ? <img src={item.images[0]} alt="" className="h-20 w-20 shrink-0 rounded-control border border-line object-cover" loading="lazy" />
                    : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-control border border-line bg-surface text-muted"><ShoppingBag className="h-6 w-6" /></span>}

                  <div className="min-w-0">
                    <button type="button" onClick={() => onOpenProduct(item.source_url, item.store_id)} className="text-start">
                      <strong className="block truncate text-sm font-black text-ink hover:underline">{item.title}</strong>
                    </button>
                    <p className="mt-1 truncate text-xs font-semibold text-muted">
                      {item.variant_label || tr('Version par défaut', 'النسخة الافتراضية')} · <bdi className="ay-number">{item.item_number}</bdi>
                    </p>
                    <p className="mt-1 text-xs font-bold text-ink">
                      {item.unit_price.toFixed(2)} {item.currency}
                      <span className="ms-2 font-semibold text-muted">≈ {item.line_total_tnd.toFixed(2)} TND</span>
                    </p>
                    <ItemStatus item={item} tr={tr} />
                    {item.customer_note && (
                      <p className="mt-1 truncate text-micro font-semibold text-muted">{tr('Note', 'ملاحظة')} : {item.customer_note}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void changeQuantity(item, -1)} disabled={busy === `qty-${item.id}`} className="grid h-9 w-9 place-items-center rounded-control border border-line bg-white text-ink transition disabled:opacity-40" aria-label={tr('Diminuer', 'إنقاص')}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <strong className="min-w-8 text-center text-sm font-black text-ink">{item.quantity}</strong>
                      <button type="button" onClick={() => void changeQuantity(item, 1)} disabled={busy === `qty-${item.id}`} className="grid h-9 w-9 place-items-center rounded-control border border-line bg-white text-ink transition disabled:opacity-40" aria-label={tr('Augmenter', 'زيادة')}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => void remove(item)} disabled={busy === `remove-${item.id}`} className="flex min-h-9 items-center gap-1 rounded-control px-2 text-micro font-black uppercase tracking-[0.1em] text-muted transition hover:text-danger disabled:opacity-40">
                      <Trash2 className="h-4 w-4" />
                      {tr('Retirer', 'حذف')}
                    </button>
                  </div>

                  {item.status === 'PRICE_CHANGED' && (
                    <div className="sm:col-span-3">
                      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-3 py-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-ink" />
                        <p className="min-w-0 flex-1 text-xs font-semibold text-ink">
                          {tr('Le marchand a changé son prix : ', 'غيّر المتجر السعر: ')}
                          {item.status_reason || tr('nouveau prix à accepter', 'سعر جديد يتطلب القبول')}
                        </p>
                        <button type="button" onClick={() => void acceptPrice(item)} disabled={busy === `accept-${item.id}`} className="ay-btn-primary flex min-h-9 items-center justify-center gap-2 px-3 text-micro font-black disabled:opacity-50">
                          {busy === `accept-${item.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          {tr('Accepter le nouveau prix', 'اقبل السعر الجديد')}
                        </button>
                        <button type="button" onClick={() => void remove(item)} disabled={busy === `remove-${item.id}`} className="ay-btn-secondary flex min-h-9 items-center justify-center gap-2 px-3 text-micro font-black disabled:opacity-50">
                          {tr('Retirer la ligne', 'احذف السطر')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* ---- Totaux + sorties ---- */}
      <section className="rounded-card border border-line bg-white p-5">
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-muted">{tr('Sous-total produits', 'المجموع الفرعي للمنتجات')}</dt>
            <dd className="font-black text-ink">{(totals?.product_subtotal_tnd ?? 0).toFixed(2)} TND</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-muted">{tr('Frais, douane et livraison', 'الرسوم والجمارك والتوصيل')}</dt>
            <dd className="font-semibold text-ink">{tr('calculés à l’étape suivante', 'تُحتسب في الخطوة التالية')}</dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { trackAyWebsShoppingEvent('checkout_previewed'); onCheckout(); }}
            disabled={!totals?.checkout_ready}
            className="ay-btn-cta flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ShoppingBag className="h-5 w-5" />
            {totals?.checkout_ready ? tr('Passer au paiement AyWebs', 'الانتقال إلى دفع AyWebs') : tr('Corrigez les lignes signalées', 'صحّح الأسطر المشار إليها')}
          </button>
          <button type="button" onClick={() => void bridge()} disabled={bridging || !totals?.checkout_ready} className="ay-btn-secondary flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">
            {bridging ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRightLeft className="h-5 w-5" />}
            {tr('Transférer vers le panier AYROVI', 'تحويل إلى سلة AYROVI')}
          </button>
        </div>

        <p className="mt-3 text-micro font-semibold leading-5 text-muted">
          {tr(
            'Le panier AyWebs appartient à AYROVI : il est distinct du panier du marchand. Le transfert crée les lignes correspondantes dans votre panier AYROVI existant, sans supprimer celles-ci.',
            'سلة AyWebs تابعة لـ AYROVI وهي غير سلة المتجر. ينشئ التحويل الأسطر المطابقة في سلة AYROVI الحالية دون حذف هذه الأسطر.',
          )}
        </p>
      </section>
    </div>
  );
};

const ItemStatus: React.FC<{ item: AyWebsCartItemPayload; tr: (fr: string, ar: string) => string }> = ({ item, tr }) => {
  if (item.status === 'ACTIVE') {
    return (
      <p className="mt-1 text-micro font-black uppercase tracking-[0.1em] text-success">
        {item.availability === 'UNKNOWN' ? tr('Stock marchand non publié', 'مخزون المتجر غير معلن') : tr('Prêt à commander', 'جاهز للطلب')}
      </p>
    );
  }
  const labels: Record<string, string> = {
    PRICE_CHANGED: tr('Prix changé — décision requise', 'تغيّر السعر — قرار مطلوب'),
    VARIANT_UNAVAILABLE: tr('Version indisponible — choisissez-en une autre', 'النسخة غير متوفرة — اختر غيرها'),
    OUT_OF_STOCK: tr('Épuisé chez le marchand', 'نفد من المتجر'),
    CUSTOMER_ACTION_REQUIRED: tr('Action requise dans la boutique', 'إجراء مطلوب داخل المتجر'),
    REMOVED: tr('Retiré', 'محذوف'),
  };
  return (
    <p className="mt-1 text-micro font-black uppercase tracking-[0.1em] text-danger">
      {labels[item.status] || item.status}
      {item.status_reason ? ` · ${item.status_reason}` : ''}
    </p>
  );
};
