import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Link2, ArrowUpRight, ArrowRight, Loader2, Clipboard, ShoppingBag } from './QatafoIcons';
import { AddToCartPayload, AddToCartResult, ScrapedProduct } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { ProductResult } from '../ayrovix/components/ProductResult';
import { resolveProductSelection } from '../ayrovix/services/productSelection';
import type { AyrovixProduct } from '../ayrovix/types';

interface ProductDrawerProps {
  isOpen: boolean;
  product: ScrapedProduct | null;
  onClose: () => void;
  onAddToCart: (item: AddToCartPayload) => Promise<AddToCartResult | null>;
  onExtracted: (product: ScrapedProduct) => void;
  onNewClientOrder: () => void;
  onOpenCart: () => void;
}

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  product,
  onClose,
  onAddToCart,
  onExtracted,
  onNewClientOrder,
  onOpenCart,
}) => {
  const navigation = useNavigationHistory();
  const productLayer = [...navigation.stack].reverse().find((layer) => layer.id.startsWith('product:'));
  const layerStep = productLayer?.id.slice('product:'.length);
  const step: 'input' | 'details' = layerStep === 'input' || layerStep === 'details'
    ? layerStep
    : (product ? 'details' : 'input');
  
  const [isUploading, setIsUploading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPreviewRef = useRef<string | null>(null);
  const setPreview = (url: string | null) => {
    if (uploadPreviewRef.current) URL.revokeObjectURL(uploadPreviewRef.current);
    uploadPreviewRef.current = url;
    setUploadPreview(url);
  };

  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const ayrovixProduct: AyrovixProduct | null = React.useMemo(() => {
    if (!product) return null;
    return {
      title: product.title,
      brand: product.brand || null,
      model: null,
      description: product.description || '',
      image: product.mainImage || uploadPreview || '',
      images: product.images && product.images.length ? product.images : [product.mainImage || uploadPreview || ''].filter(Boolean),
      colorImages: product.colorImages || null,
      source: product.storeName || product.store,
      sourceUrl: product.url,
      price: product.sourcePrice,
      currency: product.sourceCurrency,
      priceTnd: product.totalPriceTND,
      exchangeRate: null,
      colors: product.variants?.colors || [],
      sizes: product.variants?.sizes || [],
      variantOptions: (product.variants?.details || []).map(detail => ({
        id: detail.id || null, label: detail.label, size: detail.size || null, color: detail.color || null,
        available: detail.available === true, price: detail.price ?? null,
        currency: detail.price != null ? product.sourceCurrency : null, priceTnd: null,
      })),
      availability: product.availability || 'unknown',
      rating: product.rating ?? null,
      ratingCount: product.reviewsCount ?? null,
      ratingKind: product.rating != null ? 'merchant' : undefined,
    };
  }, [product, uploadPreview]);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isUploading && !isScraping) { setAnalysisProgress(0); return undefined; }
    setAnalysisProgress(0);
    const timer = window.setInterval(() => setAnalysisProgress((current) => Math.min(current + 1, 2)), 1400);
    return () => window.clearInterval(timer);
  }, [isUploading, isScraping]);

  useEffect(() => { setErrorMsg(null); }, [product]);

  useEffect(() => {
    if (!isOpen) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setIsUploading(false);
      setIsScraping(false);
      setIsAddingToCart(false);
      setErrorMsg(null);
      setPreview(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setErrorMsg(null);
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeRequestRef.current?.abort();
    };
  }, [isOpen, onClose, product]);

  if (!isOpen) return null;

  const progressMessage = ['Recherche en cours…', 'Vérification du produit…', 'Récupération du prix…'][analysisProgress];

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setIsUploading(true);
    setErrorMsg(null);
    setPreview(URL.createObjectURL(file));
    let keepPreview = false;
    try {
      const form = new FormData();
      form.append('image', file);

      const response = await fetch('/api/extract-image', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Impossible d'extraire les données de la capture.");
      }

      keepPreview = true;
      onExtracted(data.product);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[Upload Error]', err);
        setErrorMsg(err.message || "Erreur lors de l'analyse. Vous pouvez entrer le montant manuellement.");
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsUploading(false);
        if (!keepPreview) setPreview(null);
      }
    }
  };

  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setErrorMsg("Veuillez d'abord coller le lien d'un produit.");
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setIsScraping(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Impossible d'extraire les données du lien.");
      }

      onExtracted(data.product);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[Scrape Error]', err);
        setErrorMsg(err.message || "Le site source bloque l'accès direct. Déposez plutôt une capture d'écran pour un résultat garanti.");
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsScraping(false);
      }
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrlInput(text.trim());
    } catch {}
  };

  const handleCloseDrawer = () => {
    activeRequestRef.current?.abort();
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lens-page-title"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFileUpload(file);
          event.target.value = '';
        }}
        className="hidden"
      />

      <section className="relative flex h-screen h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-white">
        {step === 'input' && (
          <div className="flex items-center justify-between border-b border-line bg-surface px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-ink text-white flex items-center justify-center font-black text-xs">
                +
              </div>
              <div>
                <h3 id="lens-page-title" className="font-extrabold text-base sm:text-lg text-ink">
                  AYROVIX Lens — Nouvelle commande
                </h3>
                <p className="text-xs text-muted font-medium">Conversion transparente et garantie</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
            <button type="button" onClick={onOpenCart} aria-label="Ouvrir le panier" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white"><ShoppingBag className="h-5 w-5" /></button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleCloseDrawer}
              className="w-9 h-9 rounded-full bg-white border border-line text-muted hover:text-ink flex items-center justify-center transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-2"
              aria-label="Fermer Lens"
            >
              <X className="w-5 h-5" />
            </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-danger/5 border border-danger/20 text-danger text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className={step === 'details' ? "ay-safe-bottom flex-1 overflow-y-auto px-3 sm:px-4 py-2" : "ay-safe-bottom flex-1 overflow-y-auto p-5 sm:p-6 space-y-5"}>
          {step === 'input' && (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-lg text-ink">
                  Comment souhaitez-vous ajouter l'article ?
                </h4>
                <p className="text-xs text-muted">
                  Importez une capture d'écran ou collez un lien pour calculer le prix exact en Dinars.
                </p>
              </div>

              {/* Card 1: Screenshot */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isScraping}
                className="ay-dark-feature-card group relative flex min-h-[190px] w-full cursor-pointer flex-col justify-between overflow-hidden rounded-card p-6 text-left text-white disabled:cursor-wait disabled:opacity-90"
              >
                {/* تجربة AYROVI Lens: معاينة الصورة مع مسح ضوئي أثناء التحليل */}
                {isUploading && uploadPreview && (
                  <>
                    <img src={uploadPreview} alt="Capture en cours d’analyse" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/35" />
                    <div className="lens-scan absolute inset-0" />
                  </>
                )}
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-yellow-300" />
                      <span>Méthode Recommandée</span>
                    </span>
                    <h5 className="text-xl font-extrabold tracking-tight mt-1">
                      Capture d'écran (Screenshot)
                    </h5>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-ink transition-all">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </div>

                <p className="relative z-10 my-2 text-xs text-purple-100/90">
                  {isUploading ? progressMessage : "Photographiez votre article, où qu'il soit en ligne."}
                </p>

                <div className="relative z-10 pt-2">
                  <div className="inline-flex items-center gap-2 bg-white text-ink px-4 py-2 rounded-xl text-xs font-bold shadow-xs">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-ink" />
                        <span role="status" aria-live="polite">{progressMessage}</span>
                      </>
                    ) : (
                      <>
                        <span>Sélectionner une photo</span>
                      </>
                    )}
                  </div>
                </div>
              </button>

              {/* Card 2: Link Direct */}
              <div className={`ay-dark-feature-card rounded-card p-6 text-white relative overflow-hidden flex flex-col justify-between min-h-[190px] ${isScraping ? 'link-analyze' : ''}`}>
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-yellow-300" />
                      <span>Lien URL Direct</span>
                    </span>
                    <h5 className="text-xl font-extrabold tracking-tight mt-1">
                      Coller un Lien Direct
                    </h5>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>

                <p className="text-xs text-purple-100/90 my-2">
                  {isScraping ? progressMessage : "Collez l'URL de votre article, depuis n'importe quelle boutique du monde."}
                </p>

                <form onSubmit={handleScrapeUrl} className="pt-2 space-y-2 relative z-10">
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.votre-boutique.com/produit"
                      dir="ltr"
                      disabled={isUploading || isScraping}
                      className="w-full bg-white/15 border border-white/25 focus:border-white rounded-xl px-3 py-2 text-xs text-white placeholder:text-purple-200/70 focus:outline-none ay-number"
                    />
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      disabled={isUploading || isScraping}
                      className="bg-white/20 hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-50 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                      aria-label="Coller le lien depuis le presse-papiers"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading || isScraping || !urlInput.trim()}
                    className="w-full bg-white text-ink hover:bg-yellow-300 disabled:opacity-50 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {isScraping ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-ink" />
                        <span role="status" aria-live="polite">{progressMessage}</span>
                      </>
                    ) : (
                      <>
                        <span>Calculer le prix en Dinars</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {step === 'details' && ayrovixProduct && (
            <div className="py-1">
              <ProductResult
                product={ayrovixProduct}
                ordering={isAddingToCart}
                priceVerified={product?.priceVerified === true}
                onOpenCart={onOpenCart}
                onBack={handleCloseDrawer}
                onCalculateAnother={() => {
                  navigation.replaceTop({ id: 'product:input' });
                  onNewClientOrder();
                }}
                onOrder={async (selection) => {
                  // Use the same coherent selected offer as the displayed quote.
                  // Never combine a variant's price with the general currency.
                  const { offer } = resolveProductSelection(ayrovixProduct, selection.size, selection.color);
                  if (offer.price == null || !offer.currency) throw new Error('Le devis de cette sélection est incomplet.');
                  setIsAddingToCart(true);
                  setErrorMsg(null);
                  try {
                    const result = await onAddToCart({
                      store: product?.store || 'generic',
                      externalId: selection.option?.id || product?.externalId || null,
                      url: selection.manualUrl || product?.url || '',
                      title: ayrovixProduct.title.trim(),
                      imageUrl: product?.mainImage || uploadPreview || '',
                      sourcePrice: offer.price,
                      sourceCurrency: offer.currency,
                      priceTND: 0, // The cart server computes the price; the client total is ignored.
                      variant: selection.option?.label || [selection.size && `Taille: ${selection.size}`, selection.color && `Couleur: ${selection.color}`].filter(Boolean).join(' · ') || undefined,
                      requestedSize: selection.size,
                      requestedColor: selection.color,
                      customerNote: selection.customerNote,
                      quantity: selection.quantity,
                    });
                    if (!result) throw new Error("L'article n'a pas pu être ajouté. Réessayez.");
                  } finally {
                    setIsAddingToCart(false);
                  }
                }}
              />
            </div>
          )}

        </div>

      </section>
    </div>
  );
};
