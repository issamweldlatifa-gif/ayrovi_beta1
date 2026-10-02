import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, AyWebs, CheckCircle2, ExternalLink, Link2, Loader2,
  ReceiptText, RefreshCw, Search, ShoppingBag,
} from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import { detectAyWebsStore } from '../../../../../shared/aywebsStores';
import {
  analyzeAyWebsPage, trackAyWebsEvent, trackAyWebsShoppingEvent,
  type AyWebsFeatures, type AyWebsStore,
} from '../api';
import { openMerchantPage } from '../../../services/nativeShell';
import { AyWebsErrorState, AyWebsLoading, AyWebsNotice } from './AyWebsStates';

/**
 * AYWEBs Store Browser (§9, §10, §26).
 *
 * La boutique externe s'ouvre dans le navigateur pris en charge (le registre
 * décide du mode : `browserMode`). Cet écran est le poste de pilotage AYWEBs :
 * précédent / suivant / actualiser, barre d'URL, boutique détectée, et surtout le
 * pont de détection de produit — le client colle le lien, le SERVEUR répond
 * `page_type` et `product_detected` (§11). Aucune décision de détection n'est
 * prise ici, et aucune page marchande n'est embarquée dans un cadre : la CSP
 * AYROVI n'est pas affaiblie pour AYWEBs.
 */

export interface AyWebsStoreBrowserProps {
  store: AyWebsStore | null;
  initialUrl?: string;
  features: AyWebsFeatures;
  onBack: () => void;
  onOpenProduct: (url: string, storeId?: string | null) => void;
  onOpenCart: () => void;
  onOpenRequestForm: (prefill: { url?: string; storeName?: string }) => void;
  onStoreDetected: (storeId: string) => void;
  cartCount: number;
}

interface HistoryEntry {
  url: string;
  title: string;
  pageType: string;
  productDetected: boolean;
  storeId: string | null;
  at: string;
}

type AnalysisState = 'idle' | 'analyzing' | 'done' | 'error';

