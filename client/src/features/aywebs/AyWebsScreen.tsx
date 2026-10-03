import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from '../../design/AppHeader';
import {
  AlertCircle,
  AyWebs,
  Camera,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShoppingBag,
} from '../../components/QatafoIcons';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useLocale } from '../../i18n/LocaleContext';
import { detectAyWebsStore } from '../../../../shared/aywebsStores';
import {
  AyWebsApiError,
  getAyWebsCart,
  getAyWebsStores,
  setAyWebsCsrfToken,
  trackAyWebsEvent,
  type AyWebsFeatures,
  type AyWebsProductPayload,
  type AyWebsStore,
} from './api';
import { AyWebsHome } from './components/AyWebsHome';
import { AyWebsStoreBrowser } from './components/AyWebsStoreBrowser';
import { AyWebsProductSheet } from './components/AyWebsProductSheet';
import { openMerchantPage } from '../../services/nativeShell';
import { AyWebsCartScreen } from './components/AyWebsCartScreen';
import { AyWebsCheckoutScreen } from './components/AyWebsCheckoutScreen';
import { AyWebsOrdersScreen } from './components/AyWebsOrdersScreen';
import { AyWebsRequestForm } from './components/AyWebsRequestForm';

/**
 * AYWEBs — hôte de navigation (§5, §6).
 *
 * Un seul écran AYROVI, une seule authentification, un seul panier AYROVI :
 * AYWEBs ajoute des VUES internes (Accueil → Boutique → Navigateur → Fiche
 * produit → Panier AyWebs → Paiement → Achats → Demande avec URL), sans écran
 * supprimé ni module remplacé (§2).
 *
 * continue d'alimenter la confirmation produit AYROVI existante.
 */


/** Vues internes AYWEBs. `capture` = flux historique conservé. */
export type AyWebsView =
  | 'home'
  | 'browser'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'request';

interface AyWebsScreenProps {
  onClose: () => void;
  onOpenCart: () => void;
  cartCount: number;
  /** Session client AYROVI existante : AYWEBs n'ouvre jamais un second compte (§2). */
  authenticated?: boolean;
  onRequireSignIn?: () => void;
  /** Jeton CSRF de la session AYROVI, injecté dans les écritures AYWEBs (§45). */
  customerCsrfToken?: string;
}

const DEFAULT_FEATURES: AyWebsFeatures = {
  enabled: true,
  capture_enabled: true,
  ocr_fallback_enabled: true,
  ai_extraction_enabled: false,
};

const VIEW_SUBTITLES: Record<AyWebsView, { fr: string; ar: string }> = {
  home: { fr: 'Shopping Browser par AYROVI', ar: 'متصفح التسوق من AYROVI' },
  browser: { fr: 'Boutique externe', ar: 'المتجر الخارجي' },
  product: { fr: 'Fiche produit détectée', ar: 'بطاقة المنتج المكتشف' },
  cart: { fr: 'Panier AyWebs', ar: 'سلة AyWebs' },
  checkout: { fr: 'Paiement AYROVI', ar: 'الدفع عبر AYROVI' },
  orders: { fr: 'Mes achats AyWebs', ar: 'مشترياتي في AyWebs' },
  request: { fr: 'Demande avec URL', ar: 'طلب بالرابط' },
};

function normalizedUrl(value: string): string | null {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed) ? `https://${trimmed}` : '';
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface AyWebsDeepLink {
  view: AyWebsView;
  /** URL externe à faire analyser par le serveur (partage Android, §24). */
  url?: string;
  storeId?: string | null;
  orderNumber?: string;
  requestMode?: 'purchase' | 'store';
  prefill?: { url?: string; storeName?: string };
}

/**
 * §25 — Deep Link Handler.
 *
 * `ayrovi://aywebs`, `/aywebs/product?url=…`, `/aywebs/cart`, `/aywebs/order/AYW-000456`
 * arrivent ici sous forme de route web (la coque native traduit le lien, elle ne
 * décide rien). Cette fonction ne devine ni boutique ni produit : elle lit le
 * chemin et les paramètres, et laisse le pont de détection serveur trancher.
 */
