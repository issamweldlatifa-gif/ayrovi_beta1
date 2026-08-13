import React, { useEffect, useRef, useState } from 'react';
import { X, Calculator, Camera, Link2, ArrowUpRight, ArrowRight, Image as ImageIcon, Loader2, Clipboard, CheckCircle2, User, Phone, MapPin, CreditCard, MessageSquare, Copy, PackageCheck } from './QatafoIcons';
import confetti from 'canvas-confetti';
import { AddToCartPayload, AddToCartResult, ScrapedProduct, CustomerInfo, OrderResult } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { getSessionId } from '../utils/session';
import { getCommerceConfig } from '../services/publicApi';

interface ProductDrawerProps {
  isOpen: boolean;
  product: ScrapedProduct | null;
  onClose: () => void;
  onAddToCart: (item: AddToCartPayload) => Promise<AddToCartResult | null>;
  onExtracted: (product: ScrapedProduct) => void;
  onNewClientOrder: () => void;
  onOrderComplete: () => void;
  onCheckoutRequested: () => void;
}

interface PricingPreview {
  convertedPriceTND: number;
  customsFeeTND: number;
  shippingFeeTND: number;
  serviceFeeTND: number;
  expressFeeTND: number;
  totalTND: number;
  exchangeRate: number;
  pricingVersion: number;
}

interface CommerceConfig {
  governorates: string[];
  paymentMethods: string[];
}

