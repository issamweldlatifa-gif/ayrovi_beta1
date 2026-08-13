import React from 'react';

interface ProductVariantsProps {
  sizes: string[];
  colors: string[];
  size: string;
  color: string;
  onSize: (value: string) => void;
  onColor: (value: string) => void;
}

/** Sélecteur de variantes — chips tactiles 44px, states press/focus natifs. */
export const ProductVariants: React.FC<ProductVariantsProps> = ({ sizes, colors, size, color, onSize, onColor }) => {
  if (!sizes.length && !colors.length) return null;
  const chip = (active: boolean) =>
    `min-h-[44px] rounded-full border px-4 text-xs font-bold transition active:scale-95 ${
      active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink'
    }`;
  return (
    <div className="space-y-3">
      {colors.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Couleur</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
            {colors.slice(0, 10).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} className={chip(color === c)} onClick={() => onColor(c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
      {sizes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Taille</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Taille">
            {sizes.slice(0, 14).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} className={chip(size === s)} onClick={() => onSize(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