export function resolveAyWebsDeepLink(location: { pathname: string; search: string }): AyWebsDeepLink | null {
  const params = new URLSearchParams(location.search);
  const shared = (params.get('url') || params.get('text') || '').trim();
  const segments = location.pathname.split('/').filter(Boolean);
  const isAyWebsRoute = (segments[0] || '').toLowerCase() === 'aywebs';
  if (!isAyWebsRoute) return shared ? { view: 'home', url: shared } : null;

  const section = (segments[1] || '').toLowerCase();
  const targetUrl = (params.get('url') || params.get('product_url') || '').trim();
  const storeId = params.get('store') || params.get('store_id') || '';

  switch (section) {
    case '':
    case 'home':
      return shared ? { view: 'home', url: shared } : { view: 'home' };
    case 'store':
    case 'browse':
    case 'browser':
      return { view: 'browser', ...(targetUrl ? { url: targetUrl } : {}), storeId: storeId || null };
    case 'product':
      return targetUrl
        ? { view: 'product', url: targetUrl, storeId: storeId || null }
        : { view: 'home' };
    case 'cart':
      return { view: 'cart' };
    case 'checkout':
      return { view: 'checkout' };
    case 'order':
    case 'orders': {
      const reference = segments[2] ? decodeURIComponent(segments[2]) : (params.get('order') || params.get('order_number') || '');
      return { view: 'orders', ...(reference ? { orderNumber: reference } : {}) };
    }
    case 'request': {
      const mode = (params.get('mode') || '').toLowerCase() === 'store' ? 'store' : 'purchase';
      const url = targetUrl || shared;
      const storeName = params.get('store_name') || params.get('store') || '';
      return {
        view: 'request',
        requestMode: mode,
        ...(url ? { prefill: { url, ...(storeName && mode === 'store' ? { storeName } : {}) } } : {}),
      };
    }
    case 'capture':
      // Lien historique : atterrit dans le navigateur AYWEBs (§9), plus de vue dédiée.
      return { view: 'browser' };
    default:
      return { view: 'home' };
  }
}

/** AYROVI-owned shopping-browser entry. External stores are opened in a supported
 * browser flow; product capture and confirmation remain inside the AYROVI session. */
