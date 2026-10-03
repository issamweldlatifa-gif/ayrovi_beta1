import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle2, CreditCard, Loader2, ReceiptText, ShieldCheck, ShoppingBag,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  AyWebsRequestError, confirmAyWebsPayment, createAyWebsOrder, createAyWebsPaymentIntent,
  getAyWebsPaymentMethods, previewAyWebsCheckout, trackAyWebsShoppingEvent,
  type AyWebsCheckoutPayload, type AyWebsOrderPayload,
} from '../api';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs Checkout (§19, §20, §21) — aucun calcul de prix dans l'interface.
 *
 * Le devis vient de `POST /checkout/preview` : sous-total produits, service
 * AYROVI, frais d'import, estimation de livraison, autres frais, et le montant à
 * payer. Chaque ligne est libellée en français et en arabe par le serveur, avec
 * son caractère incertain assumé (`uncertain`). Un bloqueur (prix changé,
 * variante épuisée, action client requise) empêche la commande : l'écran le dit
 * et propose la sortie correspondante, il ne bricole pas un montant.
 *
 * Le paiement réutilise la configuration et la passerelle AYROVI existantes
 * (§20) : aucun moyen inventé, aucun débit simulé. Si la passerelle carte n'est
 * pas configurée, la réponse le dit et le virement/mandat reste proposé avec ses
 * coordonnées réelles (§48).
 */

export interface AyWebsCheckoutScreenProps {
  onBack: () => void;
  onOpenCart: () => void;
  onOpenOrders: () => void;
  onRequireSignIn: () => void;
  authenticated: boolean;
}

type Phase = 'loading' | 'ready' | 'error' | 'placing' | 'placed' | 'paying';

