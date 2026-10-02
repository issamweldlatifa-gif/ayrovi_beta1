import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ExternalLink, Hourglass, Loader2, Plus, ReceiptText,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  AyWebsRequestError, createAyWebsPurchaseRequest, createAyWebsStoreRequest,
  listAyWebsPurchaseRequests, trackAyWebsShoppingEvent,
  type AyWebsPurchaseRequestPayload,
} from '../api';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs — boutique non prise en charge (§23, §38).
 *
 * Quand le Store Registry ne connaît pas la boutique, ou quand la capture est
 * désactivée, la seule voie honnête est la demande explicite : le client donne le
 * lien exact, la quantité, le nom du produit, ses choix de version
 * (couleur/taille/modèle ou tout autre attribut) et ses exigences. AYROVI répond
 * SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / ORDER_READY, et un refus porte
 * toujours une raison du catalogue — jamais un silence.
 */

export interface AyWebsRequestFormProps {
  mode: 'purchase' | 'store';
  prefill?: { url?: string; storeName?: string };
  onBack: () => void;
  onSwitchMode: (mode: 'purchase' | 'store') => void;
  onOrderReady?: (request: AyWebsPurchaseRequestPayload) => void;
}

type Phase = 'idle' | 'sending' | 'sent' | 'error';

const VARIANT_FIELDS = [
  { key: 'color', fr: 'Couleur', ar: 'اللون' },
  { key: 'size', fr: 'Taille', ar: 'المقاس' },
  { key: 'model', fr: 'Modèle / version', ar: 'الموديل / النسخة' },
  { key: 'other', fr: 'Autre attribut', ar: 'سمة أخرى' },
] as const;