export const AyWebsStoreBrowser: React.FC<AyWebsStoreBrowserProps> = ({
  store, initialUrl, features, onBack, onOpenProduct, onOpenCart, onOpenRequestForm, onStoreDetected, cartCount,
}) => {
  const { tr } = useLocale();
  const homeUrl = store?.home_url || '';
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [input, setInput] = useState(initialUrl || homeUrl);
  const [state, setState] = useState<AnalysisState>('idle');
  const [error, setError] = useState<unknown>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeAyWebsPage>> | null>(null);
  const [opening, setOpening] = useState(false);

  const current = cursor >= 0 ? entries[cursor] : null;
  const detectedStore = useMemo(() => {
    const id = analysis?.store_id || current?.storeId;
    if (!id) return null;
    return detectAyWebsStore(id) ? { id } : null;
  }, [analysis, current]);

  const pushEntry = useCallback((entry: HistoryEntry) => {
    setEntries((previous) => {
      const trimmed = previous.slice(0, Math.max(0, cursor + 1));
      return [...trimmed, entry].slice(-25);
    });
    setCursor((previous) => Math.min(previous + 1, 24));
  }, [cursor]);

  const analyze = useCallback(async (rawUrl: string, options: { push?: boolean } = {}) => {
    const url = rawUrl.trim();
    if (!url) return;
    setState('analyzing');
    setError(null);
    try {
      const result = await analyzeAyWebsPage(url);
      setAnalysis(result);
      setState('done');
      if (result.product_detected) {
        trackAyWebsEvent('product_page_detected', { store: result.store_id || undefined });
      }
      if (result.store_id) onStoreDetected(result.store_id);
      if (options.push !== false) {
        pushEntry({
          url: result.url,
          title: result.store_name || result.store_id || result.url,
          pageType: result.page_type,
          productDetected: result.product_detected,
          storeId: result.store_id,
          at: new Date().toISOString(),
        });
      }
      // §27 : une page qui exige une action du client ne sera jamais contournée.
      if (!result.capture_allowed && result.registered) {
        trackAyWebsShoppingEvent('store_opened', { store: result.store_id || undefined });
      }
    } catch (caught) {
      setError(caught);
      setState('error');
    }
  }, [onStoreDetected, pushEntry]);

  useEffect(() => {
    if (initialUrl) void analyze(initialUrl);
    else if (homeUrl) setInput(homeUrl);
    // Une seule analyse à l'ouverture : l'écran ne relit pas l'historique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openExternal = (url: string) => {
    if (!url) return;
    setOpening(true);
    openMerchantPage(url);
    window.setTimeout(() => setOpening(false), 600);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value)) { void analyze(value); return; }
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(value)) { void analyze(`https://${value}`); return; }
    // Recherche texte : ouverture du moteur de la boutique sélectionnée.
    if (store?.search_url_template) openExternal(store.search_url_template.replace('{query}', encodeURIComponent(value)));
    else if (store) openExternal(store.home_url);
  };

  const go = (delta: number) => {
    const next = cursor + delta;
    if (next < 0 || next >= entries.length) return;
    setCursor(next);
    const entry = entries[next];
    setInput(entry.url);
    setAnalysis(null);
    setState('idle');
  };

  return (
    <div className="grid gap-4">
      {/* ---- Barre de navigation : précédent / suivant / actualiser / URL / ouvrir ---- */}
      <div className="rounded-card border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className="grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-surface" aria-label={tr('Retour aux boutiques', 'العودة إلى المتاجر')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(-1)} disabled={cursor <= 0} className="grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-surface disabled:opacity-35" aria-label={tr('Précédent', 'السابق')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(1)} disabled={cursor < 0 || cursor >= entries.length - 1} className="grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-surface disabled:opacity-35" aria-label={tr('Suivant', 'التالي')}>
            <ArrowRight className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => void analyze(current?.url || input)} disabled={state === 'analyzing' || !(current || input.trim())} className="grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-surface disabled:opacity-35" aria-label={tr('Actualiser l’analyse', 'تحديث التحليل')}>
            <RefreshCw className="h-5 w-5" />
          </button>

          <form onSubmit={submit} className="relative min-w-0 flex-1">
            <span className="sr-only">{tr('Adresse ou recherche', 'العنوان أو البحث')}</span>
            <Link2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={tr('Lien produit ou recherche dans la boutique', 'رابط المنتج أو ابحث داخل المتجر')}
              className="h-11 w-full rounded-control border border-line bg-surface pe-3 ps-10 text-xs font-semibold text-ink outline-none transition placeholder:text-muted focus:border-ink focus:bg-white"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
            />
          </form>

          <button type="button" onClick={() => openExternal(current?.url || input || homeUrl)} disabled={opening} className="ay-btn-secondary flex h-11 items-center justify-center gap-2 px-3 text-xs font-black">
            {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {tr('Ouvrir', 'فتح')}
          </button>
          <button type="button" onClick={onOpenCart} className="relative grid h-11 w-11 place-items-center rounded-control text-ink transition hover:bg-surface" aria-label={tr('Panier AyWebs', 'سلة AyWebs')}>
            <ShoppingBag className="h-6 w-6" />
            {cartCount > 0 && (
              <span className="absolute end-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-micro font-black leading-none text-white">{cartCount > 99 ? '99+' : cartCount}</span>
            )}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-micro font-bold uppercase tracking-[0.12em] text-muted">
          <span>{store ? `${tr('Boutique', 'المتجر')} : ${store.display_name || store.name}` : tr('Aucune boutique sélectionnée', 'لم يتم اختيار متجر')}</span>
          {analysis?.store_id && <span>· {tr('identifiant', 'المعرّف')} : {analysis.store_id}</span>}
          {analysis?.integration_type && <span>· {analysis.integration_type.replace(/_/g, ' ')}</span>}
          {analysis?.browser_mode && <span>· {tr('ouverture', 'الفتح')} : {analysis.browser_mode}</span>}
        </div>
      </div>

      {/* ---- Résultat de l'analyse : le serveur tranche, l'écran affiche ---- */}
      {state === 'analyzing' && <AyWebsLoading label={tr('Analyse de la page…', 'جارٍ تحليل الصفحة…')} />}

      {state === 'error' && (
        <AyWebsErrorState
          error={error}
          onRetry={() => void analyze(current?.url || input)}
          actions={(
            <button type="button" onClick={() => onOpenRequestForm({ url: current?.url || input })} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
              <ReceiptText className="h-4 w-4" />
              {tr('Demander un achat avec URL', 'اطلب الشراء بالرابط')}
            </button>
          )}
        />
      )}

      {state === 'done' && analysis && (
        <div className="grid gap-3">
          {analysis.product_detected ? (
            <div className="rounded-card border border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
                <div className="min-w-0">
                  <strong className="block text-sm font-black text-ink">{tr('Produit détecté', 'تم اكتشاف المنتج')}</strong>
                  <p className="mt-1 text-xs font-semibold leading-6 text-muted">{analysis.url}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onOpenProduct(analysis.url, analysis.store_id)} className="ay-btn-cta flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                      <AyWebs className="h-4 w-4" />
                      {tr('Ouvrir la fiche AyWebs', 'افتح بطاقة AyWebs')}
                    </button>
                    <button type="button" onClick={() => openExternal(analysis.url)} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                      <ExternalLink className="h-4 w-4" />
                      {tr('Voir chez le marchand', 'شاهده لدى المتجر')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <Search className="mt-0.5 h-6 w-6 shrink-0 text-muted" />
                <div className="min-w-0">
                  <strong className="block text-sm font-black text-ink">{pageTypeLabel(analysis.page_type, tr)}</strong>
                  <p className="mt-1 text-xs font-semibold leading-6 text-muted">
                    {analysis.reason || tr('Ouvrez la fiche exacte du produit chez le marchand, puis collez son lien ici.', 'افتح صفحة المنتج الدقيقة لدى المتجر ثم الصق رابطها هنا.')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openExternal(analysis.url)} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                      <ExternalLink className="h-4 w-4" />
                      {tr('Ouvrir la boutique', 'افتح المتجر')}
                    </button>
                    {!analysis.registered && (
                      <button type="button" onClick={() => onOpenRequestForm({ url: analysis.url, storeName: analysis.store_name })} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                        <ReceiptText className="h-4 w-4" />
                        {tr('Demander un achat avec URL', 'اطلب الشراء بالرابط')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!analysis.registered && (
            <AyWebsNotice tone="warning">
              {tr('Cette boutique n’est pas encore dans le registre AyWebs : la demande avec URL reste la voie honnête.', 'هذا المتجر غير مدرج في سجل AyWebs: الطلب بالرابط هو الطريق الصحيح.')}
            </AyWebsNotice>
          )}
          {analysis.customer_action_required && analysis.customer_action_required !== 'NONE' && (
            <AyWebsNotice tone="danger">
              {tr('La boutique exige une action de votre part (connexion, vérification). AYROVI ne la contourne jamais.', 'المتجر يطلب إجراءً منك (تسجيل دخول أو تحقق). AYROVI لا يتجاوز ذلك أبدًا.')}
            </AyWebsNotice>
          )}
          {analysis.registered && !analysis.capture_allowed && (
            <AyWebsNotice tone="info">
              {tr('La navigation est permise, la capture est désactivée pour cette boutique.', 'التصفح مسموح، لكن الالتقاط معطّل لهذا المتجر.')}
            </AyWebsNotice>
          )}
        </div>
      )}

      {state === 'idle' && (
        <div className="rounded-card border border-line bg-white p-6 text-center">
          <AyWebs className="mx-auto h-9 w-9 text-muted" />
          <strong className="mt-3 block text-sm font-black text-ink">{tr('Poste de navigation AyWebs', 'محطة تصفح AyWebs')}</strong>
          <p className="mx-auto mt-2 max-w-xl text-xs font-semibold leading-6 text-muted">
            {tr(
              'La boutique s’ouvre dans votre navigateur. Copiez le lien exact d’un produit et collez-le ici : AyWebs le détecte, lit ses variantes et son stock, puis vous propose l’ajout au panier AyWebs.',
              'يُفتح المتجر في متصفحك. انسخ رابط المنتج الدقيق والصقه هنا: يكتشفه AyWebs، ويقرأ نسخه ومخزونه، ثم يقترح إضافته إلى سلة AyWebs.',
            )}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {homeUrl && (
              <button type="button" onClick={() => { setInput(homeUrl); void analyze(homeUrl); }} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
                <ExternalLink className="h-4 w-4" />
                {tr('Ouvrir la page d’accueil', 'افتح الصفحة الرئيسية')}
              </button>
            )}
            <button type="button" onClick={onOpenCart} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
              <ShoppingBag className="h-4 w-4" />
              {tr('Panier AyWebs', 'سلة AyWebs')}
            </button>
          </div>
          {!features.capture_enabled && (
            <p className="mt-4 flex items-center justify-center gap-2 text-micro font-bold uppercase tracking-[0.12em] text-muted">
              <AlertCircle className="h-4 w-4" />
              {tr('Capture désactivée pour le moment', 'الالتقاط معطّل حاليًا')}
            </p>
          )}
        </div>
      )}

      {/* ---- Historique de session (§26) : ce qui a été visité, relisible ---- */}
      {entries.length > 0 && (
        <section aria-labelledby="aywebs-browser-history">
          <h2 id="aywebs-browser-history" className="text-sm font-black text-ink">{tr('Pages analysées', 'الصفحات التي تم تحليلها')}</h2>
          <ul className="mt-2 grid gap-2">
            {entries.slice().reverse().map((entry, index) => {
              const position = entries.length - 1 - index;
              const active = position === cursor;
              return (
                <li key={`${entry.url}-${entry.at}`}>
                  <button
                    type="button"
                    onClick={() => { setCursor(position); setInput(entry.url); setAnalysis(null); setState('idle'); }}
                    className={`flex w-full items-center gap-3 rounded-control border px-3 py-2 text-start transition ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs font-black">{entry.title}</strong>
                      <span className={`block truncate text-micro font-semibold ${active ? 'text-white/70' : 'text-muted'}`}>{entry.url}</span>
                    </span>
                    <span className={`shrink-0 rounded-control border px-2 py-1 text-micro font-black uppercase tracking-[0.1em] ${active ? 'border-white/30' : 'border-line bg-surface'}`}>
                      {entry.productDetected ? tr('Produit', 'منتج') : entry.pageType}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {detectedStore && (
            <p className="mt-2 text-micro font-bold uppercase tracking-[0.12em] text-muted">
              {tr('Boutique détectée', 'المتجر المكتشف')} : {detectedStore.id}
            </p>
          )}
        </section>
      )}
    </div>
  );
};

/** §10 : les états de page du registre, en langage client. */
function pageTypeLabel(pageType: string, tr: (fr: string, ar: string) => string): string {
  switch (pageType) {
    case 'PRODUCT': return tr('Page produit', 'صفحة منتج');
    case 'SEARCH': return tr('Page de recherche', 'صفحة بحث');
    case 'CATEGORY': return tr('Catégorie', 'تصنيف');
    case 'HOME': return tr('Page d’accueil de la boutique', 'الصفحة الرئيسية للمتجر');
    case 'LOGIN': return tr('Connexion requise', 'مطلوب تسجيل الدخول');
    case 'CHECKOUT': return tr('Panier du marchand — non lu par AyWebs', 'سلة المتجر — لا يقرأها AyWebs');
    case 'CAPTCHA': return tr('Vérification de sécurité demandée', 'مطلوب تحقق أمني');
    case 'ERROR': return tr('Page en erreur', 'صفحة بها خطأ');
    default: return tr('Page non reconnue', 'صفحة غير معروفة');
  }
}
