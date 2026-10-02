import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from '../../design/AppHeader';
import {
  AlertCircle,
  AyWebs,
  Camera,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShoppingBag,
} from '../../components/QatafoIcons';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useLocale } from '../../i18n/LocaleContext';
import type { ScrapedProduct } from '../../types';
import { detectAyWebsStore } from '../../../../shared/aywebsStores';
import {
  AyWebsApiError,
  captureAyWebsProduct,
  getAyWebsStores,
  trackAyWebsEvent,
  type AyWebsFeatures,
  type AyWebsStore,
} from './api';

export type AyWebsCaptureState =
  | 'IDLE'
  | 'CAPTURING'
  | 'EXTRACTING'
  | 'VALIDATING'
  | 'NEEDS_SELECTION'
  | 'READY'
  | 'FAILED'
  | 'UNSUPPORTED';

interface AyWebsScreenProps {
  onClose: () => void;
  onOpenCart: () => void;
  onCaptured: (product: ScrapedProduct) => void;
  onUploadScreenshot: () => void;
  cartCount: number;
}

const DEFAULT_FEATURES: AyWebsFeatures = {
  enabled: true,
  capture_enabled: true,
  ocr_fallback_enabled: true,
  ai_extraction_enabled: false,
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

/** AYROVI-owned shopping-browser entry. External stores are opened in a supported
 * browser flow; product capture and confirmation remain inside the AYROVI session. */
export const AyWebsScreen: React.FC<AyWebsScreenProps> = ({
  onClose,
  onOpenCart,
  onCaptured,
  onUploadScreenshot,
  cartCount,
}) => {
  const { tr, direction } = useLocale();
  const [stores, setStores] = useState<AyWebsStore[]>([]);
  const [features, setFeatures] = useState<AyWebsFeatures>(DEFAULT_FEATURES);
  const [registryOffline, setRegistryOffline] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [input, setInput] = useState('');
  const [captureState, setCaptureState] = useState<AyWebsCaptureState>('IDLE');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sharedLinkHandled = useRef(false);
  const captureRequest = useRef<AbortController | null>(null);
  const progressTimer = useRef<number | null>(null);
  useBodyScrollLock(true);

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) || stores[0] || null,
    [selectedStoreId, stores],
  );
  const busy = ['CAPTURING', 'EXTRACTING', 'VALIDATING'].includes(captureState);

  useEffect(() => {
    trackAyWebsEvent('aywebs_open');
    const controller = new AbortController();
    void getAyWebsStores(controller.signal).then((result) => {
      setStores(result.stores);
      setFeatures(result.features || DEFAULT_FEATURES);
      setRegistryOffline(result.offline);
      setSelectedStoreId((current) => current || result.stores[0]?.id || '');
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    captureRequest.current?.abort();
    if (progressTimer.current != null) window.clearTimeout(progressTimer.current);
  }, []);

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const capture = async (url: string, store: AyWebsStore) => {
    captureRequest.current?.abort();
    if (progressTimer.current != null) window.clearTimeout(progressTimer.current);
    const controller = new AbortController();
    captureRequest.current = controller;
    setMessage('');
    setCaptureState('CAPTURING');
    trackAyWebsEvent('capture_started', { store: store.id });
    progressTimer.current = window.setTimeout(() => setCaptureState('EXTRACTING'), 450);
    try {
      const result = await captureAyWebsProduct(url, store.id, controller.signal);
      if (progressTimer.current != null) window.clearTimeout(progressTimer.current);
      setCaptureState('VALIDATING');
      if (!result.product?.title || !(result.product.sourcePrice > 0)) {
        throw new AyWebsApiError('Informations produit incomplètes.', 'CAPTURE_INCOMPLETE', 'NEEDS_SELECTION');
      }
      setCaptureState('READY');
      trackAyWebsEvent('capture_succeeded', { store: store.id, capture_id: result.capture_id });
      onCaptured(result.product);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      if (error instanceof AyWebsApiError) {
        trackAyWebsEvent('capture_failed', { store: store.id, code: error.code });
        const nextState: AyWebsCaptureState = error.status === 'UNSUPPORTED'
          ? 'UNSUPPORTED'
          : error.status === 'NEEDS_SELECTION' ? 'NEEDS_SELECTION' : 'FAILED';
        setCaptureState(nextState);
        setMessage(error.message);
      } else {
        trackAyWebsEvent('capture_failed', { store: store.id, code: 'NETWORK_OR_CLIENT_ERROR' });
        setCaptureState('FAILED');
        setMessage(tr('La capture est indisponible pour le moment.', 'التقاط المنتج غير متاح حاليًا.'));
      }
    } finally {
      if (progressTimer.current != null) window.clearTimeout(progressTimer.current);
      if (captureRequest.current === controller) captureRequest.current = null;
    }
  };

  useEffect(() => {
    if (sharedLinkHandled.current || !stores.length || !features.enabled) return;
    const params = new URL(window.location.href).searchParams;
    const shared = params.get('url') || params.get('text') || '';
    const extracted = shared.match(/https?:\/\/[^\s<>]+/i)?.[0] || shared;
    const url = normalizedUrl(extracted.replace(/['"<>),;]+$/, ''));
    if (!url) return;
    sharedLinkHandled.current = true;
    setInput(url);
    const registered = detectAyWebsStore(url);
    const store = registered ? stores.find((item) => item.id === registered.id) : null;
    if (!store) {
      setCaptureState('UNSUPPORTED');
      setMessage(tr('Le lien partagé provient d’une boutique non prise en charge.', 'الرابط المشارك صادر عن متجر غير مدعوم.'));
      return;
    }
    setSelectedStoreId(store.id);
    trackAyWebsEvent('product_page_detected', { store: store.id });
    if (store.capture_supported && features.capture_enabled) void capture(url, store);
    else {
      setCaptureState('UNSUPPORTED');
      setMessage(tr('La capture de cette boutique est temporairement désactivée.', 'التقاط منتجات هذا المتجر متوقف مؤقتًا.'));
    }
    window.history.replaceState(window.history.state, '', '/aywebs');
  }, [features.capture_enabled, features.enabled, stores]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) {
      inputRef.current?.focus();
      return;
    }

    const productUrl = normalizedUrl(value);
    if (!productUrl) {
      if (!selectedStore) return;
      openExternal(selectedStore.search_url_template.replace('{query}', encodeURIComponent(value)));
      setMessage(tr(
        'La recherche est ouverte dans la boutique. Revenez ensuite coller le lien exact du produit.',
        'تم فتح البحث في المتجر. ارجع بعد ذلك والصق رابط المنتج المباشر.',
      ));
      setCaptureState('IDLE');
      return;
    }

    const registered = detectAyWebsStore(productUrl);
    const store = registered ? stores.find((item) => item.id === registered.id) : null;
    if (!store) {
      setCaptureState('UNSUPPORTED');
      setMessage(tr('Cette boutique ne fait pas encore partie du registre AyWebs.', 'هذا المتجر غير موجود حاليًا في سجل AyWebs.'));
      return;
    }
    setSelectedStoreId(store.id);
    trackAyWebsEvent('product_page_detected', { store: store.id });
    if (!store.capture_supported || !features.capture_enabled) {
      setCaptureState('UNSUPPORTED');
      setMessage(tr(
        'Vous pouvez parcourir cette boutique, mais sa capture est temporairement désactivée.',
        'يمكنك تصفح هذا المتجر، لكن التقاط منتجاته متوقف مؤقتًا.',
      ));
      return;
    }
    void capture(productUrl, store);
  };

  const retry = () => {
    const url = normalizedUrl(input);
    const registered = url ? detectAyWebsStore(url) : null;
    const store = registered ? stores.find((item) => item.id === registered.id) : null;
    if (url && store?.capture_supported) void capture(url, store);
    else inputRef.current?.focus();
  };

  const stateCopy: Record<AyWebsCaptureState, string> = {
    IDLE: tr('Prêt à parcourir', 'جاهز للتصفح'),
    CAPTURING: tr('Connexion à la boutique…', 'جاري الاتصال بالمتجر…'),
    EXTRACTING: tr('Analyse du produit et du prix…', 'جاري تحليل المنتج والسعر…'),
    VALIDATING: tr('Validation du devis AYROVI…', 'جاري التحقق من سعر AYROVI…'),
    NEEDS_SELECTION: tr('Informations à compléter', 'معلومات تحتاج إلى استكمال'),
    READY: tr('Produit capturé', 'تم التقاط المنتج'),
    FAILED: tr('Capture non terminée', 'لم يكتمل التقاط المنتج'),
    UNSUPPORTED: tr('Capture non prise en charge', 'التقاط المنتج غير مدعوم'),
  };

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
        subtitle={tr('Shopping Browser par AYROVI', 'متصفح التسوق من AYROVI')}
        onBack={onClose}
        backPlacement="leading"
        sticky
        actions={(
          <button
            type="button"
            onClick={onOpenCart}
            className="relative grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-ink-deep/5 active:scale-[0.96]"
            aria-label={tr('Ouvrir le panier AYROVI', 'فتح سلة AYROVI')}
          >
            <ShoppingBag className="h-7 w-7" />
            {cartCount > 0 && (
              <span className="absolute end-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-micro font-black leading-none text-white" aria-label={tr(`${cartCount} article(s)`, `${cartCount} منتج`)}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        )}
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="grid gap-5 border-b border-line pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card border border-line bg-white text-ink">
                <AyWebs className="h-8 w-8" />
              </span>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-ink">AYROVI · AyWebs</p>
            </div>
            <h1 className="mt-5 max-w-3xl font-display text-3xl font-black leading-tight text-ink sm:text-5xl">
              {tr('Trouvez ailleurs. Ajoutez ici.', 'ابحث خارجيًا. وأضف هنا.')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-muted">
              {tr(
                'Recherchez dans une boutique ou collez le lien exact d’un produit. AyWebs le capture, le fait tarifer par AYROVI puis ouvre la confirmation.',
                'ابحث داخل متجر أو الصق رابط المنتج المباشر. تلتقطه AyWebs، وترسله إلى محرك أسعار AYROVI، ثم تفتح شاشة التأكيد.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-muted">
            <span className={`h-2 w-2 rounded-full ${features.enabled ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
            {features.enabled ? tr('Service actif', 'الخدمة مفعلة') : tr('Service suspendu', 'الخدمة متوقفة')}
          </div>
        </header>

        <section className="mt-6" aria-labelledby="aywebs-stores-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="aywebs-stores-title" className="font-display text-lg font-black text-ink">{tr('Boutiques', 'المتاجر')}</h2>
              <p className="mt-1 text-xs font-medium text-muted">{tr('Le registre pilote les boutiques affichées et leur niveau de capture.', 'يتحكم السجل في المتاجر المعروضة ومستوى دعم الالتقاط.')}</p>
            </div>
            {registryOffline && <span className="ay-text-caption font-bold text-muted">{tr('Registre local', 'السجل المحلي')}</span>}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {stores.map((store) => {
              const active = selectedStore?.id === store.id;
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => {
                    setSelectedStoreId(store.id);
                    trackAyWebsEvent('store_selected', { store: store.id });
                  }}
                  aria-pressed={active}
                  className={`min-w-32 shrink-0 rounded-card border p-3 text-start transition ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'}`}
                >
                  <strong className="block text-sm font-black">{store.name}</strong>
                  <span className={`mt-1 block text-micro font-bold uppercase tracking-[0.12em] ${active ? 'text-white/70' : store.capture_supported ? 'text-success' : 'text-muted'}`}>
                    {store.capture_supported
                      ? store.status === 'beta' ? tr('Capture bêta', 'التقاط تجريبي') : tr('Capture active', 'الالتقاط مفعل')
                      : tr('Navigation', 'تصفح')}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-card border border-line bg-white" aria-labelledby="aywebs-browser-title">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 id="aywebs-browser-title" className="truncate text-sm font-black text-ink">{tr('Shopping Browser', 'متصفح التسوق')}</h2>
              <p className="truncate ay-text-caption font-medium text-muted">{selectedStore?.name || tr('Choisissez une boutique', 'اختر متجرًا')}</p>
            </div>
            {selectedStore && (
              <button type="button" onClick={() => openExternal(selectedStore.home_url)} className="flex min-h-11 items-center gap-2 rounded-control px-3 text-xs font-black text-ink hover:bg-surface">
                <ExternalLink className="h-4 w-4" />
                {tr('Ouvrir', 'فتح')}
              </button>
            )}
          </div>

          <div className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{tr('Recherche ou lien produit', 'بحث أو رابط منتج')}</span>
                <Link2 className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => { setInput(event.target.value); if (!busy) { setCaptureState('IDLE'); setMessage(''); } }}
                  disabled={busy || !features.enabled}
                  placeholder={tr('Rechercher ou coller un lien produit', 'ابحث أو الصق رابط المنتج')}
                  className="h-12 w-full rounded-control border border-line bg-surface pe-4 ps-12 text-sm font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white disabled:opacity-60"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="url"
                />
              </label>
              <button type="submit" disabled={busy || !features.enabled || !input.trim()} className="ay-btn-cta flex h-12 min-w-40 items-center justify-center gap-2 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : normalizedUrl(input) ? <AyWebs className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                {busy ? tr('Analyse…', 'تحليل…') : normalizedUrl(input) ? tr('Capturer', 'التقاط') : tr('Rechercher', 'بحث')}
              </button>
            </form>

            <div className="mt-5 min-h-44 border-t border-line pt-5" aria-live="polite">
              {busy ? (
                <div className="grid min-h-36 place-items-center text-center" role="status">
                  <div>
                    <Loader2 className="mx-auto h-9 w-9 animate-spin text-ink" />
                    <strong className="mt-4 block text-base font-black text-ink">{stateCopy[captureState]}</strong>
                    <p className="mt-2 text-xs font-medium text-muted">{tr('Structured Data, page produit puis adaptateur de boutique.', 'بيانات منظمة، ثم صفحة المنتج، ثم محوّل المتجر.')}</p>
                  </div>
                </div>
              ) : ['FAILED', 'UNSUPPORTED', 'NEEDS_SELECTION'].includes(captureState) ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <AlertCircle className="h-7 w-7 text-ink" />
                    <strong className="mt-3 block text-base font-black text-ink">{stateCopy[captureState]}</strong>
                    <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted">{message || tr('Nous n’avons pas pu lire toutes les informations du produit.', 'لم نتمكن من قراءة كل معلومات المنتج.')}</p>
                  </div>
                  <div className="grid gap-2 sm:min-w-48">
                    <button type="button" onClick={retry} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black"><RefreshCw className="h-4 w-4" />{tr('Réessayer', 'إعادة المحاولة')}</button>
                    <button type="button" onClick={() => inputRef.current?.focus()} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black"><Link2 className="h-4 w-4" />{tr('Utiliser un lien', 'استخدام رابط')}</button>
                    {features.ocr_fallback_enabled && <button type="button" onClick={onUploadScreenshot} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black"><Camera className="h-4 w-4" />{tr('Capture d’écran', 'رفع لقطة شاشة')}</button>}
                  </div>
                </div>
              ) : captureState === 'READY' ? (
                <div className="grid min-h-36 place-items-center text-center"><div><CheckCircle2 className="mx-auto h-9 w-9 text-success" /><strong className="mt-3 block text-base font-black text-ink">{stateCopy.READY}</strong></div></div>
              ) : (
                <div className="grid min-h-36 place-items-center text-center">
                  <div>
                    <AyWebs className="mx-auto h-10 w-10 text-muted" />
                    <strong className="mt-4 block text-base font-black text-ink">{stateCopy.IDLE}</strong>
                    <p className="mx-auto mt-2 max-w-lg text-xs font-medium leading-6 text-muted">
                      {message || tr('La boutique s’ouvre dans un onglet pris en charge. Copiez ensuite le lien exact du produit pour le capturer dans AYROVI.', 'يفتح المتجر في تبويب مدعوم. انسخ بعد ذلك رابط المنتج المباشر لالتقاطه داخل AYROVI.')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </section>
  );
};