const TUNISIAN_GOVERNORATES_FR = [
  'Tunis', 'Ariana', 'Ben Arous', 'La Manouba', 'Nabeul', 'Zaghouan',
  'Bizerte', 'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse',
  'Monastir', 'Mahdia', 'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid',
  'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili'
];

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  product,
  onClose,
  onAddToCart,
  onExtracted,
  onNewClientOrder,
  onOrderComplete,
  onCheckoutRequested,
}) => {
  const [step, setStep] = useState<'input' | 'details' | 'checkout' | 'success'>('input');
  
  const [isUploading, setIsUploading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
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

  const [title, setTitle] = useState(product?.title || 'Article International');
  const [sourcePrice, setSourcePrice] = useState<number>(product?.sourcePrice || 0);
  const [currency, setCurrency] = useState<string>(product?.sourceCurrency || 'EUR');
  const [variantNote, setVariantNote] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState<AddToCartResult | null>(null);
  const [pricingPreview, setPricingPreview] = useState<PricingPreview | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [commerceConfig, setCommerceConfig] = useState<CommerceConfig>({
    governorates: TUNISIAN_GOVERNORATES_FR,
    paymentMethods: ['COD', 'D17', 'FLOUCI'],
  });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(isOpen);
  const stepRef = useRef(step);

  const [formData, setFormData] = useState<CustomerInfo>({
    name: '',
    phone: '',
    city: TUNISIAN_GOVERNORATES_FR[0],
    address: '',
    paymentMethod: 'cod',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    setTitle(product?.title || 'Article International');
    setSourcePrice(product?.sourcePrice || 0);
    setCurrency(product?.sourceCurrency || 'EUR');
    setVariantNote('');
    setQuantity(1);
    setErrorMsg(null);
    setOrderResult(null);
    setCheckoutSummary(null);
    setStep(product ? 'details' : 'input');
  }, [product]);

  useEffect(() => {
    if (!isOpen) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setIsUploading(false);
      setIsScraping(false);
      setIsAddingToCart(false);
      setIsSubmitting(false);
      setErrorMsg(null);
      setOrderResult(null);
      setCheckoutSummary(null);
      setPreview(null);
      setStep(product ? 'details' : 'input');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (stepRef.current === 'checkout') {
        setErrorMsg(null);
        setStep('details');
        return;
      }
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeRequestRef.current?.abort();
    };
  }, [isOpen, onClose, product]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getCommerceConfig()
      .then((payload) => {
        if (!active) return;
        const governorates = Array.isArray(payload.data?.governorates) && payload.data.governorates.length
          ? payload.data.governorates.map(String)
          : TUNISIAN_GOVERNORATES_FR;
        const configuredMethods = Array.isArray(payload.data?.paymentMethods)
          ? payload.data.paymentMethods.map((method: unknown) => String(method).toUpperCase()).filter((method: string) => ['COD', 'D17', 'FLOUCI'].includes(method))
          : [];
        const paymentMethods = configuredMethods.length ? configuredMethods : ['COD', 'D17', 'FLOUCI'];
        setCommerceConfig({ governorates, paymentMethods });
        setFormData((current) => ({
          ...current,
          city: governorates.includes(current.city) ? current.city : governorates[0],
          paymentMethod: paymentMethods.includes(current.paymentMethod.toUpperCase()) ? current.paymentMethod : paymentMethods[0].toLowerCase(),
        }));
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[Commerce Config Error]', error);
      });
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || sourcePrice <= 0 || quantity < 1) {
      setPricingPreview(null);
      setIsCalculatingPrice(false);
      return;
    }
    setPricingPreview(null);
    setIsCalculatingPrice(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/public/pricing/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalPrice: sourcePrice, currency, quantity }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Calcul indisponible.');
        setPricingPreview(payload.data);
        setErrorMsg((current) => current === 'Le calcul tarifaire central est momentanément indisponible. Réessayez.' ? null : current);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          setPricingPreview(null);
          setErrorMsg('Le calcul tarifaire central est momentanément indisponible. Réessayez.');
        }
      } finally {
        if (!controller.signal.aborted) setIsCalculatingPrice(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, sourcePrice, currency, quantity]);

  if (!isOpen) return null;

  const convertedTND = pricingPreview?.convertedPriceTND ?? 0;
  const customsTND = pricingPreview?.customsFeeTND ?? 0;
  const serviceFeeTND = pricingPreview?.serviceFeeTND ?? 0;
  const shippingTND = pricingPreview?.shippingFeeTND ?? 0;
  const orderTotalTND = pricingPreview?.totalTND ?? 0;
  const checkoutTotalTND = checkoutSummary?.totalTND ?? orderTotalTND;

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
      setStep('details');
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
      setStep('details');
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

  const handleProceedToCheckoutForm = async () => {
    if (checkoutSummary) {
      onCheckoutRequested();
      return;
    }

    if (sourcePrice <= 0) {
      setErrorMsg("Veuillez renseigner le prix de l'article.");
      return;
    }

    setIsAddingToCart(true);
    setErrorMsg(null);
    const cartSummary = await onAddToCart({
      store: product?.store || 'generic',
      externalId: product?.externalId || null,
      url: product?.url || '',
      title: title.trim(),
      imageUrl: product?.mainImage || '',
      sourcePrice: Number(sourcePrice),
      sourceCurrency: currency,
      priceTND: orderTotalTND,
      variant: variantNote.trim() || undefined,
      quantity,
    });
    if (!isOpenRef.current) return;

    setIsAddingToCart(false);
    if (cartSummary) {
      setCheckoutSummary(cartSummary);
      onCheckoutRequested();
    } else {
      setErrorMsg("L'article n'a pas pu être ajouté. Vérifiez votre connexion puis réessayez.");
    }
  };

  const handleFinalOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      setErrorMsg('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (formData.phone.replace(/\D/g, '').length < 8) {
      setErrorMsg('Veuillez renseigner un numéro de téléphone tunisien valide (8 chiffres).');
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la confirmation.');
      }

      const result: OrderResult = {
        orderNumber: data.orderNumber,
        customer: formData,
        totalTND: data.totalTND || checkoutTotalTND,
        itemCount: checkoutSummary?.itemCount ?? quantity,
        message: 'Commande enregistrée avec succès !',
      };

      setOrderResult(result);
      setStep('success');
      onOrderComplete();

      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#673de6', '#5025d1', '#7e57ff', '#ffc24b', '#10b981'],
        });
      } catch {}
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[Order Error]', err);
        setErrorMsg(err.message || 'Erreur lors de la commande.');
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const handleResetForNewClient = () => {
    setStep('input');
    setUrlInput('');
    setVariantNote('');
    setQuantity(1);
    setFormData({
      name: '',
      phone: '',
      city: commerceConfig.governorates[0] || TUNISIAN_GOVERNORATES_FR[0],
      address: '',
      paymentMethod: (commerceConfig.paymentMethods[0] || 'COD').toLowerCase(),
    });
    setErrorMsg(null);
    setOrderResult(null);
    setCheckoutSummary(null);
    onNewClientOrder();
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
        <div className="flex items-center justify-between border-b border-slate-100 bg-surface px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-black text-xs">
              +
            </div>
            <div>
              <h3 id="lens-page-title" className="font-extrabold text-base sm:text-lg text-ink">
                {step === 'input' && "Nouvelle Commande (Lens)"}
                {step === 'details' && "Fiche de Calcul & Prix (DT)"}
                {step === 'checkout' && "Livraison & Coordonnées"}
                {step === 'success' && "Commande Confirmée"}
              </h3>
              <p className="text-[11px] text-muted font-medium">Conversion transparente et garantie</p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleCloseDrawer}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-ink flex items-center justify-center transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            aria-label="Fermer Lens"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
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
                className="hostinger-purple-card group relative flex min-h-[190px] w-full cursor-pointer flex-col justify-between overflow-hidden rounded-3xl p-6 text-left text-white disabled:cursor-wait disabled:opacity-90"
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
                    <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-yellow-300" />
                      <span>Méthode Recommandée</span>
                    </span>
                    <h5 className="text-xl font-extrabold tracking-tight mt-1">
                      Capture d'écran (Screenshot)
                    </h5>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-brand transition-all">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </div>

                <p className="relative z-10 my-2 text-xs text-purple-100/90">
                  {isUploading ? 'AYROVI Lens lit votre capture : produit, prix et devise…' : 'Prenez une photo de votre article sur SHEIN, Amazon ou TEMU.'}
                </p>

                <div className="relative z-10 pt-2">
                  <div className="inline-flex items-center gap-2 bg-white text-ink px-4 py-2 rounded-xl text-xs font-bold shadow-xs">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                        <span>Analyse Lens en cours...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3.5 h-3.5 text-brand" />
                        <span>Sélectionner une photo</span>
                      </>
                    )}
                  </div>
                </div>
              </button>

              {/* Card 2: Link Direct */}
              <div className={`hostinger-purple-card rounded-3xl p-6 text-white relative overflow-hidden flex flex-col justify-between min-h-[190px] ${isScraping ? 'link-analyze' : ''}`}>
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1">
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
                  {isScraping ? 'Lecture du lien : ouverture de la page, extraction du prix et conversion…' : "Copiez l'URL de votre article depuis SHEIN, AliExpress ou Amazon."}
                </p>

                <form onSubmit={handleScrapeUrl} className="pt-2 space-y-2 relative z-10">
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.shein.com/..."
                      dir="ltr"
                      disabled={isUploading || isScraping}
                      className="w-full bg-white/15 border border-white/25 focus:border-white rounded-xl px-3 py-2 text-xs text-white placeholder:text-purple-200/70 focus:outline-none font-mono"
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
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                        <span>Calcul en cours...</span>
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

          {step === 'details' && (
            <div className="space-y-5">
              <div className="bg-surface border border-slate-200 rounded-2xl p-4 flex gap-4 items-center">
                <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center p-1">
                  {(uploadPreview || product?.mainImage) ? (
                    <img src={uploadPreview || product?.mainImage || ''} alt={title} className="w-full h-full object-contain" />
                  ) : (
                    <PackageCheck className="h-7 w-7 text-brand" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Titre de l'article :
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-brand rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-brand" />
                    <span>Prix original sur le site :</span>
                  </span>
                  <span className="text-xs font-extrabold text-brand">
                    Conversion AYROVI
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-muted font-semibold mb-1">
                      Montant devise :
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={sourcePrice || ''}
                      onChange={(e) => setSourcePrice(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-200 focus:border-brand rounded-xl px-3 py-2 text-sm font-black text-ink focus:outline-none shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-muted font-semibold mb-1">
                      Devise :
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-brand rounded-xl px-3 py-2 text-xs font-bold text-ink focus:outline-none shadow-xs"
                    >
                      <option value="EUR">Euro (€ EUR)</option>
                      <option value="USD">Dollar ($ USD)</option>
                      <option value="JPY">Yen (¥ JPY)</option>
                      <option value="GBP">Livre (£ GBP)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted">
                    <span>Prix converti :</span>
                    <span className="font-semibold text-ink">{convertedTND.toFixed(2)} DT</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Dédouanement :</span>
                    <span className="font-semibold text-ink">+{customsTND.toFixed(2)} DT</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Livraison :</span>
                    <span className="font-semibold text-ink">+{shippingTND.toFixed(2)} DT</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Frais de service & garantie :</span>
                    <span className="font-semibold text-ink">+{serviceFeeTND.toFixed(2)} DT</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-extrabold text-sm sm:text-base">
                    <span className="text-ink">Total à régler :</span>
                    <span className="text-brand text-lg font-black">
                      {isCalculatingPrice ? 'Calcul…' : `${orderTotalTND.toFixed(2)} DT`}
                    </span>
                  </div>
                  {pricingPreview && <p className="text-right text-[10px] text-muted">Tarification serveur v{pricingPreview.pricingVersion}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#4b5563] mb-1">
                    Taille / Couleur :
                  </label>
                  <input
                    type="text"
                    value={variantNote}
                    onChange={(e) => setVariantNote(e.target.value)}
                    placeholder="Ex : M, Noir..."
                    className="w-full bg-surface border border-slate-200 focus:border-brand rounded-xl px-3 py-2 text-xs text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#4b5563] mb-1">
                    Quantité :
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-ink font-black flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold text-ink min-w-[2rem] text-center">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-ink font-black flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'checkout' && (
            <form id="lens-checkout-form" onSubmit={handleFinalOrderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand" />
                  <span>Nom et Prénom :</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex : Anis Ben Ammar"
                  className="w-full bg-surface border border-slate-200 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand" />
                  <span>Téléphone :</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+216 98 123 456"
                  className="w-full bg-surface border border-slate-200 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand" />
                  <span>Gouvernorat :</span>
                </label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-surface border border-slate-200 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none font-semibold"
                >
                  {commerceConfig.governorates.map((gov) => (
                    <option key={gov} value={gov}>{gov}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Adresse complète :
                </label>
                <textarea
                  required
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Ex : Rue Hédi Nouira, Ennasr 2, Apt 4"
                  className="w-full bg-surface border border-slate-200 focus:border-brand rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none font-semibold resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-brand" />
                  <span>Paiement :</span>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {commerceConfig.paymentMethods.map((method) => {
                    const value = method.toLowerCase();
                    const label = method === 'COD' ? 'À la livraison' : method === 'D17' ? 'D17' : 'Flouci';
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setFormData({ ...formData, paymentMethod: value })}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          formData.paymentMethod === value
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-slate-200 bg-surface text-slate-500'
                        }`}
                      >
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {step === 'success' && orderResult && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
                <PackageCheck className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-ink">
                  Félicitations ! Commande validée
                </h4>
                <p className="text-xs text-muted mt-1">
                  Votre code de suivi est généré et actif chez AYROVI.
                </p>
              </div>

              <div className="bg-surface border border-brand/30 rounded-2xl p-4 flex items-center justify-between">
                <div className="text-left">
                  <span className="text-[10px] text-muted uppercase font-bold block">Code de suivi :</span>
                  <span className="text-lg font-mono font-black text-brand">{orderResult.orderNumber}</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(orderResult.orderNumber);
                    alert("Code copié : " + orderResult.orderNumber);
                  }}
                  className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-ink shadow-2xs cursor-pointer"
                  title="Copier"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Bonjour AYROVI,\nJe confirme ma commande :\nRéférence : ${orderResult.orderNumber}\nNom : ${orderResult.customer.name}\nVille : ${orderResult.customer.city}\nTotal : ${orderResult.totalTND.toFixed(2)} DT`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3.5 px-6 rounded-2xl shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Suivre ma commande sur WhatsApp</span>
              </a>
            </div>
          )}
        </div>

        {/* Full-page footer actions */}
        <div className="space-y-2.5 border-t border-slate-200 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-5">
          {step === 'details' && (
            <button
              type="button"
              onClick={() => void handleProceedToCheckoutForm()}
              disabled={sourcePrice <= 0 || !pricingPreview || isCalculatingPrice || isAddingToCart}
              className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-md bg-brand hover:bg-brand-dark text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAddingToCart ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ajout sécurisé en cours...</span>
                </>
              ) : (
                <>
                  <span>Continuer vers la livraison ({orderTotalTND.toFixed(2)} DT)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step === 'checkout' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="py-3.5 px-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-xs text-slate-700 cursor-pointer"
              >
                Retour
              </button>
              <button
                type="submit"
                form="lens-checkout-form"
                disabled={isSubmitting}
                className="flex-1 py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-md bg-brand hover:bg-brand-dark text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirmation en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmer la commande ({checkoutTotalTND.toFixed(2)} DT)</span>
                  </>
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleResetForNewClient}
            className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-brand/40 bg-brand/5 hover:bg-[#e8defc] text-brand font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors active:scale-98 cursor-pointer"
          >
            <span>Nouvelle commande pour un autre client</span>
          </button>
        </div>
      </section>
    </div>
  );
};
