import React, { useState } from 'react';
import type { AyrovixProduct } from '../types';
import { ProductVariants } from './ProductVariants';

interface ProductResultProps {
  product: AyrovixProduct;
  ordering: boolean;
  priceVerified: boolean;
  onOrder: (variant: { size: string; color: string }) => void;
}

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  in_stock: { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700' },
  limited: { label: 'Stock limité', cls: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Rupture', cls: 'bg-red-50 text-red-600' },
  unknown: { label: 'Disponibilité à confirmer', cls: 'bg-slate-100 text-slate-500' },
};

/** Fiche produit confirmée — puis passage direct au Calculator AYROVI existant. */
export const ProductResult: React.FC<ProductResultProps> = ({ product, ordering, priceVerified, onOrder }) => {
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const availability = AVAILABILITY[product.availability] || AVAILABILITY.unknown;
  const needsSize = product.sizes.length > 0;
  const canOrder = priceVerified && product.price != null && product.currency != null && (!needsSize || Boolean(size));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="relative aspect-[4/3] bg-surface">
          {product.image
            ? <img src={product.image} alt={product.title} className="h-full w-full object-contain" />
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
              {[product.brand, product.model, product.colors.length ? product.colors.join(' / ') : null].filter(Boolean).join(' · ') || 'Produit identifié par AYROVIX'}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 rounded-2xl bg-surface p-3.5 ayrovix-glass price-morph">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Prix source</p>
              <p className="text-sm font-bold text-ink">
                {product.price != null && product.currency ? `${product.price.toFixed(2)} ${product.currency}` : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand">Prix final estimé</p>
              <p className="text-xl font-extrabold text-ink price-pulse">
                {product.priceTnd != null ? `≈ ${product.priceTnd.toFixed(2)} DT` : '—'}
              </p>
              <p className="text-[10px] font-semibold text-emerald-600">Calcul AYROVI • Tout inclus</p>
            </div>
          </div>

          {product.description ? <p className="text-xs leading-relaxed text-muted">{product.description}</p> : null}
        </div>
      </div>

      <ProductVariants sizes={product.sizes} colors={product.colors} size={size} color={color} onSize={setSize} onColor={setColor} />
      {needsSize && !size && <p className="text-[11px] font-semibold text-amber-600">Choisissez votre taille pour continuer.</p>}
      {!priceVerified && product.price != null && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          Prix indicatif Google Lens — vérifiez la fiche marchand ci-dessous pour activer la commande.
        </p>
      )}

      <div className="sticky bottom-3 flex gap-2.5">
        {product.sourceUrl && (
          <a
            href={product.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white px-4 text-sm font-bold text-ink transition hover:border-ink"
          >
            Voir le produit
          </a>
        )}
        <button
          type="button"
          onClick={() => onOrder({ size, color })}
          disabled={!canOrder || ordering}
          className="bg-brand-gradient flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-45"
        >
          {ordering ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-r-transparent" /> Ajout au panier…</>
          ) : (
            <>Commander · via le Calculator AYROVI</>
          )}
        </button>
      </div>
    </div>
  );
};
