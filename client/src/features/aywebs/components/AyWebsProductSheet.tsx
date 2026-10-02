import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AyWebs, CheckCircle2, ChevronLeft, ExternalLink, Loader2, Minus, Plus,
  ReceiptText, RefreshCw, ShoppingBag, ShieldCheck,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import type { ScrapedProduct } from '../../../types';
import {
  AyWebsRequestError, addAyWebsCartItem, resolveAyWebsProduct, trackAyWebsEvent,
  trackAyWebsShoppingEvent, type AyWebsProductPayload,
} from '../api';
import { openMerchantPage } from '../../../services/nativeShell';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice, AyWebsPrice } from './AyWebsStates';

/**
 * AYWEBs — fiche produit + ajout au panier (§12, §13, §14, §15, §29, §30).
 *
 * Tout est lu du serveur : titre, images, prix source, devis AYROVI en dinars,
 * attributs de variante LIBRES (pas seulement couleur+taille), disponibilité et
 * preuve. Le client n'envoie que `product_id`/`source_url`, les attributs
 * choisis et la quantité — jamais un prix ni un statut (§45).
 *
 * Le bouton d'ajout suit la machine à états §15 :
 *   IDLE → ADDING → ADDED → (Continuer mes achats | Voir mon panier)
 * et il est DÉSACTIVÉ quand la disponibilité est OUT_OF_STOCK, ou tant qu'une
 * variante publiée n'est pas choisie. UNKNOWN reste UNKNOWN : il est affiché
 * comme « stock non publié », jamais transformé en disponible.
 */

export interface AyWebsProductSheetProps {
  url: string;
  storeId?: string | null;
  onBack: () => void;
  onOpenCart: () => void;
  onOpenRequestForm: (prefill: { url?: string; storeName?: string }) => void;
  /**
   * Pont non destructif vers le flux AYROVI existant (§2) : la fiche normalisée
   * AYWEBs est accompagnée du produit scraped V1 quand le serveur en fournit un,
   * ce qui permet d'ouvrir la confirmation AYROVI d'origine sans la recréer.
   */
  onCaptured?: (product: AyWebsProductPayload, scraped: ScrapedProduct | null) => void;
}

type AddState = 'IDLE' | 'ADDING' | 'ADDED' | 'FAILED';

