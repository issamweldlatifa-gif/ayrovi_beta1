import React, { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type {
  AyrovixCandidate, AyrovixOrderPayload, AyrovixProduct, AyrovixUrlResult,
} from '../types';
import { analyzeBarcode, analyzeImage, analyzeUrl, markChosen, AyrovixApiError } from '../services/lensApi';
import { prepareImage } from '../services/imagePrep';
import { LiveCamera } from './LiveCamera';
import { LensCamera } from './LensCamera';
import { LensUpload } from './LensUpload';
import { ProductCandidates } from './ProductCandidates';
import { ProductResult } from './ProductResult';

interface LensLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  /** Branchement sur le panier/Calculator AYROVI existant (doit throw en cas d'échec). */
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
}

type Stage = 'live' | 'home' | 'preview' | 'analyzing' | 'candidates' | 'product' | 'barcode' | 'error';

interface CandidatesView {
  queryLabel: string | null;
  list: AyrovixCandidate[];
  eventId: string;
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
    images: candidate.image ? [candidate.image] : [],
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
  const previewRef = useRef<string | null>(null);
  const abortRef = useRef(0);

  useBodyScrollLock(isOpen);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  if (!isOpen) return null;

  const reset = () => {
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
  };

  const handleClose = () => { reset(); onClose(); };

  const fail = (code: string, message: string) => { setError({ code, message }); setStage('error'); };

  /** Image (caméra live, galerie ou repli) → préparation → analyse immédiate ou prévisualisation. */
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
    const token = ++abortRef.current;
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeImage(file);
      if (abortRef.current !== token) return;
      const usable = result.identification.confidence > 0 && result.identification.description !== 'PRODUIT_NON_IDENTIFIE';
      if (!usable) { fail('IDENTIFICATION_FAILED', NEW_SCAN_MESSAGE); return; }
      setCandidatesView({ queryLabel: result.query || null, list: result.candidates, eventId: result.eventId });
      setStage('candidates');
    } catch (err: any) {
      if (abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(apiError?.code || 'UNKNOWN', apiError?.message || "L'analyse a échoué. Vérifiez votre connexion.");
    }
  };

  const runUrlAnalysis = async (url: string, channel: 'url' | 'qr') => {
    const token = ++abortRef.current;
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeUrl(url, channel);
      if (abortRef.current !== token) return;
      setUrlResult(result);
      setProduct(result.product);
      setStage('product');
    } catch (err: any) {
      if (abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(
        apiError?.code || 'UNKNOWN',
        apiError?.code === 'EXTRACTION_FAILED'
          ? 'Impossible de récupérer toutes les informations automatiquement. Photographiez le produit ou sa page : AYROVIX le lira pour vous.'
          : (apiError?.message || "L'analyse du lien a échoué."),
      );
    }
  };

  const runBarcodeAnalysis = async (code: string) => {
    const token = ++abortRef.current;
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeBarcode(code);
      if (abortRef.current !== token) return;
      if (result.candidates.length) {
        setCandidatesView({ queryLabel: `Code-barres ${result.code}`, list: result.candidates, eventId: result.eventId });
        setStage('candidates');
      } else {
        setBarcode({ code: result.code, eventId: result.eventId });
        setStage('barcode');
      }
    } catch (err: any) {
      if (abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      fail(apiError?.code || 'UNKNOWN', apiError?.message || "Lecture du code impossible. Réessayez.");
    }
  };

  const handleChooseCandidate = async (candidate: AyrovixCandidate) => {
    if (candidatesView?.eventId) markChosen(candidatesView.eventId);

    // Si candidat externe avec URL (DuckDuckGo Free, Brave, SerpAPI...), tente de récupérer la fiche complète
    // avec image, tailles, couleurs, prix via /api/ayrovix/analyze-url (fallback gratuit inclus)
    if (candidate.sourceUrl && candidate.kind !== 'catalog') {
      const token = ++abortRef.current;
      setStage('analyzing');
      setError(null);
      try {
        const result = await analyzeUrl(candidate.sourceUrl, 'url');
        if (abortRef.current !== token) return;
        setUrlResult(result);
        setProduct(result.product);
        setStage('product');
        return;
      } catch (err: any) {
        if (abortRef.current !== token) return;
        // Fallback: affiche le candidat tel quel si le scraping complet échoue (pas de blocage)
        console.warn('[AYROVIX choose] analyze-url fallback failed, using candidate directly', err?.message);
      }
    }

    // Catalogue ou fallback rapide
    setProduct(candidateToProduct(candidate));
    setStage('product');
  };

  const handleOrder = async ({ size, color }: { size: string; color: string }) => {
    if (!product || product.price == null || !product.currency) return;
    if (urlResult?.eventId) markChosen(urlResult.eventId);
    const variant = [size && `Taille: ${size}`, color && `Couleur: ${color}`].filter(Boolean).join(' · ');
    setOrdering(true);
    setError(null);
    try {
      await onOrder({
        store: toStoreKey(product.sourceUrl || product.source),
        externalId: null,
        url: product.sourceUrl || '',
        title: product.title,
        imageUrl: product.image || '',
        sourcePrice: product.price,
        sourceCurrency: product.currency,
        priceTND: product.priceTnd ?? 0,
        variant: variant || undefined,
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

  /* ══════════════ RENDU ══════════════ */

  if (stage === 'live') {
    return (
      <LiveCamera
        onPhoto={(file) => void handleImage(file, true)}
        onQrUrl={(url) => void runUrlAnalysis(url, 'qr')}
        onBarcode={(code) => void runBarcodeAnalysis(code)}
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
          {/* ── Repli sans caméra ── */}
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

          {/* ── Prévisualisation (repli sans caméra) ── */}
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

          {/* ── Analyse ── */}
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
              <p className="text-center text-[11px] text-muted">Identification du produit, puis recherche des meilleures correspondances.</p>
            </div>
          )}

          {/* ── Candidats (photo, URL ou code-barres) ── */}
          {stage === 'candidates' && candidatesView && (
            <div className="mx-auto max-w-md space-y-4">
              {candidatesView.queryLabel && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-center text-[11px] font-semibold text-muted">
                  Recherche : <span className="font-extrabold text-ink">{candidatesView.queryLabel}</span>
                </p>
              )}
              {candidatesView.list.length > 0 ? (
                <ProductCandidates candidates={candidatesView.list} onChoose={handleChooseCandidate} />
              ) : (
                <div className="space-y-4 rounded-[22px] border border-dashed border-line p-6 text-center">
                  <p className="text-sm font-extrabold text-ink">Aucune correspondance fiable</p>
                  <p className="text-xs leading-relaxed text-muted">Produit identifié, mais aucune offre ne correspond assez. Essayez le lien direct de la page boutique pour un calcul exact.</p>
                  <button type="button" onClick={reset} className="min-h-[46px] rounded-xl bg-ink px-5 text-xs font-extrabold text-white">Nouvelle recherche</button>
                </div>
              )}
            </div>
          )}

          {/* ── Fiche produit ── */}
          {stage === 'product' && product && (
            <div className="mx-auto max-w-md space-y-5">
              <ProductResult product={product} ordering={ordering} onOrder={(v) => void handleOrder(v)} />
              {urlResult && urlResult.alternates.length > 0 && (
                <section>
                  <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">Autres correspondances</h3>
                  <ProductCandidates candidates={urlResult.alternates} onChoose={(c) => setProduct(candidateToProduct(c))} />
                </section>
              )}
            </div>
          )}

          {/* ── Code-barres lu sans offre en ligne ── */}
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

          {/* ── Erreur / réessaie ── */}
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
