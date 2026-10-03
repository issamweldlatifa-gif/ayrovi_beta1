import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ExternalLink, Hourglass, Package, ReceiptText, Search, ShoppingBag,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  getAyWebsHome, trackAyWebsEvent, trackAyWebsShoppingEvent,
  type AyWebsFeatures, type AyWebsHomePayload, type AyWebsStore,
} from '../api';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs Home (§6).
 *
 * L'écran n'est pas une liste codée en dur : boutiques populaires, catégories,
 * visites récentes, produits récemment détectés, panier et commandes viennent de
 * `/api/v1/aywebs/home`, qui lit le Store Registry et les tables `ayweb_*`.
 * La recherche accepte un nom de boutique OU un lien produit — un lien est
 * analysé par le pont de détection (§11), jamais deviné côté client.
 */

export interface AyWebsHomeProps {
  onOpenStore: (store: AyWebsStore) => void;
  onOpenProduct: (url: string, storeId?: string | null) => void;
  onOpenCart: () => void;
  onOpenOrders: () => void;
  onOpenRequestForm: (prefill?: { url?: string; storeName?: string }) => void;
  onOpenBrowser: (store?: AyWebsStore | null) => void;
  features: AyWebsFeatures;
}

type Phase = 'loading' | 'ready' | 'error';