export const AyWebsProductSheet: React.FC<AyWebsProductSheetProps> = ({
  url, storeId, onBack, onOpenCart, onOpenRequestForm, onCaptured,
}) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [product, setProduct] = useState<AyWebsProductPayload | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [addState, setAddState] = useState<AddState>('IDLE');
  const [addMessage, setAddMessage] = useState('');
  const [addedItemNumber, setAddedItemNumber] = useState('');
  const [imageIndex, setImageIndex] = useState(0);

  const load = useCallback(async (variant?: Record<string, string> | null, nextQuantity = quantity) => {
    setPhase('loading');
    setError(null);
    try {
      const result = await resolveAyWebsProduct({
        url,
        ...(storeId ? { store: storeId } : {}),
        ...(variant && Object.keys(variant).length ? { variant } : {}),
        quantity: nextQuantity,
      });
      setProduct(result.product);
      setSelected(result.product.selected_variant?.attributes || variant || {});
      setPhase('ready');
      if (onCaptured) onCaptured(result.product, result.scrapedProduct || null);
    } catch (caught) {
      setError(caught);
      setPhase('error');
    }
  }, [onCaptured, quantity, storeId, url]);

  useEffect(() => { void load(); }, [load]);

  const groups = product?.variant_groups || [];
  const selectionRequired = groups.some((group) => group.values.length > 0);
  const selectionComplete = !selectionRequired || groups.every((group) => Boolean(selected[group.attribute]));
  const availability = product?.availability?.state || 'UNKNOWN';
  const outOfStock = availability === 'OUT_OF_STOCK';
  const canAdd = Boolean(product) && selectionComplete && !outOfStock && addState !== 'ADDING';

  const variantAvailability = useMemo(() => {
    if (!product) return new Map<string, string>();
    const map = new Map<string, string>();
    // Les combinaisons publiées par le marchand arrivent via `/product/variants` ;
    // ici l'écran se base sur l'option plate + la disponibilité produit, et le
    // serveur tranche à l'ajout : une variante épuisée est refusée (§30).
    for (const option of product.variants) map.set(`${option.attribute}:${option.value}`, 'PUBLISHED');
    return map;
  }, [product]);

  const chooseVariant = (attribute: string, value: string) => {
    const next = { ...selected, [attribute]: value };
    setSelected(next);
    setAddState('IDLE');
    setAddMessage('');
    trackAyWebsShoppingEvent('variant_selected', { store: product?.store_id });
    // Relire le devis avec la variante choisie : le prix peut dépendre d'elle.
    void load(next, quantity);
  };

  const changeQuantity = (delta: number) => {
    const next = Math.min(99, Math.max(1, quantity + delta));
    setQuantity(next);
    setAddState('IDLE');
  };

  const addToCart = async () => {
    if (!product || !canAdd) return;
    setAddState('ADDING');
    setAddMessage('');
    trackAyWebsEvent('add_to_cart_clicked', { store: product.store_id });
    try {
      const result = await addAyWebsCartItem({
        product_id: product.product_id,
        store_id: product.store_id,
        variant_attributes: Object.keys(selected).length ? selected : null,
        quantity,
        ...(note.trim() ? { customer_note: note.trim() } : {}),
      });
      setAddState('ADDED');
      setAddedItemNumber(result.item.item_number);
      setAddMessage(result.item.status === 'ACTIVE'
        ? tr('Ajouté au panier AyWebs.', 'تمت الإضافة إلى سلة AyWebs.')
        : tr('Ajouté, mais une vérification est nécessaire avant le paiement.', 'تمت الإضافة، لكن يلزم تحقق قبل الدفع.'));
      trackAyWebsEvent('add_to_cart_succeeded', { store: product.store_id });
    } catch (caught) {
      setAddState('FAILED');
      trackAyWebsEvent('capture_failed', { store: product.store_id, code: caught instanceof AyWebsRequestError ? caught.code : 'ADD_TO_CART_FAILED' });
      setAddMessage(caught instanceof AyWebsRequestError
        ? caught.contract?.userMessage || caught.message
        : tr('L’ajout au panier a échoué.', 'فشلت الإضافة إلى السلة.'));
      setError(caught);
    }
  };

  if (phase === 'loading') {
    return <AyWebsLoading label={tr('Lecture du produit chez le marchand…', 'جارٍ قراءة المنتج من المتجر…')} />;
  }

  if (phase === 'error' || !product) {
    const code = error instanceof AyWebsRequestError ? error.code : '';
    return (
      <div className="grid gap-3">
        <AyWebsErrorState
          error={error}
          onRetry={() => void load(selected, quantity)}
          actions={(
            <>
              <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                <ChevronLeft className="h-4 w-4" />
                {tr('Retour', 'رجوع')}
              </button>
              {['DOMAIN_NOT_ALLOWED', 'STORE_UNKNOWN', 'STORE_CAPTURE_UNSUPPORTED', 'PRODUCT_NOT_FOUND'].includes(code) && (
                <button type="button" onClick={() => onOpenRequestForm({ url })} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                  <ReceiptText className="h-4 w-4" />
                  {tr('Demander un achat avec URL', 'اطلب الشراء بالرابط')}
                </button>
              )}
            </>
          )}
        />
      </div>
    );
  }

  const images = product.images.length ? product.images : [];

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black">
          <ChevronLeft className="h-4 w-4" />
          {tr('Retour', 'رجوع')}
        </button>
        <span className="truncate text-micro font-black uppercase tracking-[0.12em] text-muted">
          {product.store_name} · {product.integration_type.replace(/_/g, ' ')}
        </span>
        <button type="button" onClick={() => openMerchantPage(product.source_url)} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-black">
          <ExternalLink className="h-4 w-4" />
          {tr('Chez le marchand', 'لدى المتجر')}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ---- Visuels + description ---- */}
        <div>
          {images.length > 0 ? (
            <div className="overflow-hidden rounded-card border border-line bg-white">
              <img src={images[imageIndex] || images[0]} alt={product.title} className="h-72 w-full object-contain p-3 sm:h-96" loading="lazy" />
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto border-t border-line p-3">
                  {images.slice(0, 8).map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setImageIndex(index)}
                      aria-pressed={index === imageIndex}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-control border transition ${index === imageIndex ? 'border-ink' : 'border-line hover:border-ink/40'}`}
                      aria-label={tr(`Image ${index + 1}`, `الصورة ${index + 1}`)}
                    >
                      <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid h-72 place-items-center rounded-card border border-line bg-surface text-muted sm:h-96">
              <AyWebs className="h-12 w-12" />
            </div>
          )}

          <div className="mt-4 rounded-card border border-line bg-white p-4">
            <h2 className="text-sm font-black text-ink">{tr('Informations lues chez le marchand', 'معلومات مقروءة من المتجر')}</h2>
            <p className="mt-2 text-xs font-semibold leading-6 text-muted">{product.description || tr('Aucune description publiée.', 'لا يوجد وصف منشور.')}</p>
            <dl className="mt-3 grid gap-2 text-xs font-semibold text-muted sm:grid-cols-2">
              <div><dt className="inline font-black text-ink">{tr('Marque', 'العلامة')} : </dt><dd className="inline">{product.brand || '—'}</dd></div>
              <div><dt className="inline font-black text-ink">{tr('Identifiant marchand', 'معرّف المتجر')} : </dt><dd className="inline">{product.source_product_id || '—'}</dd></div>
              <div><dt className="inline font-black text-ink">{tr('Domaine', 'النطاق')} : </dt><dd className="inline">{product.source_domain}</dd></div>
              <div><dt className="inline font-black text-ink">{tr('Mode d’achat', 'طريقة الشراء')} : </dt><dd className="inline">{purchaseModeLabel(product.purchase_mode, tr)}</dd></div>
            </dl>
            <p className="mt-3 flex items-start gap-2 rounded-control border border-line bg-surface px-3 py-2 text-micro font-semibold leading-5 text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {tr('Preuve de lecture enregistrée : ', 'تم حفظ إثبات القراءة: ')}
              <code className="ay-number truncate">{product.evidence_hash.slice(0, 16)}…</code>
            </p>
          </div>
        </div>

        {/* ---- Achat : prix, variantes, quantité, ajout ---- */}
        <div className="grid gap-4">
          <div className="rounded-card border border-line bg-white p-5">
            <h1 className="font-display text-xl font-black leading-tight text-ink">{product.title}</h1>

            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <AyWebsPrice amount={product.price} currency={product.currency} tnd={product.ayrovi_pricing?.total_tnd ?? null} className="text-base" />
            </div>
            {product.ayrovi_pricing && (
              <p className="mt-1 text-micro font-bold uppercase tracking-[0.12em] text-muted">
                {tr('Devis AYROVI recalculé côté serveur · version ', 'عرض سعر AYROVI محتسب على الخادم · الإصدار ')}
                {product.ayrovi_pricing.pricing_version}
              </p>
            )}

            <div className="mt-4">
              <AvailabilityBadge state={availability} reason={product.availability?.reason || ''} tr={tr} />
            </div>

            {/* ---- Variantes libres (§13) ---- */}
            {groups.length > 0 && (
              <div className="mt-5 grid gap-4">
                {groups.map((group) => (
                  <div key={group.attribute}>
                    <h2 className="text-xs font-black uppercase tracking-[0.12em] text-ink">
                      {attributeLabel(group.attribute, tr)}
                      {!selected[group.attribute] && <span className="ms-2 text-danger">{tr('à choisir', 'مطلوب الاختيار')}</span>}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.values.map((value) => {
                        const active = selected[group.attribute] === value;
                        const image = product.variants.find((option) => option.attribute === group.attribute && option.value === value)?.image || null;
                        return (
                          <button
                            key={`${group.attribute}-${value}`}
                            type="button"
                            onClick={() => chooseVariant(group.attribute, value)}
                            aria-pressed={active}
                            className={`flex min-h-11 items-center gap-2 rounded-control border px-3 text-xs font-black transition ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'}`}
                          >
                            {image && <img src={image} alt="" className="h-6 w-6 rounded-control border border-line object-cover" loading="lazy" />}
                            {value}
                            {variantAvailability.get(`${group.attribute}:${value}`) === undefined && (
                              <span className={`text-micro font-bold ${active ? 'text-white/70' : 'text-muted'}`}>{tr('non publié', 'غير منشور')}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Quantité ---- */}
            <div className="mt-5 flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2">
              <span className="text-xs font-black text-ink">{tr('Quantité', 'الكمية')}</span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => changeQuantity(-1)} disabled={quantity <= 1} className="grid h-9 w-9 place-items-center rounded-control border border-line bg-white text-ink transition disabled:opacity-35" aria-label={tr('Diminuer', 'إنقاص')}>
                  <Minus className="h-4 w-4" />
                </button>
                <strong className="min-w-8 text-center text-sm font-black text-ink">{quantity}</strong>
                <button type="button" onClick={() => changeQuantity(1)} disabled={quantity >= 99} className="grid h-9 w-9 place-items-center rounded-control border border-line bg-white text-ink transition disabled:opacity-35" aria-label={tr('Augmenter', 'زيادة')}>
                  <Plus className="h-4 w-4" />
                </button>
              </span>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-black text-ink">{tr('Note pour l’acheteur AYROVI (facultatif)', 'ملاحظة لمشتري AYROVI (اختياري)')}</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder={tr('Ex. : emballage cadeau, taille à vérifier…', 'مثال: تغليف هدية، تحقق من المقاس…')}
                className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-xs font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
              />
            </label>

            {/* ---- Ajout au panier : machine à états §15 ---- */}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void addToCart()}
                disabled={!canAdd}
                className="ay-btn-cta flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                {addState === 'ADDING' ? <Loader2 className="h-5 w-5 animate-spin" /> : addState === 'ADDED' ? <CheckCircle2 className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                {addLabel(addState, outOfStock, selectionRequired && !selectionComplete, tr)}
              </button>

              {addState === 'ADDED' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => { setAddState('IDLE'); setAddedItemNumber(''); }} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                    <RefreshCw className="h-4 w-4" />
                    {tr('Continuer mes achats', 'مواصلة التسوق')}
                  </button>
                  <button type="button" onClick={onOpenCart} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                    <ShoppingBag className="h-4 w-4" />
                    {tr('Voir mon panier AyWebs', 'عرض سلة AyWebs')}
                  </button>
                </div>
              )}

              {addState === 'FAILED' && (
                <button type="button" onClick={() => void load(selected, quantity)} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                  <RefreshCw className="h-4 w-4" />
                  {tr('Réessayer', 'إعادة المحاولة')}
                </button>
              )}
            </div>

            {addMessage && (
              <div className="mt-3">
                <AyWebsNotice tone={addState === 'ADDED' ? 'success' : 'danger'}>
                  {addMessage}{addedItemNumber ? <> · <bdi className="ay-number">{addedItemNumber}</bdi></> : ''}
                </AyWebsNotice>
              </div>
            )}

            {outOfStock && (
              <div className="mt-3">
                <AyWebsNotice tone="danger">
                  {tr('Cet article est épuisé chez le marchand : l’ajout est désactivé, aucune substitution automatique.', 'هذا المنتج نفد من المتجر: تمت تعطيل الإضافة، ولا يتم استبداله تلقائيًا.')}
                </AyWebsNotice>
              </div>
            )}
            {availability === 'UNKNOWN' && (
              <div className="mt-3">
                <AyWebsNotice tone="info">
                  {tr('Le marchand ne publie pas le stock de cette version. AYROVI le vérifie avant l’achat et vous prévient.', 'المتجر لا يعلن مخزون هذه النسخة. يتحقق AYROVI قبل الشراء ويبلغك.')}
                </AyWebsNotice>
              </div>
            )}
            {product.purchase_mode !== 'SUPPORTED' && (
              <div className="mt-3">
                <AyWebsNotice tone="warning">
                  {tr('L’achat sur cette boutique passe par une revue AYROVI : aucun achat automatique n’est simulé.', 'الشراء من هذا المتجر يمر بمراجعة AYROVI: لا توجد محاكاة لشراء آلي.')}
                </AyWebsNotice>
              </div>
            )}
          </div>

          <button type="button" onClick={() => onOpenRequestForm({ url: product.source_url, storeName: product.store_name })} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
            <ReceiptText className="h-4 w-4" />
            {tr('Signaler un problème sur ce produit', 'أبلغ عن مشكلة في هذا المنتج')}
          </button>

          {error instanceof AyWebsRequestError && (
            <p className="flex items-start gap-2 text-micro font-semibold leading-5 text-muted">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error.contract?.technicalMessage || error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

function addLabel(state: AddState, outOfStock: boolean, selectionMissing: boolean, tr: (fr: string, ar: string) => string): string {
  if (outOfStock) return tr('Épuisé chez le marchand', 'نفد من المتجر');
  if (selectionMissing) return tr('Choisissez une version', 'اختر نسخة');
  switch (state) {
    case 'ADDING': return tr('Ajout en cours…', 'جارٍ الإضافة…');
    case 'ADDED': return tr('Ajouté au panier AyWebs', 'أُضيف إلى سلة AyWebs');
    default: return tr('Ajouter au panier AyWebs', 'أضف إلى سلة AyWebs');
  }
}

function attributeLabel(attribute: string, tr: (fr: string, ar: string) => string): string {
  switch (attribute.toLowerCase()) {
    case 'color': return tr('Couleur', 'اللون');
    case 'size': return tr('Taille', 'المقاس');
    case 'style': return tr('Style', 'الطراز');
    case 'model': return tr('Modèle', 'الموديل');
    case 'format': return tr('Format', 'الصيغة');
    case 'pack': return tr('Lot', 'العبوة');
    case 'capacity': return tr('Capacité', 'السعة');
    case 'material': return tr('Matière', 'الخامة');
    default: return attribute;
  }
}

function purchaseModeLabel(mode: string, tr: (fr: string, ar: string) => string): string {
  switch (mode) {
    case 'SUPPORTED': return tr('Achat pris en charge', 'شراء مدعوم');
    case 'MANUAL_REVIEW': return tr('Achat avec revue AYROVI', 'شراء بمراجعة AYROVI');
    case 'URL_REQUEST': return tr('Demande avec URL', 'طلب بالرابط');
    default: return tr('Non implémenté', 'غير منفّذ');
  }
}

const AvailabilityBadge: React.FC<{ state: string; reason: string; tr: (fr: string, ar: string) => string }> = ({ state, reason, tr }) => {
  const map: Record<string, { label: string; className: string }> = {
    AVAILABLE: { label: tr('Disponible chez le marchand', 'متوفر لدى المتجر'), className: 'border-success/30 bg-success/5 text-ink' },
    LOW_STOCK: { label: tr('Stock faible', 'كمية محدودة'), className: 'border-line bg-surface text-ink' },
    OUT_OF_STOCK: { label: tr('Épuisé', 'غير متوفر'), className: 'border-danger/30 bg-danger/5 text-ink' },
    UNKNOWN: { label: tr('Stock non publié', 'المخزون غير معلن'), className: 'border-line bg-surface text-muted' },
  };
  const entry = map[state] || map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-black ${entry.className}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {entry.label}
      {reason && <span className="font-semibold text-muted">· {reason}</span>}
    </span>
  );
};