export const AyWebsCheckoutScreen: React.FC<AyWebsCheckoutScreenProps> = ({
  onBack, onOpenCart, onOpenOrders, onRequireSignIn, authenticated,
}) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<AyWebsCheckoutPayload | null>(null);
  const [express, setExpress] = useState(false);
  const [localDelivery, setLocalDelivery] = useState(true);
  const [notes, setNotes] = useState('');
  /** §21 — adresse de livraison : saisie cliente, conservée avec la commande. */
  const [address, setAddress] = useState({ name: '', phone: '', city: '', line: '' });
  const [methods, setMethods] = useState<string[]>([]);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [method, setMethod] = useState('');
  const [order, setOrder] = useState<AyWebsOrderPayload | null>(null);
  const [intent, setIntent] = useState<Awaited<ReturnType<typeof createAyWebsPaymentIntent>> | null>(null);
  /**
   * `phase` est une constante : dans la branche « commande créée » le compilateur
   * la rétrécit à `'placed'`, d'où cet état dédié à la vérification passerelle.
   */
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'warning' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const [checkout, paymentMethods] = await Promise.all([
        previewAyWebsCheckout({ express, include_local_delivery: localDelivery }),
        getAyWebsPaymentMethods().catch(() => ({ methods: [] as string[], card_gateway_available: false, note: '' })),
      ]);
      setPreview(checkout);
      setMethods(paymentMethods.methods || []);
      setCardAvailable(Boolean(paymentMethods.card_gateway_available));
      setMethod((current) => current || (paymentMethods.methods || [])[0] || '');
      trackAyWebsShoppingEvent('checkout_previewed');
      setPhase('ready');
    } catch (caught) {
      setError(caught);
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [express, localDelivery]);

  useEffect(() => { void load(); }, [load]);

  const addressComplete = Boolean(address.name.trim() && address.phone.trim() && address.city.trim() && address.line.trim());

  const placeOrder = async () => {
    if (!preview || preview.blockers.length) return;
    setNotice(null);
    if (!addressComplete) {
      setNotice({ tone: 'info', text: tr('Complétez l’adresse de livraison avant de créer la commande.', 'أكمل عنوان التوصيل قبل إنشاء الطلب.') });
      return;
    }
    setPhase('placing');
    try {
      const result = await createAyWebsOrder({
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        express,
        include_local_delivery: localDelivery,
        shipping_address: {
          name: address.name.trim(),
          phone: address.phone.trim(),
          city: address.city.trim(),
          line: address.line.trim(),
        },
      });
      setOrder(result.order);
      trackAyWebsShoppingEvent('order_created');
      setPhase('placed');
      if (result.purchaseIntegration !== 'ENABLED') {
        setNotice({
          tone: 'info',
          text: tr(
            'Achat marchand en cours d’intégration : votre commande part en revue AYROVI, aucun achat automatique n’est simulé.',
            'تكامل الشراء من المتجر قيد التنفيذ: طلبك ينتقل إلى مراجعة AYROVI، ولا تتم محاكاة أي شراء آلي.',
          ),
        });
      }
    } catch (caught) {
      setError(caught);
      setPhase('ready');
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError
          ? caught.contract?.userMessage || caught.message
          : tr('La commande n’a pas pu être créée.', 'تعذّر إنشاء الطلب.'),
      });
    }
  };

  const submitOrder = async () => {
    if (!order) return;
    setPhase('paying');
    try {
      const intentResult = await createAyWebsPaymentIntent({ order_id: order.id, method: method || 'COD' });
      setIntent(intentResult);
      trackAyWebsShoppingEvent('order_submitted');
      if (intentResult.nextAction === 'REDIRECT_TO_GATEWAY' && intentResult.payUrl) {
        window.open(intentResult.payUrl, '_blank', 'noopener,noreferrer');
        setNotice({ tone: 'info', text: tr('Paiement ouvert dans un nouvel onglet. Revenez ici pour confirmer.', 'تم فتح الدفع في تبويب جديد. عد إلى هنا للتأكيد.') });
      } else if (intentResult.nextAction === 'UPLOAD_TRANSFER_PROOF') {
        setNotice({
          tone: 'info',
          text: intentResult.transferInstructions?.available
            ? `${intentResult.transferInstructions.label} — ${intentResult.transferInstructions.details}`
            : tr('Coordonnées de virement indisponibles pour le moment : le support vous les transmettra.', 'بيانات التحويل غير متوفرة حاليًا: سيزودك الدعم بها.'),
        });
      }
      setPhase('placed');
    } catch (caught) {
      setError(caught);
      setPhase('placed');
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError
          ? caught.contract?.userMessage || caught.message
          : tr('Le paiement n’a pas pu démarrer.', 'تعذّر بدء الدفع.'),
      });
    }
  };

  /**
   * Vérification auprès de la passerelle (§20) : la réponse du provider décide,
   * jamais l'écran. Un paiement non confirmé reste annoncé comme non confirmé.
   */
  const confirmPayment = async () => {
    if (!intent) return;
    setConfirming(true);
    setPhase('paying');
    try {
      const result = await confirmAyWebsPayment({ order_id: intent.orderId, payment_id: intent.paymentId });
      const status = String(result.order?.payment_status || result.payment?.status || '');
      if (result.order) setOrder(result.order);
      setNotice(
        status === 'PAID'
          ? { tone: 'success', text: `${tr('Paiement confirmé', 'تم تأكيد الدفع')} — ${status}` }
          : {
            tone: 'warning',
            text: `${tr('Paiement non confirmé pour l’instant', 'لم يتم تأكيد الدفع بعد')} (${status || tr('inconnu', 'غير معروف')}). ${tr('Aucune commande n’est marquée payée sans vérification.', 'لا يُعتبر أي طلب مدفوعًا دون تحقق.')}`,
          },
      );
      setPhase('placed');
    } catch (caught) {
      setPhase('placed');
      setNotice({
        tone: 'warning',
        text: caught instanceof AyWebsRequestError
          ? caught.contract?.userMessage || caught.message
          : tr('Le paiement n’est pas encore confirmé. Aucune commande n’est marquée payée sans vérification.', 'لم يتم تأكيد الدفع بعد. لا يُعتبر أي طلب مدفوعًا دون تحقق.'),
      });
    } finally {
      setConfirming(false);
    }
  };

  if (phase === 'loading') return <AyWebsLoading label={tr('Calcul du devis AYROVI…', 'جارٍ احتساب عرض سعر AYROVI…')} />;
  if ((phase === 'error' || !preview) && !order) {
    return (
      <AyWebsErrorState
        error={error}
        onRetry={() => void load()}
        actions={(
          <>
            <button type="button" onClick={onOpenCart} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
              <ShoppingBag className="h-4 w-4" />
              {tr('Retour au panier', 'العودة إلى السلة')}
            </button>
            {!authenticated && (
              <button type="button" onClick={onRequireSignIn} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                {tr('Se connecter', 'تسجيل الدخول')}
              </button>
            )}
          </>
        )}
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="grid gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">{tr('Paiement AyWebs', 'دفع AyWebs')}</h1>
          <p className="mt-1 text-xs font-semibold text-muted">
            {tr('Le devis est recalculé par le serveur à chaque étape : aucun montant n’est fixé par l’application.', 'يُعاد احتساب العرض على الخادم في كل خطوة: لا يحدد التطبيق أي مبلغ.')}
          </p>
        </div>

        {notice && <AyWebsNotice tone={notice.tone}>{notice.text}</AyWebsNotice>}

        {preview && preview.blockers.length > 0 && (
          <AyWebsNotice tone="danger">
            {preview.blockers.map((blocker) => blocker.message).join(' · ')}
          </AyWebsNotice>
        )}
        {preview && preview.warnings.map((warning) => (
          <AyWebsNotice key={warning.code} tone="warning">{warning.message}</AyWebsNotice>
        ))}

        {/* ---- Lignes du panier ---- */}
        {preview && (
          <section className="overflow-hidden rounded-card border border-line bg-white">
            <h2 className="border-b border-line px-4 py-3 text-sm font-black text-ink">{tr('Articles', 'المنتجات')}</h2>
            <ul className="divide-y divide-line">
              {preview.lines.map((line) => (
                <li key={line.item_id} className="grid gap-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black text-ink">{line.title}</strong>
                      <p className="truncate text-xs font-semibold text-muted">
                        {line.store_name}{line.variant_label ? ` · ${line.variant_label}` : ''} · {tr('Qté', 'الكمية')} {line.quantity}
                      </p>
                      <p className="mt-1 text-xs font-bold text-ink">
                        {line.source_unit_price.toFixed(2)} {line.source_currency}
                        <span className="ms-2 font-semibold text-muted">→ {line.product_amount_tnd.toFixed(2)} TND</span>
                      </p>
                      {line.restricted && (
                        <p className="mt-1 flex items-center gap-1 text-micro font-black uppercase tracking-[0.1em] text-danger">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {tr('Produit soumis à restriction', 'منتج خاضع لقيود')}
                        </p>
                      )}
                      {line.uncertain && (
                        <p className="mt-1 text-micro font-bold uppercase tracking-[0.1em] text-muted">
                          {tr('Devis incertain — recalculé à l’achat', 'عرض تقريبي — يُعاد احتسابه عند الشراء')}
                        </p>
                      )}
                    </div>
                    <strong className="shrink-0 text-sm font-black text-ink">{line.line_total_tnd.toFixed(2)} TND</strong>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Options de livraison ---- */}
        {preview && (
          <section className="rounded-card border border-line bg-white p-4">
            <h2 className="text-sm font-black text-ink">{tr('Options', 'الخيارات')}</h2>
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" checked={express} onChange={(event) => setExpress(event.target.checked)} className="mt-1 h-4 w-4 accent-current" />
              <span>
                <strong className="block text-xs font-black text-ink">{tr('Traitement express', 'معالجة سريعة')}</strong>
                <span className="block text-micro font-semibold text-muted">{tr('Ajoute les frais express au devis.', 'يضيف رسوم الخدمة السريعة إلى العرض.')}</span>
              </span>
            </label>
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" checked={localDelivery} onChange={(event) => setLocalDelivery(event.target.checked)} className="mt-1 h-4 w-4 accent-current" />
              <span>
                <strong className="block text-xs font-black text-ink">{tr('Livraison locale incluse', 'التوصيل المحلي مشمول')}</strong>
                <span className="block text-micro font-semibold text-muted">{tr('Décochez pour un retrait en bureau.', 'ألغِ التحديد للاستلام من المكتب.')}</span>
              </span>
            </label>
            <fieldset className="mt-4 grid gap-3 rounded-control border border-line p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-black text-ink">{tr('Adresse de livraison', 'عنوان التوصيل')}</legend>
              <label className="block">
                <span className="text-micro font-black text-ink">{tr('Nom complet', 'الاسم الكامل')}</span>
                <input
                  value={address.name}
                  onChange={(event) => setAddress({ ...address, name: event.target.value })}
                  className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
                  placeholder={tr('Nom et prénom', 'الاسم واللقب')}
                />
              </label>
              <label className="block">
                <span className="text-micro font-black text-ink">{tr('Téléphone', 'الهاتف')}</span>
                <input
                  value={address.phone}
                  onChange={(event) => setAddress({ ...address, phone: event.target.value })}
                  inputMode="tel"
                  className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
                  placeholder="+216 …"
                />
              </label>
              <label className="block">
                <span className="text-micro font-black text-ink">{tr('Ville / Gouvernorat', 'المدينة / الولاية')}</span>
                <input
                  value={address.city}
                  onChange={(event) => setAddress({ ...address, city: event.target.value })}
                  className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
                  placeholder={tr('Tunis', 'تونس')}
                />
              </label>
              <label className="block">
                <span className="text-micro font-black text-ink">{tr('Adresse précise', 'العنوان الدقيق')}</span>
                <input
                  value={address.line}
                  onChange={(event) => setAddress({ ...address, line: event.target.value })}
                  className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
                  placeholder={tr('Rue, numéro, complément…', 'الشارع، الرقم، تفاصيل…')}
                />
              </label>
            </fieldset>
            <label className="mt-4 block">
              <span className="text-xs font-black text-ink">{tr('Notes pour AYROVI (facultatif)', 'ملاحظات لـ AYROVI (اختياري)')}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={500}
                className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
                placeholder={tr('Précisions utiles à l’acheteur…', 'تفاصيل تفيد المشتري…')}
              />
            </label>
          </section>
        )}
      </div>

      {/* ---- Récapitulatif de frais (§19) ---- */}
      <aside className="grid gap-3 lg:sticky lg:top-4 lg:self-start">
        {preview && (
          <section className="rounded-card border border-line bg-white p-5">
            <h2 className="text-sm font-black text-ink">{tr('Récapitulatif', 'الملخص')}</h2>
            <dl className="mt-3 grid gap-2 text-xs">
              {preview.fees.map((fee) => (
                <div key={fee.code} className="flex items-start justify-between gap-3">
                  <dt className="min-w-0">
                    <span className="block font-bold text-ink">{fee.label}</span>
                    {fee.uncertain && <span className="block text-micro font-semibold text-muted">{tr('estimation', 'تقدير')}</span>}
                  </dt>
                  <dd className="shrink-0 font-black text-ink">{fee.amount_tnd.toFixed(2)} TND</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-muted">{tr('À payer', 'المستحق')}</span>
              <strong className="font-display text-2xl font-black text-ink">{preview.totals.payable_tnd.toFixed(2)} TND</strong>
            </div>
            <p className="mt-2 text-micro font-semibold leading-5 text-muted">
              {tr('Version tarifaire ', 'إصدار التسعير ')}{preview.pricing_version}
              {tr(' · calculée le ', ' · احتُسب في ')}{new Date(preview.computed_at).toLocaleString()}
            </p>

            {/* ---- Moyen de paiement (§20) ---- */}
            {methods.length > 0 && (
              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-xs font-black text-ink"><CreditCard className="h-4 w-4" />{tr('Moyen de paiement', 'طريقة الدفع')}</h3>
                <div className="mt-2 grid gap-2">
                  {methods.map((code) => {
                    const disabled = code === 'CARD' && !cardAvailable;
                    return (
                      <label key={code} className={`flex items-center gap-3 rounded-control border px-3 py-2 transition ${method === code ? 'border-ink bg-surface' : 'border-line bg-white'} ${disabled ? 'opacity-50' : ''}`}>
                        <input
                          type="radio"
                          name="aywebs-payment-method"
                          value={code}
                          checked={method === code}
                          disabled={disabled}
                          onChange={() => setMethod(code)}
                          className="h-4 w-4 accent-current"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs font-black text-ink">{paymentLabel(code, tr)}</strong>
                          {disabled && <span className="block text-micro font-bold uppercase tracking-[0.1em] text-danger">{tr('Passerelle carte non configurée', 'بوابة البطاقات غير مهيأة')}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {!authenticated && (
              <div className="mt-4">
                <AyWebsNotice tone="info">
                  {tr('La commande exige votre compte AYROVI : connectez-vous, votre panier vous suit.', 'إنشاء الطلب يتطلب حساب AYROVI: سجّل الدخول وسلّتك ستتبعك.')}
                </AyWebsNotice>
              </div>
            )}

            <div className="mt-4 grid gap-2">
              {phase === 'placed' && order ? (
                <>
                  <p className="rounded-control border border-success/30 bg-success/5 px-3 py-2 text-xs font-black text-ink">
                    {tr('Commande ', 'الطلب ')}<bdi className="ay-number">{order.order_number}</bdi>{tr(' créée', ' تم إنشاؤه')}
                  </p>
                  {!intent && (
                    <button type="button" onClick={() => void submitOrder()} className="ay-btn-cta flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black">
                      <CreditCard className="h-5 w-5" />
                      {tr('Démarrer le paiement', 'ابدأ الدفع')}
                    </button>
                  )}
                  {intent?.nextAction === 'REDIRECT_TO_GATEWAY' && (
                    <button type="button" onClick={() => void confirmPayment()} disabled={confirming} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black disabled:opacity-50">
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {tr('Vérifier mon paiement', 'تحقق من دفعي')}
                    </button>
                  )}
                  {intent?.nextAction === 'WAIT_FOR_VERIFICATION' && (
                    <p className="rounded-control border border-line bg-surface px-3 py-2 text-micro font-bold uppercase tracking-[0.1em] text-muted">
                      {tr('En attente de vérification du paiement', 'بانتظار التحقق من الدفع')}
                    </p>
                  )}
                  <button type="button" onClick={onOpenOrders} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                    <ReceiptText className="h-4 w-4" />
                    {tr('Suivre mes achats AyWebs', 'تتبّع مشترياتي في AyWebs')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => (authenticated ? void placeOrder() : onRequireSignIn())}
                  disabled={!preview || preview.blockers.length > 0 || phase === 'placing'}
                  className="ay-btn-cta flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {phase === 'placing' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  {preview && preview.blockers.length
                    ? tr('Paiement bloqué', 'الدفع محجوب')
                    : tr('Créer la commande AyWebs', 'إنشاء طلب AyWebs')}
                </button>
              )}
              <button type="button" onClick={onOpenCart} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                <ShoppingBag className="h-4 w-4" />
                {tr('Modifier mon panier', 'تعديل سلّتي')}
              </button>
              <button type="button" onClick={onBack} className="flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black text-muted transition hover:text-ink">
                {tr('Continuer mes achats', 'مواصلة التسوق')}
              </button>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
};

function paymentLabel(code: string, tr: (fr: string, ar: string) => string): string {
  switch (code) {
    case 'COD': return tr('Paiement à la livraison', 'الدفع عند الاستلام');
    case 'CARD': return tr('Carte bancaire', 'بطاقة بنكية');
    case 'FLOUCI': return tr('Flouci', 'فلوسي');
    case 'D17': return tr('D17', 'D17');
    case 'BANK_TRANSFER': return tr('Virement bancaire', 'تحويل بنكي');
    case 'POSTE': return tr('Mandat postal', 'حوالة بريدية');
    default: return code;
  }
}