export const AyWebsHome: React.FC<AyWebsHomeProps> = ({
  onOpenStore, onOpenProduct, onOpenCart, onOpenOrders, onOpenRequestForm, onOpenBrowser, features,
}) => {
  const { tr, formatDate } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<unknown>(null);
  const [home, setHome] = useState<AyWebsHomePayload | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const result = await getAyWebsHome();
      setHome(result.data);
      setPhase('ready');
    } catch (caught) {
      setError(caught);
      setPhase('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stores = useMemo(() => {
    const all = home?.stores || [];
    const needle = query.trim().toLowerCase();
    const inCategory = category ? all.filter((store) => (store.categories || []).includes(category)) : all;
    if (!needle) return inCategory;
    return inCategory.filter((store) =>
      store.name.toLowerCase().includes(needle)
      || store.id.includes(needle)
      || (store.domains || []).some((domain) => domain.includes(needle)));
  }, [category, home, query]);



  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const match = stores[0];
    if (match) {
      trackAyWebsEvent('store_selected', { store: match.id });
      onOpenStore(match);
    }
  };

  if (phase === 'loading') return <AyWebsLoading label={tr('Préparation de votre espace AyWebs…', 'جارٍ تجهيز مساحة AyWebs…')} />;
  if (phase === 'error' || !home) {
    return (
      <AyWebsErrorState
        error={error}
        onRetry={() => void load()}
        actions={(
          <button type="button" onClick={() => onOpenRequestForm({})} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
            <ReceiptText className="h-4 w-4" />
            {tr('Demander un achat avec URL', 'اطلب الشراء بالرابط')}
          </button>
        )}
      />
    );
  }

  return (
    <div className="grid gap-6">
      {/* ---- Recherche : nom de boutique ou lien produit ---- */}
      <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tr('Rechercher une boutique ou coller un lien', 'ابحث عن متجر أو الصق رابطًا')}</span>
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr('Rechercher une boutique', 'ابحث عن متجر')}
            className="h-12 w-full rounded-control border border-line bg-surface pe-4 ps-12 text-sm font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <button type="submit" disabled={!query.trim() || searching} className="ay-btn-cta flex h-12 min-w-40 items-center justify-center gap-2 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45">
          <Search className="h-5 w-5" />
          {tr('Ouvrir la boutique', 'افتح المتجر')}
        </button>
      </form>

      {!features.capture_enabled && (
        <AyWebsNotice tone="warning">
          {tr('La capture est temporairement désactivée : la navigation et les demandes avec URL restent ouvertes.', 'الالتقاط متوقف مؤقتًا: التصفح والطلبات بالرابط ما زالا متاحين.')}
        </AyWebsNotice>
      )}

      {/* ---- Panier + commandes : l'état réel, pas un compteur décoratif ---- */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label={tr('Votre activité AyWebs', 'نشاطك في AyWebs')}>
        <button type="button" onClick={onOpenCart} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-start transition hover:border-ink/40">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface text-ink"><ShoppingBag className="h-6 w-6" /></span>
          <span className="min-w-0">
            <strong className="block text-sm font-black text-ink">{tr('Panier AyWebs', 'سلة AyWebs')}</strong>
            <span className="block truncate text-xs font-semibold text-muted">
              {home.cart.items_count > 0
                ? tr(`${home.cart.items_count} ligne(s) · ${home.cart.units} article(s)`, `${home.cart.items_count} سطر · ${home.cart.units} منتج`)
                : tr('Vide pour le moment', 'فارغة حاليًا')}
            </span>
            {home.cart.blocked_items > 0 && (
              <span className="mt-1 block text-micro font-black uppercase tracking-[0.12em] text-danger">
                {tr(`${home.cart.blocked_items} à corriger`, `${home.cart.blocked_items} تحتاج تصحيح`)}
              </span>
            )}
          </span>
        </button>

        <button type="button" onClick={onOpenOrders} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-start transition hover:border-ink/40">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface text-ink"><Package className="h-6 w-6" /></span>
          <span className="min-w-0">
            <strong className="block text-sm font-black text-ink">{tr('Mes achats AyWebs', 'مشترياتي في AyWebs')}</strong>
            <span className="block truncate text-xs font-semibold text-muted">{tr('Suivi et justificatifs', 'المتابعة والإثباتات')}</span>
          </span>
        </button>

        <button type="button" onClick={() => onOpenBrowser(null)} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-start transition hover:border-ink/40">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface text-ink"><ExternalLink className="h-6 w-6" /></span>
          <span className="min-w-0">
            <strong className="block text-sm font-black text-ink">{tr('Shopping Browser', 'متصفح التسوق')}</strong>
            <span className="block truncate text-xs font-semibold text-muted">{tr('Parcourir une boutique externe', 'تصفّح متجرًا خارجيًا')}</span>
          </span>
        </button>
      </section>

      {/* ---- Catégories : filtrent le registre, rien n'est figé dans l'écran ---- */}
      {home.categories.length > 0 && (
        <section aria-labelledby="aywebs-home-categories">
          <h2 id="aywebs-home-categories" className="font-display text-lg font-black text-ink">{tr('Catégories', 'الفئات')}</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={`shrink-0 rounded-control border px-3 py-2 text-xs font-black transition ${category === null ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'}`}
            >
              {tr('Toutes', 'الكل')}
            </button>
            {home.categories.map((item) => {
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(active ? null : item.id)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-control border px-3 py-2 text-xs font-black transition ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'}`}
                >
                  {item.label || tr(String(item.labelFr || item.id), String(item.labelAr || item.id))}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Boutiques populaires ---- */}
      <section aria-labelledby="aywebs-home-popular">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="aywebs-home-popular" className="font-display text-lg font-black text-ink">{tr('Boutiques populaires', 'المتاجر الأكثر استخدامًا')}</h2>
            <p className="mt-1 text-xs font-medium text-muted">{tr('Le registre centralisé décide du niveau d’intégration de chaque boutique.', 'السجل المركزي يحدد مستوى دعم كل متجر.')}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(home.popular_stores.length ? home.popular_stores : stores).slice(0, 8).map((store) => (
            <StoreCard key={store.id} store={store} onOpen={() => onOpenStore(store)} tr={tr} />
          ))}
        </div>
      </section>

      {/* ---- Toutes les boutiques (filtrées) ---- */}
      <section aria-labelledby="aywebs-home-stores">
        <h2 id="aywebs-home-stores" className="font-display text-lg font-black text-ink">
          {category ? tr('Boutiques de la catégorie', 'متاجر الفئة') : tr('Toutes les boutiques', 'كل المتاجر')}
        </h2>
        {stores.length === 0 ? (
          <p className="mt-3 rounded-control border border-line bg-surface px-4 py-6 text-center text-sm font-semibold text-muted">
            {tr('Aucune boutique ne correspond. Vous pouvez demander un achat avec URL.', 'لا يوجد متجر مطابق. يمكنك طلب الشراء بالرابط.')}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} onOpen={() => onOpenStore(store)} tr={tr} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Récents : visites et produits détectés ---- */}
      {(home.recent_stores.length > 0 || home.recent_products.length > 0) && (
        <section className="grid gap-5 lg:grid-cols-2" aria-labelledby="aywebs-home-recent">
          <h2 id="aywebs-home-recent" className="sr-only">{tr('Reprendre où vous en étiez', 'أكمل من حيث توقفت')}</h2>
          {home.recent_stores.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black text-ink"><Hourglass className="h-4 w-4" />{tr('Visitées récemment', 'زرتها مؤخرًا')}</h3>
              <ul className="mt-2 grid gap-2">
                {home.recent_stores.map((recent) => (
                  <li key={`${recent.storeId}-${recent.url || ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const store = home.stores.find((candidate) => candidate.id === recent.storeId);
                        if (store) onOpenStore(store);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-control border border-line bg-white px-3 py-2 text-start transition hover:border-ink/40"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-xs font-black text-ink">{recent.storeName || recent.storeId}</strong>
                        <span className="block truncate text-micro font-semibold text-muted">{recent.url || recent.storeId}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {home.recent_products.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black text-ink"><Search className="h-4 w-4" />{tr('Produits détectés récemment', 'منتجات تم اكتشافها مؤخرًا')}</h3>
              <ul className="mt-2 grid gap-2">
                {home.recent_products.map((product) => (
                  <li key={product.product_id}>
                    <button
                      type="button"
                      onClick={() => onOpenProduct(product.source_url || product.product_id, product.store_id)}
                      className="flex w-full items-center gap-3 rounded-control border border-line bg-white p-2 text-start transition hover:border-ink/40"
                    >
                      {product.image
                        ? <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-control border border-line object-cover" loading="lazy" />
                        : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control border border-line bg-surface text-muted"><Package className="h-5 w-5" /></span>}
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs font-black text-ink">{product.title}</strong>
                        <span className="block truncate text-micro font-semibold text-muted">
                          {product.store_name} · {product.price.toFixed(2)} {product.currency}
                          {product.pricing_tnd > 0 ? ` · ≈ ${product.pricing_tnd.toFixed(2)} TND` : ''}
                        </span>
                        <span className="block truncate text-micro font-bold uppercase tracking-[0.1em] text-muted">
                          {availabilityLabel(product.availability, tr)} · {formatDate(product.resolved_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ---- Demande d'achat / de boutique (§23, §38) ---- */}
      <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="aywebs-home-request">
        <h2 id="aywebs-home-request" className="font-display text-base font-black text-ink">{tr('Boutique absente ou produit non capturable ?', 'المتجر غير موجود أو المنتج لا يمكن التقاطه؟')}</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted">
          {tr(
            'Envoyez le lien exact : AYROVI traite l’achat manuellement et vous répond avec un devis ou une raison de refus. Aucun achat n’est simulé.',
            'أرسل الرابط المباشر: يتولى AYROVI عملية الشراء يدويًا ويرد عليك بعرض سعر أو بسبب الرفض. لا تتم محاكاة أي عملية شراء.',
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpenRequestForm({ url: '' })} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
            <ReceiptText className="h-4 w-4" />
            {tr('Demander un achat avec URL', 'اطلب الشراء بالرابط')}
          </button>
          <button type="button" onClick={() => onOpenRequestForm({ storeName: query.trim() })} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
            <ExternalLink className="h-4 w-4" />
            {tr('Demander une boutique', 'اطلب إضافة متجر')}
          </button>
        </div>
      </section>
    </div>
  );
};

function availabilityLabel(state: string, tr: (fr: string, ar: string) => string): string {
  switch (state) {
    case 'AVAILABLE': return tr('Disponible', 'متوفر');
    case 'LOW_STOCK': return tr('Stock faible', 'كمية محدودة');
    case 'OUT_OF_STOCK': return tr('Épuisé', 'غير متوفر');
    default: return tr('Stock non publié', 'المخزون غير معلن');
  }
}

const StoreCard: React.FC<{ store: AyWebsStore; onOpen: () => void; tr: (fr: string, ar: string) => string }> = ({ store, onOpen, tr }) => {
  const integration = integrationLabel(store.integration_type, tr);
  return (
    <button
      type="button"
      onClick={() => {
        trackAyWebsEvent('store_selected', { store: store.id });
        trackAyWebsShoppingEvent('store_opened', { store: store.id });
        onOpen();
      }}
      className="flex h-full flex-col gap-2 rounded-card border border-line bg-white p-4 text-start transition hover:border-ink/40"
    >
      <span className="flex items-center gap-2">
        {store.logo
          ? <img src={store.logo} alt="" className="h-9 w-9 shrink-0 rounded-control border border-line object-cover" loading="lazy" />
          : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control border border-line bg-surface text-micro font-black text-ink">{store.name.slice(0, 2).toUpperCase()}</span>}
        <span className="min-w-0">
          <strong className="block truncate text-sm font-black text-ink">{store.display_name || store.name}</strong>
          <span className="block truncate text-micro font-bold uppercase tracking-[0.12em] text-muted">{store.country} · {store.currency}</span>
        </span>
      </span>
      <span className={`mt-auto inline-flex w-fit rounded-control border px-2 py-1 text-micro font-black uppercase tracking-[0.1em] ${store.capture_supported ? 'border-success/30 bg-success/5 text-ink' : 'border-line bg-surface text-muted'}`}>
        {integration}
      </span>
    </button>
  );
};

/** §7 : le niveau d'intégration vient du registre, il est dit au client. */
function integrationLabel(type: string | undefined, tr: (fr: string, ar: string) => string): string {
  switch (String(type || '').toUpperCase()) {
    case 'SUPPORTED': return tr('Prise en charge', 'مدعوم');
    case 'PARTIALLY_SUPPORTED': return tr('Partielle', 'دعم جزئي');
    case 'GENERIC': return tr('Lecture générique', 'قراءة عامة');
    case 'URL_REQUEST': return tr('Sur demande avec URL', 'بالطلب عبر الرابط');
    case 'BLOCKED': return tr('Non disponible', 'غير متاح');
    default: return tr('Navigation', 'تصفح');
  }
}
