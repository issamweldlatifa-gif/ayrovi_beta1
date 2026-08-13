import React, { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type {
  AyrovixCandidate, AyrovixDetectedPrice, AyrovixOrderPayload, AyrovixProduct, AyrovixReviewRequest, AyrovixUrlResult, AyrovixVariantOption,
} from '../types';
import { analyzeBarcode, analyzeCode, analyzeImage, analyzeUrl, markChosen, requestManualReview, AyrovixApiError } from '../services/lensApi';
import { prepareImage } from '../services/imagePrep';
import { LiveCamera } from './LiveCamera';
import { LensCamera } from './LensCamera';
import { LensUpload } from './LensUpload';
import { ProductCandidates } from './ProductCandidates';
import { ProductResult } from './ProductResult';

interface LensLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
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
    exchangeRate: null,
    colors: candidate.colors,
    sizes: candidate.sizes,
    availability: candidate.kind === 'catalog' ? 'in_stock' : 'unknown',
  };
}

const NEW_SCAN_MESSAGE = 'Cadrez le produit dans un bon éclairage, ou collez son lien direct.';

export const LensLauncher: React.FC<LensLauncherProps> = ({ isOpen, onClose, onOrder }) => {
  const cameraCapable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const [stage, setStage] = useState<Stage>(cameraCapable ? 'live' : 'home');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [candidatesView, setCandidatesView] = useState<CandidatesView | null>(null);
  const [urlResult, setUrlResult] = useState<AyrovixUrlResult | null>(null);
  const [product, setProduct] = useState<AyrovixProduct | null>(null);
  const [barcode, setBarcode] = useState<{ code: string; eventId: string } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifyLink, setVerifyLink] = useState('');
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [verifiedPriceUrl, setVerifiedPriceUrl] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewContact, setReviewContact] = useState('');
  const [reviewDesiredSize, setReviewDesiredSize] = useState('');
  const [reviewDesiredColor, setReviewDesiredColor] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<AyrovixReviewRequest | null>(null);
  const [reviewError, setReviewError] = useState('');
  const previewRef = useRef<string | null>(null);
  const abortRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => () => {
    requestAbortRef.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

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

  const reset = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    abortRef.current += 1;
    setStage(cameraCapable ? 'live' : 'home');
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
    setVerifyLink('');
    setVerifyingLink(false);
    setVerifiedPriceUrl(false);
    setReviewOpen(false);
    setReviewContact('');
    setReviewDesiredSize('');
    setReviewDesiredColor('');
    setReviewSubmitting(false);
    setReviewRequest(null);
    setReviewError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const fail = (code: string, message: string) => { setError({ code, message }); setStage('error'); };
  const clearReview = () => {
    setReviewOpen(false);
    setReviewDesiredSize('');
    setReviewDesiredColor('');
    setReviewSubmitting(false);
    setReviewRequest(null);
    setReviewError('');
  };

  const handleImage = async (file: File, autoAnalyze: boolean) => {
    setError(null);
    const prepared = await prepareImage(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = prepared.previewUrl;
    setPreviewUrl(prepared.previewUrl);
    setImageFile(prepared.file);
    if (autoAnalyze) void runImageAnalysis(prepared.file);
    else setStage('preview');
  };

  const runImageAnalysis = async (fileOverride?: File) => {
    const file = fileOverride || imageFile;
    if (!file) return;
    const { controller, token } = startRequest();
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeImage(file, controller.signal);
      if (abortRef.current !== token) return;
      const usable = result.identification.confidence > 0 && result.identification.description !== 'PRODUIT_NON_IDENTIFIE';
      if (!usable && !result.detectedPrice) { fail('IDENTIFICATION_FAILED', NEW_SCAN_MESSAGE); return; }
      setCandidatesView({
        queryLabel: result.query || result.detectedPrice?.title || null,
        list: result.candidates,
        eventId: result.eventId,
        detectedPrice: result.detectedPrice || null,
      });
      setVerifiedPriceUrl(false);
      setStage('candidates');
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
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeUrl(url, channel, controller.signal);
      if (abortRef.current !== token) return;
      const merchantPriceVerified = Number.isFinite(result.product.price)
        && Number(result.product.price) > 0 && Boolean(result.product.currency);
      setUrlResult(result);
      setProduct(result.product);
      setVerifiedPriceUrl(merchantPriceVerified);
      if (!merchantPriceVerified && result.product.sourceUrl) setVerifyLink(result.product.sourceUrl);
      setStage('product');
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
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeCode(value, controller.signal);
      if (abortRef.current !== token) return;
      if (result.candidates.length) {
        setCandidatesView({ queryLabel: `QR ${result.code}`, list: result.candidates, eventId: result.eventId });
        setStage('candidates');
      } else {
        setBarcode({ code: result.code, eventId: result.eventId });
        setStage('barcode');
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
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeBarcode(code, controller.signal);
      if (abortRef.current !== token) return;
      if (result.candidates.length) {
        setCandidatesView({ queryLabel: `Code-barres ${result.code}`, list: result.candidates, eventId: result.eventId });
        setStage('candidates');
      } else {
        setBarcode({ code: result.code, eventId: result.eventId });
        setStage('barcode');
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
    clearReview();
    if (candidatesView?.eventId) markChosen(candidatesView.eventId);
    if (candidate.sourceUrl && candidate.kind !== 'catalog') {
      const { controller, token } = startRequest();
      setStage('analyzing');
      setError(null);
      try {
        const result = await analyzeUrl(candidate.sourceUrl, 'url', controller.signal);
        if (abortRef.current !== token) return;
        const merchantPriceVerified = Number.isFinite(result.product.price)
          && Number(result.product.price) > 0 && Boolean(result.product.currency);
        setUrlResult(result);
        if (merchantPriceVerified) {
          setProduct(result.product);
        } else {
          // Keep the useful Lens title/image, but never promote a Lens price to a verified merchant price.
          const lensProduct = candidateToProduct(candidate);
          setProduct({
            ...lensProduct,
            description: result.product.description || lensProduct.description,
            colors: result.product.colors.length ? result.product.colors : lensProduct.colors,
            sizes: result.product.sizes.length ? result.product.sizes : lensProduct.sizes,
          });
          setVerifyLink(candidate.sourceUrl);
        }
        setVerifiedPriceUrl(merchantPriceVerified);
        setStage('product');
        return;
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        // Network/extraction failure: show the match, but require link verification before ordering.
        setVerifyLink(candidate.sourceUrl);
      } finally {
        finishRequest(controller);
      }
    }
    setProduct(candidateToProduct(candidate));
    setVerifiedPriceUrl(candidate.kind === 'catalog');
    setStage('product');
  };

  const handleVerifyLink = async () => {
    if (!verifyLink.trim() || !product) return;
    const { controller } = startRequest();
    setVerifyingLink(true);
    try {
      const result = await analyzeUrl(verifyLink.trim(), 'url', controller.signal);
      if (!Number.isFinite(result.product.price) || Number(result.product.price) <= 0 || !result.product.currency) {
        throw new Error("Le lien est accessible, mais son prix n'a pas pu être vérifié. Utilisez le lien direct de la fiche produit.");
      }
      setProduct(result.product);
      setUrlResult(result);
      setVerifiedPriceUrl(true);
      setVerifyLink('');
    } catch (e: any) {
      if (!controller.signal.aborted && e?.name !== 'AbortError') alert(e?.message || 'Lien invalide');
    } finally {
      finishRequest(controller);
      setVerifyingLink(false);
    }
  };

  const handleReviewRequest = async () => {
    if (!product) return;
    const reviewSourceUrl = product.sourceUrl || verifyLink.trim();
    if (!reviewSourceUrl) {
      setReviewError('Collez le lien direct du produit à vérifier.');
      return;
    }
    if (!reviewContact.trim()) {
      setReviewError('Ajoutez un numéro de téléphone ou un e-mail pour être recontacté.');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const saved = await requestManualReview({
        eventId: urlResult?.eventId || candidatesView?.eventId,
        sourceUrl: reviewSourceUrl,
        title: product.title,
        imageUrl: product.image || candidatesView?.detectedPrice?.imageUrl || undefined,
        source: product.source,
        lensPrice: product.price ?? candidatesView?.detectedPrice?.sourcePrice ?? null,
        lensCurrency: product.currency ?? candidatesView?.detectedPrice?.sourceCurrency ?? null,
        desiredSize: reviewDesiredSize,
        desiredColor: reviewDesiredColor,
        contact: reviewContact.trim(),
      });
      setReviewRequest(saved);
    } catch (e: any) {
      setReviewError(e instanceof AyrovixApiError ? e.message : "La demande n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleOrder = async ({ size, color, option }: { size: string; color: string; option: AyrovixVariantOption | null }) => {
    if (!product || (option?.price == null && product.price == null && !candidatesView?.detectedPrice)) return;
    // Claude/Lens prices are estimates; only a local catalog price or a merchant-page price can be ordered.
    if (!verifiedPriceUrl) {
      alert('Vérifiez le lien direct de la fiche marchand avant de commander avec ce prix.');
      return;
    }
    if (urlResult?.eventId) markChosen(urlResult.eventId);
    const variant = [size && `Taille: ${size}`, color && `Couleur: ${color}`].filter(Boolean).join(' · ');
    setOrdering(true);
    setError(null);
    try {
      const finalPrice = option?.price ?? product.price ?? candidatesView?.detectedPrice?.sourcePrice ?? 0;
      const finalCurrency = option?.currency ?? product.currency ?? candidatesView?.detectedPrice?.sourceCurrency ?? 'EUR';
      await onOrder({
        store: toStoreKey(product.sourceUrl || product.source || verifyLink || ''),
        externalId: option?.id || null,
        url: product.sourceUrl || verifyLink || '',
        title: product.title,
        imageUrl: product.image || candidatesView?.detectedPrice?.imageUrl || '',
        sourcePrice: finalPrice,
        sourceCurrency: finalCurrency,
        priceTND: option?.priceTnd ?? product.priceTnd ?? candidatesView?.detectedPrice?.totalPriceTND ?? 0,
        variant: option?.label || variant || undefined,
        quantity: 1,
      });
      handleClose();
    } catch {
      setError({ code: 'ORDER_FAILED', message: "L'article n'a pas pu être ajouté au panier. Réessayez." });
      setOrdering(false);
    }
  };

  const copyBarcode = async () => {
    if (!barcode) return;
    try { await navigator.clipboard.writeText(barcode.code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };

  if (stage === 'live') {
    return (
      <LiveCamera
        onPhoto={(file) => void handleImage(file, true)}
        onQrUrl={(url) => void runUrlAnalysis(url, 'qr')}
        onBarcode={(code) => void runBarcodeAnalysis(code)}
        onCodeText={(value) => void runCodeTextAnalysis(value)}
        onLink={(url) => void runUrlAnalysis(url, 'url')}
        onClose={handleClose}
        onCameraFailed={() => setStage('home')}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="AYROVIX Lens">
      <div className="ayrovix-sheet flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="bg-brand-gradient grid h-9 w-9 flex-none place-items-center rounded-xl text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold leading-tight text-ink">AYROVIX</p>
            <p className="truncate text-[11px] font-semibold text-muted">
              {stage === 'home' && "Trouvez n'importe quel produit."}
              {stage === 'preview' && 'Vérifiez votre image'}
              {stage === 'analyzing' && 'Analyse en cours…'}
              {stage === 'candidates' && 'Confirmez votre article'}
              {stage === 'product' && 'Votre produit'}
              {stage === 'barcode' && 'Code détecté'}
              {stage === 'error' && 'On réessaie ?'}
            </p>
          </div>
          {(stage === 'candidates' || stage === 'product' || stage === 'barcode' || stage === 'preview' || stage === 'error') && (
            <button type="button" onClick={reset} className="rounded-full px-3 py-2 text-[11px] font-bold text-brand transition hover:bg-brand-light">
              Caméra
            </button>
          )}
          <button type="button" onClick={handleClose} aria-label="Fermer AYROVIX"
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition active:scale-95">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 pb-8">
          {stage === 'home' && (
            <div className="mx-auto max-w-md space-y-3 pt-2">
              <LensCamera onImage={(file) => void handleImage(file, false)} />
              <LensUpload onImage={(file) => void handleImage(file, false)} />
              <form
                className="space-y-2.5 rounded-[22px] border border-line bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get('ayrovix-url');
                  if (typeof value === 'string' && value.trim()) void runUrlAnalysis(value.trim(), 'url');
                }}
              >
                <label htmlFor="ayrovix-url-input" className="flex items-center gap-3 text-left">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-light text-brand">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-ink">Lien du produit</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-muted">SHEIN, Zara, Amazon, AliExpress…</span>
                  </span>
                </label>
                <div className="flex gap-2">
                  <input id="ayrovix-url-input" name="ayrovix-url" type="url" inputMode="url" placeholder="https://…"
                    className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none" />
                  <button type="submit" className="min-h-[46px] flex-none rounded-xl bg-ink px-4 text-xs font-extrabold text-white transition active:scale-95">Analyser</button>
                </div>
              </form>
              <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-muted">
                Caméra inaccessible ? Importez une photo ou collez un lien — AYROVIX identifie le produit et calcule son prix final en dinars.
              </p>
            </div>
          )}

          {stage === 'preview' && previewUrl && (
            <div className="mx-auto max-w-md space-y-4">
              <div className="relative overflow-hidden rounded-[22px] border border-line">
                <img src={previewUrl} alt="Aperçu du produit à analyser" className="max-h-[46vh] w-full bg-surface object-contain" />
              </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={reset} className="min-h-[52px] rounded-2xl border border-line px-5 text-sm font-bold text-ink transition hover:border-ink">Reprendre</button>
                <button type="button" onClick={() => void runImageAnalysis()} className="bg-brand-gradient min-h-[52px] flex-1 rounded-2xl px-5 text-sm font-extrabold text-white shadow-lg transition active:scale-[0.98]">Analyser ce produit</button>
              </div>
            </div>
          )}

          {stage === 'analyzing' && (
            <div className="mx-auto max-w-md space-y-4 pt-2">
              <div className="relative overflow-hidden rounded-[22px] border border-line">
                {previewUrl
                  ? <img src={previewUrl} alt="" className="max-h-[46vh] w-full bg-surface object-contain opacity-90" />
                  : <div className="grid h-52 w-full place-items-center bg-surface"><span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-r-transparent" /></div>}
                <div className="lens-scan absolute inset-0" />
              </div>
              <div className="flex items-center justify-center gap-2.5 text-sm font-bold text-ink">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-r-transparent" />
                AYROVIX analyse…
              </div>
              <p className="text-center text-[11px] text-muted">Analyse instantanée AYROVIX — prix et correspondances en cours.</p>
            </div>
          )}

          {stage === 'candidates' && candidatesView && (
            <div className="mx-auto max-w-md space-y-4">
              {candidatesView.detectedPrice && candidatesView.detectedPrice.sourcePrice > 0 && (
                <>
                  {/* Prix visible lu par Claude dans la même analyse d’image. */}
                  <div className="overflow-hidden rounded-[22px] border-2 border-brand bg-white shadow-lg">
                    <div className="relative aspect-[4/3] bg-surface">
                      {(candidatesView.detectedPrice.imageUrl || previewUrl) ? (
                        <img
                          src={candidatesView.detectedPrice.imageUrl || previewUrl || ''}
                          alt={candidatesView.detectedPrice.title}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M8 6V5a4 4 0 0 1 8 0v1" /></svg>
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-extrabold text-ink">Prix repéré</span>
                      <span className="absolute right-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-bold text-white">{candidatesView.detectedPrice.sourceCurrency}</span>
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <h3 className="text-[15px] font-extrabold leading-snug text-ink line-clamp-2">
                          {candidatesView.detectedPrice.title || candidatesView.queryLabel || 'Produit détecté par Claude'}
                        </h3>
                        <p className="mt-1 text-[11px] text-muted">
                          {candidatesView.detectedPrice.isCartScreenshot ? '🛒 Panier repéré — total calculé' : '✨ Produit repéré sur l’image'} • {candidatesView.detectedPrice.brand || 'Collection AYROVI'}
                        </p>
                      </div>
                      <div className="flex items-end justify-between rounded-2xl bg-amber-50 p-3.5 border border-amber-200">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Prix visible (Claude)</p>
                          <p className="text-sm font-bold text-ink">{candidatesView.detectedPrice.sourcePrice.toFixed(2)} {candidatesView.detectedPrice.sourceCurrency}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Prix final estimé</p>
                          <p className="text-lg font-extrabold text-ink">≈ {candidatesView.detectedPrice.totalPriceTND?.toFixed(2) || '—'} DT</p>
                          <p className="text-[9px] text-emerald-600 font-semibold">Tout inclus</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const detected = candidatesView!.detectedPrice!;
                          setProduct({
                            title: detected.title || candidatesView!.queryLabel || 'Produit repéré par AYROVIX',
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
                            exchangeRate: null,
                            colors: [],
                            sizes: [],
                            availability: 'unknown',
                          });
                          setVerifiedPriceUrl(false);
                          setStage('product');
                        }}
                        className="bg-brand-gradient flex min-h-[48px] w-full items-center justify-center rounded-2xl px-5 text-sm font-extrabold text-white shadow"
                      >
                        Commander avec ce prix • {candidatesView.detectedPrice.totalPriceTND?.toFixed(2) || candidatesView.detectedPrice.sourcePrice.toFixed(2)} DT
                      </button>
                      <p className="text-center text-[10px] font-semibold text-amber-800">⚠️ Avant commande, collez le lien du produit pour vérification (comme demandé).</p>
                    </div>
                  </div>

                  <div className="rounded-[16px] bg-surface px-3 py-2 text-center">
                    <p className="text-[11px] font-bold text-muted">Ou choisissez une correspondance externe ci-dessous</p>
                  </div>
                </>
              )}
              {candidatesView.queryLabel && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-center text-[11px] font-semibold text-muted">
                  Recherche : <span className="font-extrabold text-ink">{candidatesView.queryLabel}</span>
                </p>
              )}
              {candidatesView.list.length > 0 ? (
                <ProductCandidates candidates={candidatesView.list} onChoose={handleChooseCandidate} />
              ) : (
                <div className="space-y-4 rounded-[22px] border border-dashed border-line p-6 text-center">
                  <p className="text-sm font-extrabold text-ink">Aucune correspondance externe</p>
                  {candidatesView.detectedPrice && candidatesView.detectedPrice.sourcePrice > 0 ? (
                    <p className="text-xs text-muted">Utilisez le prix visible ci-dessus puis vérifiez le lien avant commande.</p>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted">Essayez le lien direct de la page boutique pour un calcul exact.</p>
                  )}
                  <button type="button" onClick={reset} className="min-h-[46px] rounded-xl bg-ink px-5 text-xs font-extrabold text-white">Nouvelle recherche</button>
                </div>
              )}
            </div>
          )}

          {stage === 'product' && product && (
            <div className="mx-auto max-w-md space-y-5">
              <ProductResult product={product} ordering={ordering} priceVerified={verifiedPriceUrl} onOrder={(v) => void handleOrder(v)} />

              {verifiedPriceUrl ? (
                <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] font-bold text-emerald-800">✅ Prix confirmé par la source sélectionnée</p>
                  <p className="mt-1 text-[10px] text-emerald-700">Source : {product.source}. Les tailles et couleurs ne sont affichées que si la source les fournit.</p>
                </div>
              ) : (
                <div className="rounded-[20px] border border-brand/20 bg-brand-light/30 p-4">
                  <p className="text-xs font-extrabold text-ink">🔗 Prix marchand non confirmé automatiquement</p>
                  <p className="mt-1 text-[11px] text-muted">Ce magasin protège sa page ou ne publie pas de prix exploitable. Essayez le lien direct ou revenez aux autres résultats Lens.</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="url"
                      value={verifyLink}
                      onChange={(e)=>setVerifyLink(e.target.value)}
                      placeholder="https://..."
                      className="min-h-[44px] flex-1 rounded-xl border border-line bg-white px-3 text-sm"
                    />
                    <button type="button" onClick={handleVerifyLink} disabled={verifyingLink || !verifyLink.trim()} className="min-h-[44px] rounded-xl bg-ink px-4 text-xs font-bold text-white disabled:opacity-40">
                      {verifyingLink ? '...' : 'Vérifier'}
                    </button>
                  </div>
                  {candidatesView?.list.length ? (
                    <button type="button" onClick={() => setStage('candidates')} className="mt-2 min-h-[42px] w-full rounded-xl border border-line bg-white px-4 text-xs font-bold text-ink">
                      Retour aux autres résultats
                    </button>
                  ) : null}

                  {!reviewRequest && !reviewOpen && (
                    <button
                      type="button"
                      onClick={() => { setReviewOpen(true); setReviewError(''); }}
                      className="mt-2 min-h-[46px] w-full rounded-xl bg-brand px-4 text-xs font-extrabold text-white"
                    >
                      Demander la vérification du prix
                    </button>
                  )}

                  {reviewOpen && !reviewRequest && (
                    <div className="mt-3 space-y-2.5 rounded-2xl border border-line bg-white p-3.5">
                      <div>
                        <p className="text-xs font-extrabold text-ink">AYROVI vérifie ce produit pour vous</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">La demande sera enregistrée et envoyée à notre équipe. Aucun prix Lens ne sera utilisé pour le paiement.</p>
                      </div>
                      {!product.sourceUrl && (
                        <input
                          type="url"
                          value={verifyLink}
                          onChange={(e) => setVerifyLink(e.target.value)}
                          placeholder="Lien direct du produit *"
                          className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 text-sm"
                        />
                      )}
                      <input
                        type="text"
                        value={reviewContact}
                        onChange={(e) => setReviewContact(e.target.value)}
                        placeholder="Téléphone ou e-mail *"
                        autoComplete="email"
                        className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={reviewDesiredSize}
                          onChange={(e) => setReviewDesiredSize(e.target.value)}
                          placeholder="Taille souhaitée"
                          className="min-h-[42px] min-w-0 rounded-xl border border-line bg-surface px-3 text-xs"
                        />
                        <input
                          type="text"
                          value={reviewDesiredColor}
                          onChange={(e) => setReviewDesiredColor(e.target.value)}
                          placeholder="Couleur souhaitée"
                          className="min-h-[42px] min-w-0 rounded-xl border border-line bg-surface px-3 text-xs"
                        />
                      </div>
                      {reviewError && <p role="alert" className="text-[11px] font-semibold text-red-600">{reviewError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setReviewOpen(false)} disabled={reviewSubmitting} className="min-h-[44px] rounded-xl border border-line px-4 text-xs font-bold text-ink disabled:opacity-50">Annuler</button>
                        <button type="button" onClick={() => void handleReviewRequest()} disabled={reviewSubmitting} className="min-h-[44px] flex-1 rounded-xl bg-brand px-4 text-xs font-extrabold text-white disabled:opacity-50">
                          {reviewSubmitting ? 'Enregistrement…' : 'Envoyer la demande'}
                        </button>
                      </div>
                    </div>
                  )}

                  {reviewRequest && (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5" role="status">
                      <p className="text-xs font-extrabold text-emerald-800">✓ Demande enregistrée</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-emerald-700">Notre équipe a reçu votre demande et vous contactera après vérification du prix, du stock et de la variante.</p>
                      <p className="mt-2 font-mono text-[10px] font-bold text-emerald-900">Réf. {reviewRequest.id}</p>
                    </div>
                  )}
                </div>
              )}

              {urlResult && urlResult.alternates.length > 0 && (
                <section>
                  <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">Autres correspondances</h3>
                  <ProductCandidates candidates={urlResult.alternates} onChoose={handleChooseCandidate} />
                </section>
              )}
            </div>
          )}

          {stage === 'barcode' && barcode && (
            <div className="mx-auto max-w-md space-y-4 pt-6 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-light text-brand">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6v12M8 6v12M12 6v12M17 6v12M20 6v12" strokeLinecap="round" /></svg>
              </div>
              <p className="text-sm font-extrabold text-ink">Code-barres détecté</p>
              <p className="mx-auto w-fit rounded-xl bg-surface px-5 py-3 font-mono text-lg font-bold tracking-[0.15em] text-ink">{barcode.code}</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
                Aucune offre en ligne ne correspond à ce code pour le moment. Photographiez le produit : AYROVIX l'identifiera par l'image.
              </p>
              <div className="flex justify-center gap-2.5">
                <button type="button" onClick={copyBarcode} className="min-h-[46px] rounded-xl border border-line px-5 text-xs font-bold text-ink">
                  {copied ? 'Copié ✓' : 'Copier le code'}
                </button>
                <button type="button" onClick={reset} className="bg-brand-gradient min-h-[46px] rounded-xl px-5 text-xs font-extrabold text-white">Photographier le produit</button>
              </div>
            </div>
          )}

          {stage === 'error' && error && (
            <div className="mx-auto max-w-md space-y-4 pt-6 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>
              </div>
              <p className="text-sm font-extrabold text-ink">{error.code === 'AYROVIX_UNAVAILABLE' ? 'AYROVIX arrive très bientôt' : 'Petit obstacle'}</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">{error.message}</p>
              <div className="flex justify-center gap-2.5">
                {imageFile && error.code !== 'AYROVIX_UNAVAILABLE' && (
                  <button type="button" onClick={() => setStage('preview')} className="min-h-[46px] rounded-xl border border-line px-5 text-xs font-bold text-ink">Revoir l'image</button>
                )}
                <button type="button" onClick={reset} className="bg-brand-gradient min-h-[46px] rounded-xl px-5 text-xs font-extrabold text-white">Nouvelle recherche</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
