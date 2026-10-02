import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ExternalLink, Loader2, Package, ReceiptText, RefreshCw,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  AyWebsRequestError, getAyWebsOrder, listAyWebsOrders, uploadAyWebsTransferProof,
  type AyWebsOrderPayload,
} from '../api';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs Orders (§21, §22, §36, §48) — suivi honnête.
 *
 * La commande porte deux identités (§53) : son numéro AYROVI `AYW-000456` et,
 * pour chaque ligne, l'identité source du marchand. La timeline vient du serveur
 * (`done | current | pending`) : l'écran ne l'invente pas. Les états d'exception
 * (PENDING_INTEGRATION, MANUAL_REVIEW, PURCHASE_FAILED…) sont affichés avec leur
 * raison — un achat non exécuté n'est jamais présenté comme réussi.
 */

export interface AyWebsOrdersScreenProps {
  onBack: () => void;
  onOpenProduct: (url: string, storeId?: string | null) => void;
  onRequireSignIn: () => void;
  authenticated: boolean;
  /** §25 : `ayrovi://aywebs/order/AYW-000456` ouvre directement cette commande. */
  initialOrderNumber?: string | null;
}

type Phase = 'loading' | 'ready' | 'error';

export const AyWebsOrdersScreen: React.FC<AyWebsOrdersScreenProps> = ({
  onBack, onOpenProduct, onRequireSignIn, authenticated, initialOrderNumber = null,
}) => {
  const { tr, formatDate } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<unknown>(null);
  const [orders, setOrders] = useState<AyWebsOrderPayload[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AyWebsOrderPayload | null>(null);
  const [detailPhase, setDetailPhase] = useState<Phase>('loading');
  const [uploading, setUploading] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [transferReference, setTransferReference] = useState('');
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const proofInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      setOrders(await listAyWebsOrders());
      setPhase('ready');
    } catch (caught) {
      setError(caught);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!authenticated) { setPhase('ready'); setOrders([]); return; }
    void load();
  }, [authenticated, load]);

  const expandOrder = useCallback(async (orderId: string) => {
    setOpenId(orderId);
    setDetailPhase('loading');
    setDetail(null);
    try {
      setDetail(await getAyWebsOrder(orderId));
      setDetailPhase('ready');
    } catch (caught) {
      setError(caught);
      setDetailPhase('error');
    }
  }, []);

  const toggleOrder = (orderId: string) => {
    if (orderId === openId) { setOpenId(null); return; }
    void expandOrder(orderId);
  };

  /** Lien profond §25 : la commande visée s'ouvre dès que la liste est lue. */
  useEffect(() => {
    if (!initialOrderNumber || phase !== 'ready' || openId) return;
    const wanted = initialOrderNumber.trim();
    const match = orders.find((order) => order.order_number === wanted || order.id === wanted);
    if (match) void expandOrder(match.id);
  }, [expandOrder, initialOrderNumber, openId, orders, phase]);

  const uploadProof = async (order: AyWebsOrderPayload, file: File, reference: string) => {
    setUploading(true);
    setNotice(null);
    try {
      await uploadAyWebsTransferProof(order.id, file, reference);
      setNotice({ tone: 'success', text: tr('Justificatif transmis : il part en revue AYROVI, la commande n’est pas marquée payée avant vérification.', 'تم إرسال الإثبات: سيُراجع من AYROVI، ولن يُعتبر الطلب مدفوعًا قبل التحقق.') });
      setDetail(await getAyWebsOrder(order.id));
      await load();
    } catch (caught) {
      setNotice({
        tone: 'danger',
        text: caught instanceof AyWebsRequestError
          ? caught.contract?.userMessage || caught.message
          : tr('Le justificatif n’a pas pu être transmis.', 'تعذّر إرسال الإثبات.'),
      });
    } finally {
      setUploading(false);
      setProofFile(null);
      setTransferReference('');
      if (proofInput.current) proofInput.current.value = '';
    }
  };

  if (!authenticated) {
    return (
      <div className="rounded-card border border-line bg-white p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-muted" />
        <h1 className="mt-4 font-display text-xl font-black text-ink">{tr('Vos achats AyWebs', 'مشترياتك في AyWebs')}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-muted">
          {tr('Connectez-vous à votre compte AYROVI pour retrouver vos commandes, leur avancement réel et vos justificatifs.', 'سجّل الدخول إلى حساب AYROVI للاطلاع على طلباتك وتقدمها الفعلي وإثباتاتك.')}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRequireSignIn} className="ay-btn-cta flex min-h-11 items-center justify-center gap-2 px-5 text-xs font-black">{tr('Se connecter', 'تسجيل الدخول')}</button>
          <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">{tr('Retour', 'رجوع')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') return <AyWebsLoading label={tr('Lecture de vos commandes AyWebs…', 'جارٍ قراءة طلبات AyWebs…')} />;
  if (phase === 'error') {
    return <AyWebsErrorState error={error} onRetry={() => void load()} actions={(
      <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">{tr('Retour', 'رجوع')}</button>
    )} />;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">{tr('Mes achats AyWebs', 'مشترياتي في AyWebs')}</h1>
          <p className="mt-1 text-xs font-semibold text-muted">{tr('Numéro AYROVI, identité marchand et avancement réel.', 'رقم AYROVI وهوية المتجر والتقدم الفعلي.')}</p>
        </div>
        <button type="button" onClick={() => void load()} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black">
          <RefreshCw className="h-4 w-4" />
          {tr('Actualiser', 'تحديث')}
        </button>
      </div>

      {notice && <AyWebsNotice tone={notice.tone}>{notice.text}</AyWebsNotice>}

      {orders.length === 0 ? (
        <div className="rounded-card border border-line bg-white p-8 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-4 font-display text-lg font-black text-ink">{tr('Aucune commande AyWebs pour le moment', 'لا توجد طلبات AyWebs حاليًا')}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-muted">
            {tr('Ajoutez un produit détecté chez une boutique externe, puis validez le paiement : la commande apparaîtra ici avec son suivi.', 'أضف منتجًا تم اكتشافه من متجر خارجي ثم أكمل الدفع: سيظهر الطلب هنا مع متابعته.')}
          </p>
          <button type="button" onClick={onBack} className="ay-btn-cta mt-5 flex min-h-11 items-center justify-center gap-2 px-5 text-xs font-black">
            {tr('Parcourir les boutiques', 'تصفّح المتاجر')}
          </button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {orders.map((order) => (
            <li key={order.id} className="overflow-hidden rounded-card border border-line bg-white">
              <button type="button" onClick={() => toggleOrder(order.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-start transition hover:bg-surface" aria-expanded={openId === order.id}>
                <span className="min-w-0">
                  <strong className="ay-number block text-sm font-black text-ink">{order.order_number}</strong>
                  <span className="block truncate text-xs font-semibold text-muted">
                    {formatDate(order.created_at, true)} · {order.items.length} {tr('ligne(s)', 'سطر')} · {order.totals.payable_tnd.toFixed(2)} TND
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <OrderStatusBadge status={order.status} exceptionState={order.exception_state} tr={tr} />
                  <PaymentBadge status={order.payment_status} tr={tr} />
                </span>
              </button>

              {openId === order.id && (
                <div className="border-t border-line px-4 py-4">
                  {detailPhase === 'loading' && <AyWebsLoading label={tr('Lecture de la commande…', 'جارٍ قراءة الطلب…')} />}
                  {detailPhase === 'error' && <AyWebsErrorState error={error} onRetry={() => void expandOrder(order.id)} />}
                  {detailPhase === 'ready' && detail && (
                    <div className="grid gap-4">
                      {detail.exception_state && (
                        <AyWebsNotice tone={detail.exception_state === 'PENDING_INTEGRATION' ? 'info' : 'warning'}>
                          {exceptionLabel(detail.exception_state, tr)}
                          {detail.exception_reason ? ` — ${detail.exception_reason}` : ''}
                        </AyWebsNotice>
                      )}

                      {/* Timeline serveur (§36) */}
                      <ol className="grid gap-2 sm:grid-cols-2">
                        {detail.timeline.map((step) => (
                          <li key={step.key} className={`flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-bold ${step.state === 'current' ? 'border-ink bg-ink text-white' : step.state === 'done' ? 'border-success/30 bg-success/5 text-ink' : 'border-line bg-surface text-muted'}`}>
                            {step.state === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : step.state === 'current' ? <Loader2 className="h-4 w-4 shrink-0" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />}
                            <span className="truncate">{timelineLabel(step.key, tr)}</span>
                          </li>
                        ))}
                      </ol>

                      {/* Lignes : identité AYROVI + identité source */}
                      <ul className="divide-y divide-line rounded-control border border-line">
                        {detail.items.map((item) => (
                          <li key={item.id} className="grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                            {item.images[0]
                              ? <img src={item.images[0]} alt="" className="h-16 w-16 shrink-0 rounded-control border border-line object-cover" loading="lazy" />
                              : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-control border border-line bg-surface text-muted"><Package className="h-5 w-5" /></span>}
                            <div className="min-w-0">
                              <button type="button" onClick={() => onOpenProduct(item.source_url, item.store_id)} className="text-start">
                                <strong className="block truncate text-xs font-black text-ink hover:underline">{item.title}</strong>
                              </button>
                              <p className="truncate text-micro font-semibold text-muted">
                                {item.store_name}{item.variant_label ? ` · ${item.variant_label}` : ''} · {tr('Qté', 'الكمية')} {item.quantity}
                              </p>
                              <p className="truncate text-micro font-bold uppercase tracking-[0.1em] text-muted">
                                {tr('Source', 'المصدر')} : {item.source_product_id || item.source_url}
                              </p>
                              <PurchaseBadge status={item.purchase_status} reason={item.purchase_reason} tr={tr} />
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <strong className="text-xs font-black text-ink">{item.line_total_tnd.toFixed(2)} TND</strong>
                              <button type="button" onClick={() => window.open(item.source_url, '_blank', 'noopener,noreferrer')} className="flex min-h-9 items-center gap-1 rounded-control border border-line px-2 text-micro font-black text-ink transition hover:border-ink/40">
                                <ExternalLink className="h-3.5 w-3.5" />
                                {tr('Marchand', 'المتجر')}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>

                      {/* Frais et total */}
                      <dl className="grid gap-1 rounded-control border border-line bg-surface p-3 text-xs">
                        {detail.fees.map((fee) => (
                          <div key={fee.code} className="flex items-center justify-between gap-3">
                            <dt className="font-semibold text-muted">{fee.label}</dt>
                            <dd className="font-black text-ink">{fee.amount_tnd.toFixed(2)} TND</dd>
                          </div>
                        ))}
                        <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-2">
                          <dt className="text-xs font-black uppercase tracking-[0.12em] text-muted">{tr('À payer', 'المستحق')}</dt>
                          <dd className="font-display text-base font-black text-ink">{detail.totals.payable_tnd.toFixed(2)} TND</dd>
                        </div>
                      </dl>

                      {/* Justificatif de virement (§20) */}
                      {['BANK_TRANSFER', 'POSTE'].includes(detail.payment_method) && detail.payment_status !== 'PAID' && (
                        <div className="rounded-control border border-line bg-white p-3">
                          <h3 className="text-xs font-black text-ink">{tr('Justificatif de virement / mandat', 'إثبات التحويل أو الحوالة')}</h3>
                          <p className="mt-1 text-micro font-semibold leading-5 text-muted">
                            {tr('JPG, PNG ou PDF. La commande passe en revue AYROVI : elle n’est marquée payée qu’après vérification.', 'JPG أو PNG أو PDF. ينتقل الطلب إلى مراجعة AYROVI ولا يُعتبر مدفوعًا إلا بعد التحقق.')}
                          </p>
                          <div className="mt-2 grid gap-2">
                            <input
                              value={transferReference}
                              onChange={(event) => setTransferReference(event.target.value)}
                              maxLength={120}
                              placeholder={tr('Référence du virement / mandat *', 'مرجع التحويل أو الحوالة *')}
                              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                ref={proofInput}
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="min-w-0 flex-1 text-xs font-semibold text-muted file:me-2 file:rounded-control file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-xs file:font-black file:text-ink"
                                onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                              />
                              <button
                                type="button"
                                disabled={uploading || !proofFile || !transferReference.trim()}
                                onClick={() => proofFile && void uploadProof(detail, proofFile, transferReference.trim())}
                                className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                                {tr('Envoyer la preuve', 'إرسال الإثبات')}
                              </button>
                            </div>
                            <p className="text-micro font-semibold leading-5 text-muted">
                              {tr('La référence est exigée : elle rapproche votre versement de la commande lors de la revue AYROVI.', 'المرجع مطلوب: فهو يربط دفعتك بالطلب أثناء مراجعة AYROVI.')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const OrderStatusBadge: React.FC<{ status: string; exceptionState: string | null; tr: (fr: string, ar: string) => string }> = ({ status, exceptionState, tr }) => (
  <span className={`inline-flex items-center gap-1 rounded-control border px-2 py-1 text-micro font-black uppercase tracking-[0.1em] ${exceptionState ? 'border-line bg-surface text-ink' : 'border-ink bg-ink text-white'}`}>
    {statusLabel(status, tr)}
    {exceptionState && <AlertCircle className="h-3.5 w-3.5" />}
  </span>
);

const PaymentBadge: React.FC<{ status: string; tr: (fr: string, ar: string) => string }> = ({ status, tr }) => (
  <span className={`inline-flex items-center rounded-control border px-2 py-1 text-micro font-black uppercase tracking-[0.1em] ${status === 'PAID' ? 'border-success/30 bg-success/5 text-ink' : 'border-line bg-white text-muted'}`}>
    {paymentStatusLabel(status, tr)}
  </span>
);

const PurchaseBadge: React.FC<{ status: string; reason: string; tr: (fr: string, ar: string) => string }> = ({ status, reason, tr }) => {
  if (status === 'PURCHASED' || status === 'PENDING_PURCHASE') {
    return <p className="mt-1 text-micro font-black uppercase tracking-[0.1em] text-success">{purchaseStatusLabel(status, tr)}</p>;
  }
  return (
    <p className="mt-1 text-micro font-black uppercase tracking-[0.1em] text-muted">
      {purchaseStatusLabel(status, tr)}{reason ? ` · ${reason}` : ''}
    </p>
  );
};

function statusLabel(status: string, tr: (fr: string, ar: string) => string): string {
  switch (status) {
    case 'DRAFT': return tr('Brouillon', 'مسودة');
    case 'CHECKOUT': return tr('En préparation', 'قيد التحضير');
    case 'PAYMENT_PENDING': return tr('Paiement attendu', 'بانتظار الدفع');
    case 'PAID': return tr('Payée', 'مدفوعة');
    case 'PURCHASE_PENDING': return tr('Achat à lancer', 'الشراء قيد الإطلاق');
    case 'PURCHASING': return tr('Achat en cours', 'الشراء جارٍ');
    case 'PARTIALLY_PURCHASED': return tr('Achat partiel', 'شراء جزئي');
    case 'PURCHASE_FAILED': return tr('Achat échoué', 'فشل الشراء');
    case 'IN_TRANSIT': return tr('En transit', 'أثناء الشحن');
    case 'AT_WAREHOUSE': return tr('À l’entrepôt', 'في المستودع');
    case 'SHIPPED': return tr('Expédiée', 'تم الشحن');
    case 'DELIVERED': return tr('Livrée', 'تم التسليم');
    case 'CANCELLED': return tr('Annulée', 'ملغاة');
    default: return status;
  }
}

function paymentStatusLabel(status: string, tr: (fr: string, ar: string) => string): string {
  switch (status) {
    case 'PAID': return tr('Payé', 'مدفوع');
    case 'PENDING': return tr('En attente', 'قيد الانتظار');
    case 'PENDING_VERIFICATION': return tr('Justificatif en revue', 'الإثبات قيد المراجعة');
    case 'FAILED': return tr('Échec', 'فشل');
    case 'REFUNDED': return tr('Remboursé', 'مُسترجع');
    default: return tr('Non payé', 'غير مدفوع');
  }
}

function purchaseStatusLabel(status: string, tr: (fr: string, ar: string) => string): string {
  switch (status) {
    case 'PENDING_PURCHASE': return tr('Achat à lancer', 'الشراء قيد الإطلاق');
    case 'PURCHASED': return tr('Acheté', 'تم الشراء');
    case 'PENDING_INTEGRATION': return tr('Intégration d’achat en attente', 'تكامل الشراء قيد الانتظار');
    case 'MANUAL_REVIEW': return tr('Revue manuelle AYROVI', 'مراجعة يدوية من AYROVI');
    case 'REQUIRES_REVIEW': return tr('Vérification requise', 'يلزم تحقق');
    case 'PRICE_CHANGED': return tr('Prix changé', 'تغيّر السعر');
    case 'VARIANT_UNAVAILABLE': return tr('Version indisponible', 'النسخة غير متوفرة');
    case 'OUT_OF_STOCK': return tr('Épuisé', 'نفد');
    case 'PURCHASE_FAILED': return tr('Achat échoué', 'فشل الشراء');
    default: return status;
  }
}

function exceptionLabel(state: string, tr: (fr: string, ar: string) => string): string {
  switch (state) {
    case 'PENDING_INTEGRATION': return tr('Aucune intégration d’achat automatique : revue humaine AYROVI', 'لا يوجد تكامل شراء آلي: مراجعة بشرية من AYROVI');
    case 'MANUAL_REVIEW': return tr('Revue manuelle requise', 'مراجعة يدوية مطلوبة');
    case 'PRICE_CHANGED': return tr('Prix changé chez le marchand', 'تغيّر السعر لدى المتجر');
    case 'OUT_OF_STOCK': return tr('Article épuisé chez le marchand', 'المنتج نفد لدى المتجر');
    case 'CUSTOMER_ACTION_REQUIRED': return tr('Action requise de votre part dans la boutique', 'إجراء مطلوب منك داخل المتجر');
    case 'PURCHASE_FAILED': return tr('Échec d’achat chez le marchand', 'فشل الشراء من المتجر');
    default: return state;
  }
}

function timelineLabel(key: string, tr: (fr: string, ar: string) => string): string {
  switch (key) {
    case 'ORDER_SUBMITTED': return tr('Commande soumise', 'تم تقديم الطلب');
    case 'PAYMENT_CONFIRMED': return tr('Paiement confirmé', 'تم تأكيد الدفع');
    case 'PURCHASE_COMPLETED': return tr('Achat effectué', 'تم الشراء');
    case 'SUPPLIER_SHIPPED': return tr('Expédié par le fournisseur', 'شحنه المزوّد');
    case 'WAREHOUSE_RECEIVED': return tr('Reçu à l’entrepôt', 'تم الاستلام في المستودع');
    case 'CONSOLIDATED': return tr('Colis groupé', 'تم تجميع الطرد');
    case 'PACKED': return tr('Emballé', 'تم التغليف');
    case 'INTERNATIONAL_SHIPPED': return tr('Expédition internationale', 'شحن دولي');
    case 'CUSTOMS_CLEARED': return tr('Douane passée', 'تم اجتياز الجمارك');
    case 'OUT_FOR_DELIVERY': return tr('En cours de livraison', 'قيد التوصيل');
    case 'DELIVERED': return tr('Livré', 'تم التسليم');
    default: return key.replaceAll('_', ' ');
  }
}