export const AyWebsScreen: React.FC<AyWebsScreenProps> = ({
  onClose,
  onOpenCart,
  cartCount,
  authenticated = false,
  onRequireSignIn,
  customerCsrfToken = '',
}) => {
  const { tr, direction } = useLocale();
  const [view, setView] = useState<AyWebsView>('home');
  const [stack, setStack] = useState<AyWebsView[]>([]);
  const [stores, setStores] = useState<AyWebsStore[]>([]);
  const [features, setFeatures] = useState<AyWebsFeatures>(DEFAULT_FEATURES);
  const [registryOffline, setRegistryOffline] = useState(false);
  const [ayWebsCartCount, setAyWebsCartCount] = useState(0);
  const [browserStoreId, setBrowserStoreId] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | undefined>(undefined);
  const [productTarget, setProductTarget] = useState<{ url: string; storeId: string | null } | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [requestMode, setRequestMode] = useState<'purchase' | 'store'>('purchase');
  const [requestPrefill, setRequestPrefill] = useState<{ url?: string; storeName?: string } | undefined>(undefined);
  /** URL partagée en attente du registre : la détection de boutique est serveur. */
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  useBodyScrollLock(true);

  const browserStore = useMemo(
    () => stores.find((store) => store.id === browserStoreId) || null,
    [browserStoreId, stores],
  );

  const go = useCallback((next: AyWebsView) => {
    setStack((current) => [...current, view]);
    setView(next);
  }, [view]);

  const back = useCallback(() => {
    const previous = stack[stack.length - 1] || 'home';
    setStack(stack.slice(0, -1));
    setView(previous);
  }, [stack]);

  /** Le compteur du panier AyWebs vient du serveur : jamais un chiffre inventé. */
  const refreshCartCount = useCallback(async () => {
    try {
      const cart = await getAyWebsCart();
      setAyWebsCartCount(cart.totals?.units || cart.items?.length || 0);
    } catch {
      // Panier illisible (session, réseau) : on garde le dernier état connu.
    }
  }, []);

  useEffect(() => {
    trackAyWebsEvent('aywebs_open');
    const controller = new AbortController();
    void getAyWebsStores(controller.signal).then((result) => {
      setStores(result.stores);
      setFeatures(result.features || DEFAULT_FEATURES);
      setRegistryOffline(result.offline);
    }).catch(() => undefined);
    void refreshCartCount();
    return () => controller.abort();
  }, [refreshCartCount]);

  useEffect(() => { setAyWebsCsrfToken(customerCsrfToken || ''); }, [customerCsrfToken]);

  const openStore = useCallback((store: AyWebsStore | null, url?: string) => {
    setBrowserStoreId(store?.id || null);
    setBrowserUrl(url);
    go('browser');
  }, [go]);

  const openProduct = useCallback((url: string, storeId?: string | null) => {
    const target = normalizedUrl(url);
    if (!target) return;
    setProductTarget({ url: target, storeId: storeId || null });
    go('product');
  }, [go]);

  const openRequest = useCallback((mode: 'purchase' | 'store', prefill?: { url?: string; storeName?: string }) => {
    setRequestMode(mode);
    setRequestPrefill(prefill);
    go('request');
  }, [go]);

  /** §25 : l'emplacement d'ouverture choisit la vue AYWEBs, une seule fois. */
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const link = resolveAyWebsDeepLink({ pathname: window.location.pathname, search: window.location.search });
    if (!link) return;
    deepLinkHandled.current = true;
    // Une URL externe partagée attend le registre : la détection est serveur (§11).
    if (link.view === 'home' && link.url) {
      setPendingSharedUrl(link.url);
      return;
    }
    if (link.view === 'product' && link.url) setProductTarget({ url: link.url, storeId: link.storeId || null });
    if (link.view === 'browser') {
      if (link.url) setBrowserUrl(link.url);
      if (link.storeId) setBrowserStoreId(link.storeId);
    }
    if (link.view === 'orders' && link.orderNumber) setOrderNumber(link.orderNumber);
    if (link.view === 'request') {
      setRequestMode(link.requestMode || 'purchase');
      setRequestPrefill(link.prefill);
    }
    setView(link.view);
    window.history.replaceState(window.history.state, '', '/aywebs');
  }, []);

  /**
   * §24 — partage Android / lien portant une URL externe.
   * Boutique du registre → navigateur AYWEBs, qui fait analyser la page par le
   * serveur (`POST /page/analyze`) et propose la fiche produit si elle est
   * détectée. Boutique inconnue → demande d'achat avec l'URL (§23) : ni faux
   * succès, ni capture silencieuse.
   */
  useEffect(() => {
    if (!pendingSharedUrl || !stores.length) return;
    const shared = pendingSharedUrl;
    setPendingSharedUrl(null);
    window.history.replaceState(window.history.state, '', '/aywebs');
    // Android envoie souvent le texte complet du partage (« Regarde ça https://… ») :
    // l'URL exacte en est extraite, puis le registre tranche — jamais l'inverse.
    const extracted = shared.match(/https?:\/\/[^\s<>]+/i)?.[0] || shared;
    const url = normalizedUrl(extracted.replace(/['"<>),;]+$/, ''));
    if (!url || !features.enabled) return;
    const registered = detectAyWebsStore(url);
    const store = registered ? stores.find((item) => item.id === registered.id) || null : null;
    if (!store) {
      trackAyWebsEvent('product_page_detected', { code: 'STORE_NOT_REGISTERED' });
      setRequestMode('purchase');
      setRequestPrefill({ url });
      setView('request');
      return;
    }
    trackAyWebsEvent('product_page_detected', { store: store.id });
    setBrowserStoreId(store.id);
    setBrowserUrl(url);
    setView('browser');
  }, [features.enabled, pendingSharedUrl, stores]);

  const requireSignIn = useCallback(() => {
    if (onRequireSignIn) onRequireSignIn();
    else onClose();
  }, [onClose, onRequireSignIn]);

  const subtitle = VIEW_SUBTITLES[view];

  return (
    <section
      className="fixed inset-0 z-[25] overflow-y-auto bg-surface pb-[calc(5rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="AyWebs"
      data-app-route="aywebs"
      dir={direction}
    >
      <AppHeader
        title="AyWebs"
        subtitle={tr(subtitle.fr, subtitle.ar)}
        onBack={stack.length ? back : onClose}
        backPlacement="leading"
        sticky
        actions={(
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go('cart')}
              className="relative grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-ink-deep/5 active:scale-[0.96]"
              aria-label={tr('Ouvrir le panier AyWebs', 'فتح سلة AyWebs')}
              title={tr('Panier AyWebs', 'سلة AyWebs')}
            >
              <AyWebs className="h-7 w-7" />
              {ayWebsCartCount > 0 && (
                <span className="absolute end-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-micro font-black leading-none text-white">
                  {ayWebsCartCount > 99 ? '99+' : ayWebsCartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenCart}
              className="relative grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-ink-deep/5 active:scale-[0.96]"
              aria-label={tr('Ouvrir le panier AYROVI', 'فتح سلة AYROVI')}
              title={tr('Panier AYROVI', 'سلة AYROVI')}
            >
              <ShoppingBag className="h-7 w-7" />
              {cartCount > 0 && (
                <span className="absolute end-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-micro font-black leading-none text-white" aria-label={tr(`${cartCount} article(s)`, `${cartCount} منتج`)}>
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          </div>
        )}
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {view === 'home' && (
          <AyWebsHome
            features={features}
            onOpenStore={(store) => openStore(store, store.home_url)}
            onOpenBrowser={(store) => openStore(store || null, store?.home_url)}
            onOpenProduct={openProduct}
            onOpenCart={() => go('cart')}
            onOpenOrders={() => go('orders')}
            onOpenRequestForm={(prefill) => openRequest('purchase', prefill)}
          />
        )}

        {view === 'browser' && (
          <AyWebsStoreBrowser
            store={browserStore}
            initialUrl={browserUrl}
            features={features}
            cartCount={ayWebsCartCount}
            onBack={back}
            onOpenProduct={openProduct}
            onOpenCart={() => go('cart')}
            onOpenRequestForm={(prefill) => openRequest('purchase', prefill)}
            onStoreDetected={setBrowserStoreId}
          />
        )}

        {view === 'product' && productTarget && (
          <AyWebsProductSheet
            url={productTarget.url}
            storeId={productTarget.storeId}
            onBack={back}
            onOpenCart={() => go('cart')}
            onOpenRequestForm={(prefill) => openRequest('purchase', prefill)}
          />
        )}

        {view === 'cart' && (
          <AyWebsCartScreen
            onBack={back}
            onCheckout={() => go('checkout')}
            onOpenAyroviCart={onOpenCart}
            onOpenProduct={openProduct}
            onOpenOrders={() => go('orders')}
            onCartChanged={(count) => setAyWebsCartCount(count)}
          />
        )}

        {view === 'checkout' && (
          <AyWebsCheckoutScreen
            authenticated={authenticated}
            onBack={back}
            onOpenCart={() => go('cart')}
            onOpenOrders={() => go('orders')}
            onRequireSignIn={requireSignIn}
          />
        )}

        {view === 'orders' && (
          <AyWebsOrdersScreen
            authenticated={authenticated}
            initialOrderNumber={orderNumber}
            onBack={back}
            onOpenProduct={openProduct}
            onRequireSignIn={requireSignIn}
          />
        )}

        {view === 'request' && (
          <AyWebsRequestForm
            mode={requestMode}
            prefill={requestPrefill}
            onBack={back}
            onSwitchMode={setRequestMode}
            onOrderReady={() => void refreshCartCount()}
          />
        )}

      </main>
    </section>
  );
};

/* ================================================================== *
 * Capture par lien — flux historique AYROVI, conservé intact (§2)
 * ================================================================== */