export const AyWebsRequestForm: React.FC<AyWebsRequestFormProps> = ({ mode, prefill, onBack, onSwitchMode, onOrderReady }) => {
  const { tr, formatDate } = useLocale();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string>('');
  const [created, setCreated] = useState<AyWebsPurchaseRequestPayload | null>(null);

  const [productUrl, setProductUrl] = useState(prefill?.url || '');
  const [quantity, setQuantity] = useState(1);
  const [productName, setProductName] = useState('');
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [requirements, setRequirements] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [storeUrl, setStoreUrl] = useState(prefill?.url || '');
  const [storeName, setStoreName] = useState(prefill?.storeName || '');
  const [intent, setIntent] = useState('');

  const [requests, setRequests] = useState<AyWebsPurchaseRequestPayload[]>([]);
  const [listPhase, setListPhase] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadRequests = useCallback(async () => {
    setListPhase('loading');
    try {
      setRequests(await listAyWebsPurchaseRequests());
      setListPhase('ready');
    } catch (caught) {
      setError(caught);
      setListPhase('error');
    }
  }, []);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (prefill?.url) { if (mode === 'purchase') setProductUrl(prefill.url); else setStoreUrl(prefill.url); }
    if (prefill?.storeName) setStoreName(prefill.storeName);
  }, [mode, prefill?.storeName, prefill?.url]);

  const submitPurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    setPhase('sending');
    setError(null);
    setNotice('');
    try {
      const attributes = Object.fromEntries(
        Object.entries(variants).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]),
      );
      const result = await createAyWebsPurchaseRequest({
        product_url: productUrl.trim(),
        quantity,
        ...(productName.trim() ? { product_name: productName.trim() } : {}),
        ...(Object.keys(attributes).length ? { variant_attributes: attributes } : {}),
        ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        ...(customerNotes.trim() ? { customer_notes: customerNotes.trim() } : {}),
      });
      setCreated(result);
      setPhase('sent');
      trackAyWebsShoppingEvent('purchase_request_submitted');
      await loadRequests();
      if (onOrderReady) onOrderReady(result);
    } catch (caught) {
      setError(caught);
      setPhase('error');
      setNotice(caught instanceof AyWebsRequestError ? caught.contract?.userMessage || caught.message : '');
    }
  };

  const submitStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setPhase('sending');
    setError(null);
    setNotice('');
    try {
      await createAyWebsStoreRequest({
        store_url: storeUrl.trim(),
        ...(storeName.trim() ? { store_name: storeName.trim() } : {}),
        ...(intent.trim() ? { intent: intent.trim() } : {}),
      });
      setPhase('sent');
      trackAyWebsShoppingEvent('store_request_submitted');
    } catch (caught) {
      setError(caught);
      setPhase('error');
      setNotice(caught instanceof AyWebsRequestError ? caught.contract?.userMessage || caught.message : '');
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">
            {mode === 'purchase' ? tr('Demander un achat avec URL', 'اطلب الشراء بالرابط') : tr('Demander une boutique', 'اطلب إضافة متجر')}
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-6 text-muted">
            {mode === 'purchase'
              ? tr('Boutique hors registre ou capture désactivée : donnez le lien exact, AYROVI traite l’achat et vous répond avec un devis ou une raison claire.', 'متجر خارج السجل أو الالتقاط معطّل: أعطِ الرابط الدقيق، ويتولى AYROVI الشراء ويرد عليك بعرض سعر أو بسبب واضح.')
              : tr('Vous voulez une boutique absente du registre ? Dites-nous quoi y acheter : elle sera étudiée puis, si elle est acceptée, intégrée.', 'تريد متجرًا غير مدرج؟ أخبرنا ماذا تشتري منه: ستُدرس الطلب ثم يُدمج المتجر إن قُبل.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onSwitchMode(mode === 'purchase' ? 'store' : 'purchase')} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black">
            {mode === 'purchase' ? <ExternalLink className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />}
            {mode === 'purchase' ? tr('Demander une boutique', 'اطلب إضافة متجر') : tr('Demander un achat', 'اطلب شراءً')}
          </button>
          <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black">
            {tr('Retour', 'رجوع')}
          </button>
        </div>
      </div>

      {phase === 'sent' && (
        <AyWebsNotice tone="success">
          {mode === 'purchase'
            ? `${tr('Demande enregistrée : ', 'تم تسجيل الطلب: ')}${created?.request_number || ''}. ${tr('Elle passe en revue AYROVI ; vous recevrez une réponse avec un devis ou une raison de refus.', 'سينتقل إلى مراجعة AYROVI؛ وستصلك إجابة بعرض سعر أو بسبب الرفض.')}`
            : tr('Demande de boutique enregistrée : elle sera étudiée par AYROVI.', 'تم تسجيل طلب المتجر: ستدرسه AYROVI.')}
        </AyWebsNotice>
      )}
      {notice && phase === 'error' && <AyWebsNotice tone="danger">{notice}</AyWebsNotice>}
      {phase === 'error' && <AyWebsErrorState error={error} onRetry={() => setPhase('idle')} />}

      {mode === 'purchase' ? (
        <form onSubmit={submitPurchase} className="grid gap-4 rounded-card border border-line bg-white p-5">
          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Lien exact du produit *', 'رابط المنتج الدقيق *')}</span>
            <input
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              required
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://…"
              className="mt-2 h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
            />
            <span className="mt-1 block text-micro font-semibold text-muted">
              {tr('HTTPS obligatoire : un lien raccourci ou privé sera refusé.', 'HTTPS إلزامي: أي رابط مختصر أو خاص سيُرفض.')}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black text-ink">{tr('Nom du produit', 'اسم المنتج')}</span>
              <input
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                maxLength={200}
                placeholder={tr('Ex. : Nike Air Max 95', 'مثال: Nike Air Max 95')}
                className="mt-2 h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black text-ink">{tr('Quantité *', 'الكمية *')}</span>
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(event) => setQuantity(Math.min(99, Math.max(1, Number(event.target.value) || 1)))}
                className="mt-2 h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
              />
            </label>
          </div>

          <fieldset className="grid gap-3">
            <legend className="text-xs font-black text-ink">{tr('Version souhaitée (couleur, taille, modèle…)', 'النسخة المطلوبة (اللون، المقاس، الموديل…)')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {VARIANT_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-micro font-black uppercase tracking-[0.12em] text-muted">{tr(field.fr, field.ar)}</span>
                  <input
                    value={variants[field.key] || ''}
                    onChange={(event) => setVariants((previous) => ({ ...previous, [field.key]: event.target.value }))}
                    maxLength={120}
                    className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
                    placeholder={tr('Facultatif', 'اختياري')}
                  />
                </label>
              ))}
            </div>
            <p className="text-micro font-semibold leading-5 text-muted">
              {tr('Aucune substitution automatique : si la version est indisponible, AYROVI vous répond au lieu de choisir à votre place.', 'لا استبدال تلقائي: إن كانت النسخة غير متوفرة يرد عليك AYROVI بدلاً من الاختيار نيابة عنك.')}
            </p>
          </fieldset>

          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Exigences (matière, capacité, interdits…)', 'المتطلبات (الخامة، السعة، الممنوعات…)')}</span>
            <input
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              maxLength={500}
              className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
              placeholder={tr('Ex. : sans alcool, capacité 250 ml', 'مثال: بدون كحول، سعة 250 مل')}
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Notes pour l’acheteur', 'ملاحظات للمشتري')}</span>
            <textarea
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
              placeholder={tr('Précisions utiles, liens alternatifs, délais…', 'تفاصيل مفيدة، روابط بديلة، المواعيد…')}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={phase === 'sending' || !productUrl.trim()} className="ay-btn-cta flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">
              {phase === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
              {tr('Envoyer la demande', 'إرسال الطلب')}
            </button>
            <span className="flex items-center gap-2 text-micro font-bold uppercase tracking-[0.12em] text-muted">
              <AlertCircle className="h-4 w-4" />
              {tr('Réponse humaine, aucun achat simulé', 'رد بشري، دون محاكاة شراء')}
            </span>
          </div>
        </form>
      ) : (
        <form onSubmit={submitStore} className="grid gap-4 rounded-card border border-line bg-white p-5">
          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Lien de la boutique *', 'رابط المتجر *')}</span>
            <input
              value={storeUrl}
              onChange={(event) => setStoreUrl(event.target.value)}
              required
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://…"
              className="mt-2 h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Nom de la boutique', 'اسم المتجر')}</span>
            <input
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              maxLength={200}
              className="mt-2 h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-ink">{tr('Ce que vous voulez y acheter *', 'ما الذي تريد شراءه *')}</span>
            <textarea
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              rows={3}
              maxLength={500}
              required
              className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-xs font-semibold text-ink outline-none transition focus:border-ink focus:bg-white"
              placeholder={tr('Ex. : compléments alimentaires, livraison en Tunisie…', 'مثال: مكملات غذائية، التوصيل إلى تونس…')}
            />
          </label>
          <button type="submit" disabled={phase === 'sending' || !storeUrl.trim() || !intent.trim()} className="ay-btn-cta flex min-h-12 w-fit items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">
            {phase === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {tr('Envoyer la demande', 'إرسال الطلب')}
          </button>
        </form>
      )}

      {/* ---- Suivi des demandes : le statut vient du serveur ---- */}
      {mode === 'purchase' && (
        <section aria-labelledby="aywebs-requests-list">
          <h2 id="aywebs-requests-list" className="font-display text-lg font-black text-ink">{tr('Mes demandes', 'طلباتي')}</h2>
          {listPhase === 'loading' && <AyWebsLoading label={tr('Lecture de vos demandes…', 'جارٍ قراءة طلباتك…')} />}
          {listPhase === 'error' && <AyWebsErrorState error={error} onRetry={() => void loadRequests()} />}
          {listPhase === 'ready' && requests.length === 0 && (
            <p className="mt-3 rounded-card border border-line bg-white px-4 py-6 text-center text-sm font-semibold text-muted">
              {tr('Aucune demande pour le moment.', 'لا توجد طلبات حاليًا.')}
            </p>
          )}
          {listPhase === 'ready' && requests.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {requests.map((item) => (
                <li key={item.id} className="rounded-card border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black text-ink">{item.product_name || item.store_name || item.source_domain}</strong>
                      <p className="truncate text-xs font-semibold text-muted">{item.request_number} · {item.product_url}</p>
                      <p className="mt-1 truncate text-micro font-semibold text-muted">
                        {tr('Qté', 'الكمية')} {item.quantity}
                        {item.variant_attributes && Object.keys(item.variant_attributes).length
                          ? ` · ${Object.entries(item.variant_attributes).map(([key, value]) => `${key}: ${value}`).join(', ')}`
                          : ''}
                        {` · ${formatDate(item.created_at, true)}`}
                      </p>
                    </div>
                    <RequestStatusBadge status={item.status} tr={tr} />
                  </div>
                  {item.status === 'REJECTED' && (
                    <p className="mt-2 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-semibold text-ink">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {rejectReasonLabel(item.reason || '', tr)}
                        {item.decision_note ? ` — ${item.decision_note}` : ''}
                      </span>
                    </p>
                  )}
                  {item.status === 'ORDER_READY' && item.order_id && (
                    <p className="mt-2 flex items-center gap-2 rounded-control border border-success/30 bg-success/5 px-3 py-2 text-xs font-black text-ink">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {tr('Une commande AyWebs est prête : consultez vos achats.', 'طلب AyWebs جاهز: راجع مشترياتك.')}
                    </p>
                  )}
                  {item.status === 'APPROVED' && (
                    <p className="mt-2 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink">
                      <Hourglass className="h-4 w-4 shrink-0" />
                      {tr('Demande approuvée : le devis et la commande suivent.', 'تمت الموافقة: سيتبع عرض السعر والطلب.')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

const RequestStatusBadge: React.FC<{ status: string; tr: (fr: string, ar: string) => string }> = ({ status, tr }) => {
  const tone = status === 'REJECTED'
    ? 'border-danger/30 bg-danger/5 text-ink'
    : status === 'ORDER_READY' || status === 'APPROVED'
      ? 'border-success/30 bg-success/5 text-ink'
      : 'border-line bg-surface text-muted';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-control border px-2 py-1 text-micro font-black uppercase tracking-[0.1em] ${tone}`}>
      {status === 'SUBMITTED' && <Hourglass className="h-3.5 w-3.5" />}
      {requestStatusLabel(status, tr)}
    </span>
  );
};

function requestStatusLabel(status: string, tr: (fr: string, ar: string) => string): string {
  switch (status) {
    case 'SUBMITTED': return tr('Envoyée', 'مُرسل');
    case 'UNDER_REVIEW': return tr('En revue', 'قيد المراجعة');
    case 'APPROVED': return tr('Approuvée', 'موافَق عليه');
    case 'REJECTED': return tr('Refusée', 'مرفوض');
    case 'ORDER_READY': return tr('Commande prête', 'الطلب جاهز');
    case 'PROMOTED': return tr('Boutique intégrée', 'تم دمج المتجر');
    default: return status;
  }
}

/** §23 : les raisons de refus viennent du catalogue serveur, pas d'un texte libre. */
function rejectReasonLabel(reason: string, tr: (fr: string, ar: string) => string): string {
  switch (reason) {
    case 'OUT_OF_STOCK': return tr('Article épuisé chez le marchand', 'المنتج نفد لدى المتجر');
    case 'PRICE_CHANGED': return tr('Prix changé depuis votre demande', 'تغيّر السعر منذ طلبك');
    case 'VARIANT_UNCLEAR': return tr('Version demandée imprécise', 'النسخة المطلوبة غير واضحة');
    case 'URL_NOT_ACCESSIBLE': return tr('Lien inaccessible', 'الرابط غير متاح');
    case 'PROHIBITED_ITEM': return tr('Article interdit à l’importation', 'منتج ممنوع من الاستيراد');
    case 'STORE_RESTRICTED': return tr('Boutique restreinte', 'المتجر مقيّد');
    case 'PURCHASE_RESTRICTED': return tr('Achat restreint par le marchand', 'الشراء مقيّد من المتجر');
    case 'OTHER': return tr('Autre raison', 'سبب آخر');
    default: return reason || tr('Raison non précisée', 'لم يُحدد السبب');
  }
}
