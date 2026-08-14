import React, { useEffect, useState } from 'react';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';
import { CheckCircle2 as CheckCircle, Hourglass } from '../../components/QatafoIcons';

export interface AyrovixOrderSelection {
  size: string;
  color: string;
  option: AyrovixVariantOption | null;
  quantity: number;
  customerNote: string;
  manualUrl: string;
}

interface ProductResultProps {
  product: AyrovixProduct;
  ordering: boolean;
  priceVerified: boolean;
  onOrder: (selection: AyrovixOrderSelection) => void;
}

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  in_stock: { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700' },
  limited: { label: 'Stock limité', cls: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Rupture signalée', cls: 'bg-red-50 text-red-600' },
  unknown: { label: 'Disponibilité à confirmer', cls: 'bg-slate-100 text-slate-500' },
};

function verificationReason(code?: string | null): string {
  if (!code) return '';
  if (code === 'RENDER_PROVIDER_NOT_CONFIGURED') return "le service de rendu marchand n'est pas configuré";
  if (code === 'RENDER_ACCESS_DENIED' || /HTTP_(?:401|403)/.test(code)) return 'la boutique bloque les consultations automatisées';
  if (code === 'RENDER_RATE_LIMITED' || /HTTP_429/.test(code)) return 'la boutique ou le fournisseur limite temporairement les requêtes';
  if (code === 'RENDER_TIMEOUT' || code.includes('TIMEOUT')) return "la page marchand n'a pas répondu à temps";
  if (code === 'PRICE_MISMATCH') return 'le prix marchand lu diffère du prix proposé par Lens';
  if (code === 'PRICE_NOT_FOUND_AFTER_RENDER' || code === 'DIRECT_PRICE_NOT_FOUND') return "aucun prix exploitable n'a été trouvé dans la fiche";
  if (code === 'MERCHANT_EXTRACTION_FAILED') return "la fiche marchand n'a pas pu être lue";
  return `vérification automatique indisponible (${code})`;
}

function validPublicUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Product review plus the non-blocking manual-purchase request captured with the cart item. */
export const ProductResult: React.FC<ProductResultProps> = ({ product, ordering, priceVerified, onOrder }) => {
  const [sizeChoice, setSizeChoice] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerNote, setCustomerNote] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [depositPercent, setDepositPercent] = useState(20);
  const availability = AVAILABILITY[product.availability] || AVAILABILITY.unknown;
  const options = (product.variantOptions || []).filter((option) => option.available);
  const requestedSize = sizeChoice === '__other__' ? customSize.trim() : sizeChoice;
  const selectedOption = (requestedSize || color) ? (options.find((option) =>
    (!requestedSize || Boolean(option.size && option.size.toLocaleLowerCase() === requestedSize.toLocaleLowerCase()))
    && (!color || Boolean(option.color && option.color.toLocaleLowerCase() === color.toLocaleLowerCase())),
  ) || null) : null;
  const selectedPrice = selectedOption?.price ?? product.price;
  const selectedCurrency = selectedOption?.currency ?? product.currency;
  const selectedPriceTnd = selectedOption?.priceTnd ?? product.priceTnd;
  const isUrlValid = validPublicUrl(manualUrl);
  const canOrder = selectedPrice != null && selectedCurrency != null && isUrlValid && quantity >= 1 && quantity <= 99;
  const imageUrls = [...new Set([...(product.images || []), product.image].filter(Boolean))];
  const sizeOptions = [...new Set(product.sizes)];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/commerce-config')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        const percent = Number(payload?.data?.deposit?.percent);
        if (!cancelled && Number.isFinite(percent) && percent > 0 && percent <= 100) setDepositPercent(percent);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setImageIndex(0);
    setSizeChoice('');
    setCustomSize('');
    setColor('');
    setQuantity(1);
    setCustomerNote('');
    setManualUrl('');
    setSubmitted(false);
  }, [product.sourceUrl, product.image]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="relative aspect-[4/3] bg-surface">
          {imageUrls[imageIndex]
            ? <img src={imageUrls[imageIndex]} alt={product.title} referrerPolicy="no-referrer" onError={() => setImageIndex((current) => current + 1)} className="h-full w-full object-contain" />
            : <div className="flex h-full items-center justify-center text-muted">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M8 6V5a4 4 0 0 1 8 0v1" /></svg>
              </div>}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${availability.cls}`}>
            {availability.label}
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
            {product.source}
          </span>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h3 className="text-[15px] font-extrabold leading-snug text-ink">{product.title}</h3>
            <p className="mt-0.5 text-xs font-semibold text-muted">
              {[product.brand, product.model].filter(Boolean).join(' · ') || 'Produit identifié par AYROVIX'}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 rounded-2xl bg-surface p-3.5 ayrovix-glass price-morph">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Prix proposé</p>
              <p className="text-sm font-bold text-ink">
                {selectedPrice != null && selectedCurrency ? `${selectedPrice.toFixed(2)} ${selectedCurrency}` : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand">Prix final estimé</p>
              <p className="text-xl font-extrabold text-ink price-pulse">
                {selectedPriceTnd != null ? `≈ ${selectedPriceTnd.toFixed(2)} DT` : '—'}
              </p>
              <p className="text-[10px] font-semibold text-emerald-600">Calcul AYROVI • Tout inclus</p>
            </div>
          </div>

          {priceVerified ? (
            <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800"><CheckCircle className="h-3.5 w-3.5 shrink-0" />Prix confirmé</p>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              <p className="flex items-start gap-1.5"><Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />Prix estimé — en attente de vérification manuelle par notre équipe. Vous pouvez commander et payer l'acompte de {depositPercent}% maintenant.</p>
              {verificationReason(product.verificationFailureCode) && <p className="mt-1 font-medium">Motif : {verificationReason(product.verificationFailureCode)}.</p>}
            </div>
          )}
          {product.description ? <p className="text-xs leading-relaxed text-muted">{product.description}</p> : null}
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-line bg-white p-4">
        <div>
          <h4 className="text-sm font-extrabold text-ink">Détails de votre demande</h4>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">Ces informations seront transmises à l'équipe d'achat avec votre commande.</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">Lien exact du produit <span className="text-red-500">*</span></span>
          <input
            type="url"
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            onBlur={() => setSubmitted(true)}
            placeholder="https://boutique.com/produit-exact"
            autoComplete="url"
            className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand"
            aria-invalid={submitted && !isUrlValid}
            required
          />
          <span className="mt-1 block text-[10px] text-muted">Le lien sert uniquement à l'achat manuel. Saisir ce lien ne relance pas l'extraction du prix.</span>
          {submitted && !isUrlValid && <span className="mt-1 block text-[11px] font-semibold text-red-600">Ajoutez un lien public complet commençant par http:// ou https://.</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink">Quantité <span className="text-red-500">*</span></span>
            <div className="flex min-h-[46px] items-center rounded-xl border border-line bg-white">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuer la quantité" className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">−</button>
              <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} aria-label="Quantité" className="h-11 min-w-0 flex-1 border-x border-line bg-white text-center text-sm font-extrabold text-ink outline-none" required />
              <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} aria-label="Augmenter la quantité" className="h-11 w-11 text-lg font-bold text-ink disabled:opacity-30">+</button>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink">Couleur <span className="font-medium text-muted">(optionnel)</span></span>
            <input list="ayrovix-colors" value={color} onChange={(event) => setColor(event.target.value.slice(0, 100))} placeholder="Ex. Noir" className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
            {product.colors.length > 0 && <datalist id="ayrovix-colors">{product.colors.map((item) => <option key={item} value={item} />)}</datalist>}
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">Taille <span className="font-medium text-muted">(optionnel)</span></span>
          <select value={sizeChoice} onChange={(event) => setSizeChoice(event.target.value)} className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand">
            <option value="">Sans préférence</option>
            {sizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__other__">Autre</option>
          </select>
        </label>
        {sizeChoice === '__other__' && (
          <input value={customSize} onChange={(event) => setCustomSize(event.target.value.slice(0, 100))} placeholder="Précisez la taille souhaitée" aria-label="Autre taille" className="min-h-[46px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
        )}

        {product.sizes.length > 0 || product.colors.length > 0 ? (
          <p className="rounded-xl bg-surface px-3 py-2 text-[10px] leading-relaxed text-muted">
            Options détectées sur la fiche : {[product.sizes.length ? `tailles ${product.sizes.join(', ')}` : '', product.colors.length ? `couleurs ${product.colors.join(', ')}` : ''].filter(Boolean).join(' · ')}. La disponibilité finale sera confirmée par l'équipe.
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink">Commentaire spécial <span className="font-medium text-muted">(optionnel)</span></span>
          <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value.slice(0, 1000))} rows={3} placeholder="Ex. emballage cadeau, variante précise…" className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
        </label>
      </div>

      <div className="sticky bottom-3 flex gap-2.5">
        {product.sourceUrl && (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white px-4 text-sm font-bold text-ink transition hover:border-ink">
            Voir la référence
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setSubmitted(true);
            if (canOrder) onOrder({ size: requestedSize, color: color.trim(), option: selectedOption, quantity, customerNote: customerNote.trim(), manualUrl: manualUrl.trim() });
          }}
          disabled={ordering || selectedPrice == null || selectedCurrency == null}
          className="bg-brand-gradient flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-45"
        >
          {ordering ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-r-transparent" /> Ajout au panier…</> : <>Commander · acompte {depositPercent}%</>}
        </button>
      </div>
    </div>
  );
};
