import React, { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type {
  AyrovixCandidate, AyrovixDetectedPrice, AyrovixHistoryItem, AyrovixOrderPayload, AyrovixProduct, AyrovixUrlResult,
} from '../types';
import { analyzeBarcode, analyzeCode, analyzeImage, analyzeUrl, markChosen, AyrovixApiError } from '../services/lensApi';
import { prepareImage } from '../services/imagePrep';
import { rememberAyrovixHistory } from '../services/history';
import { getCommerceConfig } from '../../services/publicApi';

import { useLocale } from '../../i18n/LocaleContext';
import { LiveCamera } from './LiveCamera';
import { LensHistory } from './LensHistory';
import { LensCamera } from './LensCamera';
import { LensUpload } from './LensUpload';
import { ProductCandidates } from './ProductCandidates';
import { ProductResult, type AyrovixOrderSelection } from './ProductResult';
import { useNavigationHistory } from '../../navigation/NavigationHistory';
import { isDisplayableProduct } from '../services/resultPolicy';
import { LensContextHeader, LensMoreMenu } from './LensNavigation';
import { LensResults } from './LensResults';
import { Check, Image as GalleryIcon, Percent, Search, ShieldCheck, Sparkles } from '../../components/QatafoIcons';

interface LensLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  historyScope?: string | null;
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
  cartCount: number;
  onOpenCart: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

type Stage = 'live' | 'home' | 'preview' | 'analyzing' | 'candidates' | 'product' | 'barcode' | 'error';

interface CandidatesView {
  queryLabel: string | null;
  list: AyrovixCandidate[];
  eventId: string;
  detectedPrice?: AyrovixDetectedPrice | null;
}

function toStoreKey(sourceUrl: string): AyrovixOrderPayload['store'] {
  const host = sourceUrl.toLowerCase();
  if (host.includes('shein')) return 'shein';
  if (host.includes('amazon')) return 'amazon';
  if (host.includes('temu')) return 'temu';
  if (host.includes('aliexpress')) return 'aliexpress';
  return 'generic';
}

function candidateToProduct(candidate: AyrovixCandidate): AyrovixProduct {
  return {
    title: candidate.title,
    brand: candidate.brand,
    model: candidate.model,
    description: '',
    image: candidate.image,
    images: candidate.images?.length ? candidate.images : candidate.image ? [candidate.image] : [],
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    price: candidate.price,
    currency: candidate.currency,
    priceTnd: candidate.priceTnd,
    rating: candidate.rating ?? null,
    ratingCount: candidate.ratingCount ?? null,
    ratingKind: candidate.ratingKind || 'match',
    priceToken: candidate.priceToken || null,
    priceVerified: candidate.priceVerificationStatus === 'VERIFIED',
    priceVerificationStatus: candidate.priceVerificationStatus || 'PENDING_MANUAL',
    exchangeRate: null,
    colors: candidate.colors,
    sizes: candidate.sizes,
    availability: candidate.kind === 'catalog' ? 'in_stock' : 'unknown',
  };
}

const NEW_SCAN_MESSAGE = 'Cadrez le produit dans un bon éclairage, ou collez son lien direct.';

export const LensLauncher: React.FC<LensLauncherProps> = ({
  isOpen,
  onClose,
  historyScope,
  onOrder,
  cartCount,
  onOpenCart,
  darkMode,
  onToggleDarkMode,
}) => {
  const navigation = useNavigationHistory();
  const { tr, direction } = useLocale();
  const cameraCapable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const stageLayer = [...navigation.stack].reverse().find((layer) => layer.id.startsWith('lens:') && layer.id !== 'lens:history');
  const stageValue = stageLayer?.id.slice('lens:'.length);
  const stage: Stage = ['live', 'home', 'preview', 'analyzing', 'candidates', 'product', 'barcode', 'error'].includes(String(stageValue))
    ? stageValue as Stage
    : (cameraCapable ? 'live' : 'home');
  const historyOpen = navigation.stack.some((layer) => layer.id === 'lens:history');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [candidatesView, setCandidatesView] = useState<CandidatesView | null>(null);
  const [urlResult, setUrlResult] = useState<AyrovixUrlResult | null>(null);
  const [product, setProduct] = useState<AyrovixProduct | null>(null);
  const [barcode, setBarcode] = useState<{ code: string; eventId: string } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifiedPriceUrl, setVerifiedPriceUrl] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);

  // Feature flag LIVE (AYROVIX_LENS_LIVE_ENABLED) — sans toucher les modes existants
  useEffect(() => {
    let cancelled = false;
    getCommerceConfig()
      .then((payload) => { if (!cancelled) setLiveEnabled(Boolean((payload as any)?.data?.features?.ayrovixLensLive)); })
      .catch(() => { if (!cancelled) setLiveEnabled(false); });
    return () => { cancelled = true; };
  }, []);
  const previewRef = useRef<string | null>(null);
  const dropInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  const abortRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const previousStageRef = useRef<Stage>(stage);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) setMenuOpen(false);
  }, [isOpen]);

  useEffect(() => () => {
    requestAbortRef.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  useEffect(() => {
    if (previousStageRef.current === 'analyzing' && stage !== 'analyzing') {
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      abortRef.current += 1;
    }
    previousStageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (stage !== 'analyzing') { setAnalysisProgress(0); return undefined; }
    setAnalysisProgress(0);
    const timer = window.setInterval(() => setAnalysisProgress((current) => Math.min(current + 1, 3)), 1400);
    return () => window.clearInterval(timer);
  }, [stage]);

  if (!isOpen) return null;

  const startRequest = () => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    return { controller, token: ++abortRef.current };
  };
  const finishRequest = (controller: AbortController) => {
    if (requestAbortRef.current === controller) requestAbortRef.current = null;
  };
  const replaceStage = (next: Stage) => {
    stageRef.current = next;
    navigation.replaceTop({ id: `lens:${next}` });
  };
  const enterStage = (next: Stage) => {
    if (stageRef.current === next && !historyOpen) return;
    stageRef.current = next;
    if (historyOpen) navigation.replaceTop({ id: `lens:${next}` });
    else navigation.pushLayer({ id: `lens:${next}` });
  };

  const clearRuntime = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    abortRef.current += 1;
    if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = null; }
    setPreviewUrl(null);
    setImageFile(null);
    setCandidatesView(null);
    setUrlResult(null);
    setProduct(null);
    setBarcode(null);
    setError(null);
    setOrdering(false);
    setCopied(false);
    setVerifiedPriceUrl(false);
  };

  const reset = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    abortRef.current += 1;
    setError(null);
    setOrdering(false);
    setCopied(false);
    replaceStage(cameraCapable ? 'live' : 'home');
  };

  const goBack = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    abortRef.current += 1;
    setError(null);
    setOrdering(false);
    navigation.back();
  };

  const handleClose = () => { clearRuntime(); onClose(); };

  const fail = (code: string, message: string) => { setError({ code, message }); replaceStage('error'); };
  const handleImage = async (file: File, autoAnalyze: boolean) => {
    setError(null);
    const prepared = await prepareImage(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = prepared.previewUrl;
    setPreviewUrl(prepared.previewUrl);
    setImageFile(prepared.file);
    if (autoAnalyze) void runImageAnalysis(prepared.file);
    else enterStage('preview');
  };

  const runImageAnalysis = async (fileOverride?: File) => {
    const file = fileOverride || imageFile;
    if (!file) return;
    const { controller, token } = startRequest();
    enterStage('analyzing');
    setError(null);
    try {
      const result = await analyzeImage(file, controller.signal);
      if (abortRef.current !== token) return;
      const usable = result.identification.confidence > 0 && result.identification.description !== 'PRODUIT_NON_IDENTIFIE';
      if (!usable && !result.detectedPrice) { fail('IDENTIFICATION_FAILED', NEW_SCAN_MESSAGE); return; }
      const historyMatch = result.candidates[0];
      rememberAyrovixHistory({
        id: result.eventId,
        kind: 'image',
        inputValue: '',
        queryLabel: result.query || result.detectedPrice?.title || '',
        title: historyMatch?.title || result.detectedPrice?.title || result.identification.description || 'Recherche par photo',
        imageUrl: historyMatch?.image || '',
        sourceUrl: historyMatch?.sourceUrl || '',
        source: historyMatch?.source || 'AYROVIX Vision',
        price: historyMatch?.price ?? result.detectedPrice?.sourcePrice ?? null,
        currency: historyMatch?.currency ?? result.detectedPrice?.sourceCurrency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: result.candidates.length,
        createdAt: new Date().toISOString(),
      }, historyScope);
      setCandidatesView({
        queryLabel: result.query || result.detectedPrice?.title || null,
        list: result.candidates,
        eventId: result.eventId,
        detectedPrice: result.detectedPrice || null,
      });
      setVerifiedPriceUrl(false);
      replaceStage('candidates');
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(apiError?.code || 'UNKNOWN', apiError?.message || "L'analyse a échoué. Vérifiez votre connexion.");
    } finally {
      finishRequest(controller);
    }
  };

  const runUrlAnalysis = async (url: string, channel: 'url' | 'qr') => {
    const { controller, token } = startRequest();
    enterStage('analyzing');
    setError(null);
    try {
      const result = await analyzeUrl(url, channel, controller.signal);
      if (abortRef.current !== token) return;
      const merchantPriceVerified = result.product.priceVerificationStatus === 'VERIFIED';
      const historyMatch = result.product.price != null ? null : result.alternates[0];
      rememberAyrovixHistory({
        id: result.eventId, kind: channel, inputValue: url, queryLabel: result.product.title,
        title: historyMatch?.title || result.product.title, imageUrl: historyMatch?.image || result.product.image,
        sourceUrl: result.product.sourceUrl || url, source: historyMatch?.source || result.product.source,
        price: historyMatch?.price ?? result.product.price, currency: historyMatch?.currency ?? result.product.currency,
        verificationStatus: historyMatch?.priceVerificationStatus || result.product.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: 1 + result.alternates.length, createdAt: new Date().toISOString(),
      }, historyScope);
      setUrlResult(result);
      if (isDisplayableProduct(result.product)) {
        setProduct(result.product);
        setVerifiedPriceUrl(merchantPriceVerified);
        replaceStage('product');
      } else if (result.alternates.length > 0) {
        setProduct(null);
        setCandidatesView({ queryLabel: result.product.title, list: result.alternates, eventId: result.eventId });
        setVerifiedPriceUrl(false);
        replaceStage('candidates');
      } else {
        fail('PRICED_RESULT_NOT_FOUND', 'Aucune offre avec un prix positif et un lien marchand valide n’a été trouvée. Essayez une photo plus nette ou un autre lien.');
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(
        apiError?.code || 'UNKNOWN',
        apiError?.code === 'EXTRACTION_FAILED'
          ? 'Impossible de récupérer toutes les informations automatiquement. Photographiez le produit ou sa page : AYROVIX le lira pour vous.'
          : (apiError?.message || "L'analyse du lien a échoué."),
      );
    } finally {
      finishRequest(controller);
    }
  };

  const runCodeTextAnalysis = async (value: string) => {
    const { controller, token } = startRequest();
    enterStage('analyzing');
    setError(null);
    try {
      const result = await analyzeCode(value, controller.signal);
      if (abortRef.current !== token) return;
      const historyMatch = result.candidates[0];
      rememberAyrovixHistory({
        id: result.eventId, kind: 'code', inputValue: result.code, queryLabel: result.code,
        title: historyMatch?.title || `Code ${result.code}`, imageUrl: historyMatch?.image || '',
        sourceUrl: historyMatch?.sourceUrl || '', source: historyMatch?.source || 'QR',
        price: historyMatch?.price ?? null, currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: result.candidates.length, createdAt: new Date().toISOString(),
      }, historyScope);
      if (result.candidates.length) {
        setCandidatesView({ queryLabel: `QR ${result.code}`, list: result.candidates, eventId: result.eventId });
        replaceStage('candidates');
      } else {
        setBarcode({ code: result.code, eventId: result.eventId });
        replaceStage('barcode');
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(apiError?.code || 'UNKNOWN', apiError?.message || "La recherche du QR code a échoué.");
    } finally {
      finishRequest(controller);
    }
  };

  const runBarcodeAnalysis = async (code: string) => {
    const { controller, token } = startRequest();
    enterStage('analyzing');
    setError(null);
    try {
      const result = await analyzeBarcode(code, controller.signal);
      if (abortRef.current !== token) return;
      const historyMatch = result.candidates[0];
      rememberAyrovixHistory({
        id: result.eventId, kind: 'barcode', inputValue: result.code, queryLabel: result.code,
        title: historyMatch?.title || `Code-barres ${result.code}`, imageUrl: historyMatch?.image || '',
        sourceUrl: historyMatch?.sourceUrl || '', source: historyMatch?.source || 'Code-barres',
        price: historyMatch?.price ?? null, currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: result.candidates.length, createdAt: new Date().toISOString(),
      }, historyScope);
      if (result.candidates.length) {
        setCandidatesView({ queryLabel: `Code-barres ${result.code}`, list: result.candidates, eventId: result.eventId });
        replaceStage('candidates');
      } else {
        setBarcode({ code: result.code, eventId: result.eventId });
        replaceStage('barcode');
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(apiError?.code || 'UNKNOWN', apiError?.message || "Lecture du code impossible. Réessayez.");
    } finally {
      finishRequest(controller);
    }
  };

  const handleChooseCandidate = async (candidate: AyrovixCandidate) => {
    if (candidatesView?.eventId) markChosen(candidatesView.eventId);
    if (!candidate.sourceUrl || candidate.kind === 'catalog') {
      setProduct(candidateToProduct(candidate));
      setVerifiedPriceUrl(candidate.priceVerificationStatus === 'VERIFIED');
      enterStage('product');
      return;
    }
    const { controller, token } = startRequest();
    enterStage('analyzing');
      setError(null);
      try {
        const result = await analyzeUrl(candidate.sourceUrl, 'url', controller.signal, false);
        if (abortRef.current !== token) return;
        const lensProduct = candidateToProduct(candidate);
        const extractedPrice = result.product.price;
        const proposedPrice = lensProduct.price;
        const samePrice = proposedPrice != null && extractedPrice != null
          && Math.abs(extractedPrice - proposedPrice) <= Math.max(0.05, proposedPrice * 0.02)
          && result.product.currency === lensProduct.currency;
        setUrlResult(result);
        if (proposedPrice == null && extractedPrice != null) {
          // A link/code result without a Lens price may use the directly extracted merchant quote.
          setProduct(result.product);
          setVerifiedPriceUrl(result.product.priceVerificationStatus === 'VERIFIED');
        } else {
          // An AYROVIX Lens quote remains the order price. Auto-verification only confirms it and enriches real options.
          setProduct({
            ...lensProduct,
            description: result.product.description || lensProduct.description,
            images: lensProduct.images.length ? lensProduct.images : result.product.images,
            image: lensProduct.image || result.product.image,
            colors: result.product.colors.length ? result.product.colors : lensProduct.colors,
            sizes: result.product.sizes.length ? result.product.sizes : lensProduct.sizes,
            variantOptions: undefined,
            availability: result.product.availability,
            verificationProvider: result.product.verificationProvider,
            verificationMethod: result.product.verificationMethod,
            verificationFailureCode: samePrice ? null : (result.product.verificationFailureCode || (extractedPrice != null ? 'PRICE_MISMATCH' : 'DIRECT_PRICE_NOT_FOUND')),
          });
          setVerifiedPriceUrl(samePrice);
        }
        replaceStage('product');
        return;
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        // Network/extraction failure: keep the Lens match for manual team verification.
      } finally {
        finishRequest(controller);
      }
    setProduct(candidateToProduct(candidate));
    setVerifiedPriceUrl(false);
    replaceStage('product');
  };

  const handleOrder = async ({ size, color, option, quantity, customerNote, manualUrl }: AyrovixOrderSelection) => {
    if (!product || (option?.price == null && product.price == null && !candidatesView?.detectedPrice)) return;
    if (urlResult?.eventId) markChosen(urlResult.eventId);
    const variant = [size && `Taille: ${size}`, color && `Couleur: ${color}`].filter(Boolean).join(' · ');
    const detectedPrice = candidatesView?.detectedPrice;
    const finalPrice = option?.price ?? product.price ?? detectedPrice?.sourcePrice ?? 0;
    const finalCurrency = option?.currency ?? product.currency ?? detectedPrice?.sourceCurrency ?? 'EUR';
    const priceToken = option?.priceToken || product.priceToken || detectedPrice?.priceToken || '';
    const priceVerificationStatus = product.priceVerificationStatus || (verifiedPriceUrl ? 'VERIFIED' : 'PENDING_MANUAL');
    if (!priceToken) {
      setError({ code: 'QUOTE_UNAVAILABLE', message: 'Le devis sécurisé a expiré. Relancez AYROVIX Lens pour continuer.' });
      enterStage('error');
      return;
    }
    setOrdering(true);
    setError(null);
    try {
      await onOrder({
        store: toStoreKey(product.sourceUrl || product.source || manualUrl),
        externalId: option?.id || null,
        url: manualUrl,
        referenceUrl: product.sourceUrl || '',
        title: product.title,
        imageUrl: product.image || detectedPrice?.imageUrl || '',
        sourcePrice: finalPrice,
        sourceCurrency: finalCurrency,
        priceTND: option?.priceTnd ?? product.priceTnd ?? detectedPrice?.totalPriceTND ?? 0,
        variant: option?.label || variant || undefined,
        requestedSize: size,
        requestedColor: color,
        customerNote,
        priceVerificationStatus,
        priceToken,
        quantity,
      });
      // Le panier s'ouvre, mais le résultat Lens reste monté pour un retour sans perte d'état.
      setOrdering(false);
    } catch (cause: any) {
      setError({ code: 'ORDER_FAILED', message: cause?.message || "L'article n'a pas pu être ajouté au panier. Réessayez." });
      enterStage('error');
      setOrdering(false);
    }
  };


  const commandDetectedPrice = (detected: AyrovixDetectedPrice) => {
    setProduct({
      title: detected.title || 'Produit détecté par AYROVIX',
      brand: detected.brand,
      model: null,
      description: detected.isCartScreenshot ? `Panier: ${detected.sourcePrice} ${detected.sourceCurrency} - ${detected.title}` : `${detected.title} — Prix repéré ${detected.sourcePrice} ${detected.sourceCurrency}`,
      image: detected.imageUrl || previewUrl || '',
      images: detected.imageUrl ? [detected.imageUrl] : previewUrl ? [previewUrl] : [],
      source: 'Collection AYROVI',
      sourceUrl: '',
      price: detected.sourcePrice,
      currency: detected.sourceCurrency,
      priceTnd: detected.totalPriceTND,
      priceToken: detected.priceToken || null,
      priceVerified: false,
      priceVerificationStatus: 'PENDING_MANUAL',
      exchangeRate: null,
      colors: [],
      sizes: [],
      availability: 'unknown',
    });
    setVerifiedPriceUrl(false);
    enterStage('product');
  };

  const repeatHistoryItem = (item: AyrovixHistoryItem) => {
    if (item.kind === 'barcode' && item.inputValue) { void runBarcodeAnalysis(item.inputValue); return; }
    if (item.kind === 'code' && item.inputValue) { void runCodeTextAnalysis(item.inputValue); return; }
    const url = item.sourceUrl || item.inputValue;
    if (url) { void runUrlAnalysis(url, item.kind === 'qr' ? 'qr' : 'url'); return; }
    reset();
  };

  const copyBarcode = async () => {
    if (!barcode) return;
    try { await navigator.clipboard.writeText(barcode.code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };

  const openHistory = () => {
    setMenuOpen(false);
    if (!historyOpen) navigation.pushLayer({ id: 'lens:history' });
  };
  const menu = (
    <LensMoreMenu
      open={menuOpen}
      dark={darkMode}
      onToggleDark={onToggleDarkMode}
      onHistory={openHistory}
      onClose={() => setMenuOpen(false)}
    />
  );

  if (stage === 'live') {
    return (
      <>
        {!historyOpen && <LiveCamera
          onPhoto={(file) => void handleImage(file, true)}
          onQrUrl={(url) => void runUrlAnalysis(url, 'qr')}
          onBarcode={(code) => void runBarcodeAnalysis(code)}
          onCodeText={(value) => void runCodeTextAnalysis(value)}
          onLink={(url) => void runUrlAnalysis(url, 'url')}
          onClose={handleClose}
          onMenu={() => setMenuOpen(true)}
          onCameraFailed={() => replaceStage('home')}
          liveEnabled={liveEnabled}
          onLiveResults={(view) => {
            setCandidatesView(view);
            setVerifiedPriceUrl(false);
            replaceStage('candidates');
          }}
        />}
        <LensHistory open={historyOpen} scope={historyScope} onClose={() => navigation.back()} onRepeat={repeatHistoryItem} onNewScan={reset} />
        {menu}
      </>
    );
  }

  return (
    <div className={`ayrovix-theme-scope fixed inset-0 z-[75] flex flex-col ${darkMode ? 'bg-ink text-white' : 'bg-white text-ink'}`} dir={direction} role="dialog" aria-modal="true" aria-label={tr('AYROVIX Lens', 'عدسة AYROVIX')}>
      <div className="ayrovix-sheet flex h-full flex-col">
        <LensContextHeader
          mode={stage === 'home' ? 'camera' : stage === 'product' ? 'product' : 'result'}
          onExit={handleClose}
          onBack={stage === 'product' ? goBack : reset}
          onCart={onOpenCart}
          cartCount={cartCount}
          onMenu={() => setMenuOpen(true)}
          dark={darkMode}
        />

        <main className="ay-safe-bottom flex-1 overflow-y-auto px-4 py-4 pb-8">
          {stage === 'home' && (
            <div className="lens-home mx-auto max-w-md pt-2">
              <input
                ref={dropInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImage(file, false); e.target.value = ''; }}
              />

              {/* Intro — ماذا يفعل Lens؟ ماذا أضع؟ ماذا سيحدث؟ */}
              <div className="lens-home__intro">
                <h2 className="lens-home__title">
                  {tr('Voyez-le.', 'شاهده.')}<br /><span className="lens-home__accent">LENS</span> {tr('le trouve.', 'يجده.')}
                </h2>
                <p className="lens-home__desc">
                  {tr("Prenez une photo ou importez une image. LENS identifie le produit et recherche les meilleures options disponibles.", 'التقط صورة أو ارفعها — يتعرّف LENS على المنتج ويبحث عن أفضل الخيارات المتاحة.')}
                </p>
                <div className="lens-home__benefits">
                  <span className="lens-home__benefit"><Search size={15} />{tr('Identification du produit', 'تحديد المنتج')}</span>
                  <span className="lens-home__benefit"><Percent size={15} />{tr('Comparaison des prix', 'مقارنة الأسعار')}</span>
                  <span className="lens-home__benefit"><ShieldCheck size={15} />{tr('Vérification de disponibilité', 'التحقق من التوفر')}</span>
                </div>
              </div>

              {/* Dropzone — منطقة كبيرة للرفع/الالتقاط (Drag & Drop) */}
              <button
                type="button"
                className="lens-drop"
                onClick={() => dropInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void handleImage(file, false); }}
              >
                <span className="lens-drop__icon"><GalleryIcon size={22} /></span>
                <strong>{tr('Glissez une image ici', 'أفلِت صورة هنا')}</strong>
                <small>{tr('ou choisissez une méthode ci-dessous', 'أو اختر طريقة أدناه')}</small>
              </button>

              <div className="lens-home__actions">
                <LensCamera onImage={(file) => void handleImage(file, false)} />
                <LensUpload onImage={(file) => void handleImage(file, false)} />
              </div>

              <form
                className="space-y-2.5 rounded-[22px] border border-line bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get('ayrovix-url');
                  if (typeof value === 'string' && value.trim()) void runUrlAnalysis(value.trim(), 'url');
                }}
              >
                <label htmlFor="ayrovix-url-input" className="flex items-center gap-3 text-start">
                  <span>
                    <span className="block text-sm font-extrabold text-ink">{tr('Lien du produit', 'رابط المنتج')}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-muted">SHEIN, Zara, Amazon, AliExpress…</span>
                  </span>
                </label>
                <div className="flex gap-2">
                  <input id="ayrovix-url-input" name="ayrovix-url" type="url" inputMode="url" placeholder="https://…"
                    className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none" />
                  <button type="submit" className="ay-btn-primary flex-none text-xs">{tr('Analyser', 'تحليل')}</button>
                </div>
              </form>
              <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-muted">
                {tr('Caméra inaccessible ? Importez une photo ou collez un lien — AYROVIX identifie le produit et calcule son prix final en dinars.', 'الكاميرا غير متاحة؟ ارفع صورة أو ألصق رابطًا — ستتعرّف AYROVIX على المنتج وتحسب سعره النهائي بالدينار.')}
              </p>
            </div>
          )}

          {stage === 'preview' && previewUrl && (
            <div className="mx-auto max-w-md space-y-4">
              <div className="relative overflow-hidden rounded-[22px] border border-line">
                <img src={previewUrl} alt={tr('Aperçu du produit à analyser', 'معاينة المنتج المراد تحليله')} className="max-h-[62vh] w-full bg-surface object-contain" />
                <div className="lens-scan-dots absolute inset-0" aria-hidden="true" />
              </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={reset} className="ay-btn-secondary text-sm">{tr('Reprendre', 'إعادة الالتقاط')}</button>
                <button type="button" onClick={() => void runImageAnalysis()} className="ay-btn-primary flex-1 text-sm">{tr('Analyser ce produit', 'تحليل هذا المنتج')}</button>
              </div>
            </div>
          )}

          {stage === 'analyzing' && (
            <div className="lens-analyzing mx-auto max-w-md pt-2">
              {/* صورة المستخدم داخل إطار Lens — لا صورة Demo */}
              <div className="lens-frame">
                {previewUrl
                  ? <img src={previewUrl} alt="" className="lens-frame__img" />
                  : <div className="lens-frame__empty"><span className="lens-spinner" /></div>}
                <span className="lens-frame__corner tl" /><span className="lens-frame__corner tr" />
                <span className="lens-frame__corner bl" /><span className="lens-frame__corner br" />
                <span className="lens-frame__beam" aria-hidden="true" />
              </div>

              <div className="lens-analyzing__head" role="status" aria-live="polite">
                <Sparkles size={18} />
                <strong>{[tr('Analyse du produit…', 'جارٍ تحليل المنتج…'), tr('Recherche en cours…', 'جارٍ البحث…'), tr('Vérification du produit…', 'جارٍ التحقق من المنتج…'), tr('Récupération du prix…', 'جارٍ جلب السعر…')][Math.min(analysisProgress, 3)]}</strong>
              </div>
              <p className="lens-analyzing__sub">{tr("AYROVIX analyse l'image et recherche les meilleures correspondances.", 'تحلل AYROVIX الصورة وتبحث عن أفضل التطابقات.')}</p>

              <ol className="lens-steps" aria-label={tr("Étapes de l'analyse", 'مراحل التحليل')}>
                {[tr('Analyse', 'تحليل'), tr('Recherche', 'بحث'), tr('Vérification', 'تحقق'), tr('Prix', 'السعر')].map((label, index) => (
                  <li key={label} className={`lens-step ${index < analysisProgress ? 'is-done' : index === analysisProgress ? 'is-active' : ''}`}>
                    <span className="lens-step__dot">{index < analysisProgress ? <Check size={12} /> : null}</span>
                    <span className="lens-step__label">{label}</span>
                  </li>
                ))}
              </ol>

              <div className="lens-analyzing__card">
                <span className="lens-analyzing__cardicon"><Sparkles size={18} /></span>
                <div>
                  <strong>{tr('AYROVI analyse votre produit', 'AYROVI تحلّل منتجك')}</strong>
                  <p>{tr('Recherche de correspondances fiables et vérification des marchands en cours…', 'جارٍ البحث عن تطابقات موثوقة والتحقق من التجار…')}</p>
                </div>
              </div>
            </div>
          )}

          {stage === 'candidates' && candidatesView && (
            <LensResults
              view={candidatesView}
              fallbackImage={previewUrl}
              onChoose={handleChooseCandidate}
              onReset={reset}
              onCommandDetected={commandDetectedPrice}
            />
          )}

          {stage === 'product' && product && (
            <div className="mx-auto max-w-md space-y-5">
              <ProductResult product={product} ordering={ordering} priceVerified={verifiedPriceUrl} onOrder={(v) => void handleOrder(v)} />

              <button type="button" onClick={reset} className="ay-btn-secondary min-h-12 w-full text-sm">
                {tr('Calculer un autre produit', 'حساب منتج آخر')}
              </button>

              {!verifiedPriceUrl && candidatesView?.list.length ? (
                <button type="button" onClick={goBack} className="ay-btn-secondary min-h-11 w-full text-xs">
                  {tr('Retour aux autres résultats', 'العودة إلى النتائج الأخرى')}
                </button>
              ) : null}

              {urlResult && urlResult.alternates.length > 0 && (
                <section>
                  <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">{tr('Autres correspondances', 'مطابقات أخرى')}</h3>
                  <ProductCandidates candidates={urlResult.alternates} onChoose={handleChooseCandidate} />
                </section>
              )}
            </div>
          )}

          {stage === 'barcode' && barcode && (
            <div className="mx-auto max-w-md space-y-4 pt-6 text-center">
              <p className="text-sm font-extrabold text-ink">{tr('Code-barres détecté', 'تم اكتشاف الرمز الشريطي')}</p>
              <p className="mx-auto w-fit rounded-xl bg-surface px-5 py-3 font-mono text-lg font-bold tracking-[0.15em] text-ink">{barcode.code}</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
                {tr("Aucune offre en ligne ne correspond à ce code pour le moment. Photographiez le produit : AYROVIX l'identifiera par l'image.", 'لا يطابق هذا الرمز أي عرض عبر الإنترنت حاليًا. صوّر المنتج وستتعرّف عليه AYROVIX من الصورة.')}
              </p>
              <div className="flex justify-center gap-2.5">
                <button type="button" onClick={copyBarcode} className="ay-btn-secondary text-xs">
                  {copied ? tr('Copié', 'تم النسخ') : tr('Copier le code', 'نسخ الرمز')}
                </button>
                <button type="button" onClick={reset} className="ay-btn-primary text-xs">{tr('Photographier le produit', 'تصوير المنتج')}</button>
              </div>
            </div>
          )}

          {stage === 'error' && error && (
            <div className="mx-auto max-w-md space-y-4 pt-6 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-danger/5 text-danger">
              </div>
              <p className="text-sm font-extrabold text-ink">{error.code === 'AYROVIX_UNAVAILABLE' ? tr('AYROVIX arrive très bientôt', 'AYROVIX متاحة قريبًا') : tr('Petit obstacle', 'عائق بسيط')}</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">{error.message}</p>
              <div className="flex justify-center gap-2.5">
                {imageFile && error.code !== 'AYROVIX_UNAVAILABLE' && (
                  <button type="button" onClick={() => replaceStage('preview')} className="ay-btn-secondary text-xs">{tr("Revoir l'image", 'مراجعة الصورة')}</button>
                )}
                <button type="button" onClick={reset} className="ay-btn-primary text-xs">{tr('Nouvelle recherche', 'بحث جديد')}</button>
              </div>
            </div>
          )}
        </main>
      </div>
      <LensHistory open={historyOpen} scope={historyScope} onClose={() => navigation.back()} onRepeat={repeatHistoryItem} onNewScan={reset} />
      {menu}
    </div>
  );
};
