import React, { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type {
  AyrovixCandidate, AyrovixImageResult, AyrovixOrderPayload,
  AyrovixProduct, AyrovixUrlResult,
} from '../types';
import { analyzeImage, analyzeUrl, markChosen, AyrovixApiError } from '../services/lensApi';
import { prepareImage } from '../services/imagePrep';
import { LensCamera } from './LensCamera';
import { LensUpload } from './LensUpload';
import { QRScanner } from './QRScanner';
import { ProductCandidates } from './ProductCandidates';
import { ProductResult } from './ProductResult';

interface LensLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  /** Branchement sur le panier/Calculator AYROVI existant (doit throw en cas d'échec). */
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
}

type Stage = 'home' | 'preview' | 'analyzing' | 'candidates' | 'product' | 'error';

type LinkMode = 'closed' | 'url' | 'qr';

const STAGE_TITLE: Record<Stage, string> = {
  home: 'Trouvez n\'importe quel produit.',
  preview: 'Vérifiez votre image',
  analyzing: 'Analyse en cours…',
  candidates: 'Confirmez votre article',
  product: 'Votre produit',
  error: 'On réessaie ?',
};

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

export const LensLauncher: React.FC<LensLauncherProps> = ({ isOpen, onClose, onOrder }) => {
  const [stage, setStage] = useState<Stage>('home');
  const [linkMode, setLinkMode] = useState<LinkMode>('closed');
  const [urlInput, setUrlInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageResult, setImageResult] = useState<AyrovixImageResult | null>(null);
  const [urlResult, setUrlResult] = useState<AyrovixUrlResult | null>(null);
  const [product, setProduct] = useState<AyrovixProduct | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [ordering, setOrdering] = useState(false);
  const previewRef = useRef<string | null>(null);
  const abortRef = useRef(0);

  useBodyScrollLock(isOpen);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  if (!isOpen) return null;

  const reset = () => {
    abortRef.current += 1; // invalide toute réponse en vol
    setStage('home');
    setLinkMode('closed');
    setUrlInput('');
    if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = null; }
    setPreviewUrl(null);
    setImageFile(null);
    setImageResult(null);
    setUrlResult(null);
    setProduct(null);
    setError(null);
    setOrdering(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleImage = async (file: File) => {
    setError(null);
    const prepared = await prepareImage(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = prepared.previewUrl;
    setPreviewUrl(prepared.previewUrl);
    setImageFile(prepared.file);
    setLinkMode('closed');
    setStage('preview');
  };

  const runImageAnalysis = async () => {
    if (!imageFile) return;
    const token = ++abortRef.current;
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeImage(imageFile);
      if (abortRef.current !== token) return;
      setImageResult(result);
      const usable = result.identification.confidence > 0 && result.identification.description !== 'PRODUIT_NON_IDENTIFIE';
      if (!usable) {
        setError({ code: 'IDENTIFICATION_FAILED', message: "Produit non identifié. Centrez l'article avec un bon éclairage, ou envoyez une capture de la page boutique." });
        setStage('error');
        return;
      }
      setStage('candidates');
    } catch (err: any) {
      if (abortRef.current !== token) return;
      const apiError = err instanceof AyrovixApiError ? err : null;
      setError({ code: apiError?.code || 'UNKNOWN', message: apiError?.message || "L'analyse a échoué. Vérifiez votre connexion." });
      setStage('error');
    }
  };

  const runUrlAnalysis = async (url: string, channel: 'url' | 'qr') => {
    const token = ++abortRef.current;
    setLinkMode('closed');
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
      // Fallback demandé par le cahier des charges : proposer la capture d'écran (Vision).
      setError({
        code: apiError?.code || 'UNKNOWN',
        message: apiError?.code === 'EXTRACTION_FAILED'
          ? 'Impossible de récupérer toutes les informations automatiquement. Envoyez une capture de la page : AYROVIX la lira pour vous.'
          : (apiError?.message || "L'analyse du lien a échoué."),
      });
      setStage('error');
    }
  };

  const handleChooseCandidate = (candidate: AyrovixCandidate) => {
    if (imageResult?.eventId) markChosen(imageResult.eventId);
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
        priceTND: product.priceTnd ?? 0, // le serveur recalcule toujours (Calculator = source de vérité)
        variant: variant || undefined,
        quantity: 1,
      });
      handleClose();
    } catch {
      setError({ code: 'ORDER_FAILED', message: "L'article n'a pas pu être ajouté au panier. Réessayez." });
      setOrdering(false);
    }
  };

  const bestImage = previewUrl || product?.image || null;

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="AYROVIX Lens">
      <div className="ayrovix-sheet flex h-full flex-col">
        {/* En-tête */}
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="bg-brand-gradient grid h-9 w-9 flex-none place-items-center rounded-xl text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold leading-tight text-ink">AYROVIX</p>
            <p className="truncate text-[11px] font-semibold text-muted">{STAGE_TITLE[stage]}</p>
          </div>
          {stage !== 'home' && stage !== 'analyzing' && (
            <button type="button" onClick={reset} className="rounded-full px-3 py-2 text-[11px] font-bold text-brand transition hover:bg-brand-light">
              Nouveau
            </button>
          )}
          <button type="button" onClick={handleClose} aria-label="Fermer AYROVIX"
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition active:scale-95">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>

        {/* Corps */}
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-8">
          {stage === 'home' && (
            <div className="mx-auto max-w-md space-y-3 pt-2">
              <LensCamera onImage={handleImage} />
              <LensUpload onImage={handleImage} />

              {/* 🔗 Lien / QR */}
              <div className={`rounded-[22px] border transition ${linkMode !== 'closed' ? 'border-brand' : 'border-line'} bg-white`}>
                <button
                  type="button"
                  onClick={() => setLinkMode(linkMode === 'closed' ? 'url' : 'closed')}
                  className="flex w-full items-center gap-4 p-4 text-left active:scale-[0.99]"
                  aria-expanded={linkMode !== 'closed'}
                >
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-light text-brand">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-ink">Lien / QR</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-muted">Collez le lien du produit ou scannez un code QR</span>
                  </span>
                </button>
                {linkMode === 'url' && (
                  <form
                    className="space-y-2.5 px-4 pb-4"
                    onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) void runUrlAnalysis(urlInput.trim(), 'url'); }}
                  >
                    <div className="flex gap-2">
                      <input
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        type="url"
                        inputMode="url"
                        placeholder="https://www.shein.com/…"
                        aria-label="Lien du produit"
                        className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                      />
                      <button type="submit" disabled={!urlInput.trim()}
                        className="min-h-[46px] flex-none rounded-xl bg-ink px-4 text-xs font-extrabold text-white transition active:scale-95 disabled:opacity-40">
                        Analyser
                      </button>
                    </div>
                    <button type="button" onClick={() => setLinkMode('qr')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-xs font-bold text-brand transition hover:border-brand">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/></svg>
                      Scanner un QR code
                    </button>
                  </form>
                )}
              </div>

              <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-muted">
                AYROVIX comprend l'image, identifie le produit, puis le Calculator AYROVI vous donne le prix final en dinars — avant toute commande.
              </p>
            </div>
          )}

          {stage === 'preview' && previewUrl && (
            <div className="mx-auto max-w-md space-y-4">
              <div className="relative overflow-hidden rounded-[22px] border border-line">
                <img src={previewUrl} alt="Aperçu du produit à analyser" className="max-h-[46vh] w-full object-contain bg-surface" />
              </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={reset}
                  className="min-h-[52px] rounded-2xl border border-line px-5 text-sm font-bold text-ink transition hover:border-ink">
                  Reprendre
                </button>
                <button type="button" onClick={() => void runImageAnalysis()}
                  className="bg-brand-gradient min-h-[52px] flex-1 rounded-2xl px-5 text-sm font-extrabold text-white shadow-lg transition active:scale-[0.98]">
                  Analyser ce produit
                </button>
              </div>
            </div>
          )}

          {stage === 'analyzing' && (
            <div className="mx-auto max-w-md space-y-4 pt-2">
              <div className="relative overflow-hidden rounded-[22px] border border-line">
                {bestImage
                  ? <img src={bestImage} alt="" className="max-h-[46vh] w-full bg-surface object-contain opacity-90" />
                  : <div className="h-52 w-full bg-surface" />}
                <div className="lens-scan absolute inset-0" />
              </div>
              <div className="flex items-center justify-center gap-2.5 text-sm font-bold text-ink">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-r-transparent" />
                AYROVIX analyse…
              </div>
              <p className="text-center text-[11px] text-muted">Identification du produit, puis recherche des meilleures correspondances.</p>
            </div>
          )}

          {stage === 'candidates' && imageResult && (
            <div className="mx-auto max-w-md space-y-4">
              {imageResult.query && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-center text-[11px] font-semibold text-muted">
                  Recherche : <span className="font-extrabold text-ink">{imageResult.query}</span>
                </p>
              )}
              {imageResult.candidates.length > 0 ? (
                <ProductCandidates candidates={imageResult.candidates} onChoose={handleChooseCandidate} />
              ) : (
                <div className="space-y-4 rounded-[22px] border border-dashed border-line p-6 text-center">
                  <p className="text-sm font-extrabold text-ink">Aucune correspondance fiable</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {imageResult.identification.description || 'Produit identifié, mais aucune offre ne correspond assez.'}
                    <br />Envoyez le lien direct de la page boutique pour un calcul exact.
                  </p>
                  <div className="flex justify-center gap-2.5">
                    <button type="button" onClick={reset} className="min-h-[46px] rounded-xl bg-ink px-5 text-xs font-extrabold text-white">Nouvelle recherche</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === 'product' && product && (
            <div className="mx-auto max-w-md space-y-5">
              <ProductResult product={product} ordering={ordering} onOrder={(v) => void handleOrder(v)} />
              {urlResult && urlResult.alternates.length > 0 && (
                <section>
                  <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">Autres correspondances</h3>
                  <ProductCandidates
                    candidates={urlResult.alternates}
                    onChoose={(candidate) => { setProduct(candidateToProduct(candidate)); }}
                  />
                </section>
              )}
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
                  <button type="button" onClick={() => setStage('preview')}
                    className="min-h-[46px] rounded-xl border border-line px-5 text-xs font-bold text-ink">Revoir l'image</button>
                )}
                <button type="button" onClick={reset}
                  className="bg-brand-gradient min-h-[46px] rounded-xl px-5 text-xs font-extrabold text-white">
                  Nouvelle recherche
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {linkMode === 'qr' && (
        <QRScanner
          onResult={(url) => { setUrlInput(url); void runUrlAnalysis(url, 'qr'); }}
          onClose={() => setLinkMode('url')}
        />
      )}
    </div>
  );
};
