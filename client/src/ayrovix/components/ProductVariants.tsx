import React from 'react';
import type { AyrovixVariantOption } from '../types';
import { useLocale } from '../../i18n/LocaleContext';

interface ProductVariantsProps {
  sizes: string[];
  colors: string[];
  size: string;
  color: string;
  options?: AyrovixVariantOption[];
  onSize: (value: string) => void;
  onColor: (value: string) => void;
}

/** Sélecteur de variantes — chips tactiles 44px, states press/focus natifs. */
export const ProductVariants: React.FC<ProductVariantsProps> = ({ sizes, colors, size, color, options = [], onSize, onColor }) => {
  const { tr } = useLocale();
  if (!sizes.length && !colors.length) return null;
  const sizeAvailable = (value: string) => !options.length || options.some((option) =>
    option.available && option.size === value && (!color || !option.color || option.color === color),
  );
  const colorAvailable = (value: string) => !options.length || options.some((option) =>
    option.available && option.color === value && (!size || !option.size || option.size === size),
  );
  const chip = (active: boolean, enabled = true) =>
    `min-h-[44px] rounded-full border px-4 text-xs font-bold transition ${enabled ? 'active:scale-95' : 'cursor-not-allowed opacity-35'} ${
      active ? 'border-interactive-primary bg-interactive-primary text-white' : 'border-line bg-white text-ink hover:border-ink'
    }`;
  return (
    <div className="space-y-3">
      {colors.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{tr('Couleur', 'اللون')}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr('Couleur', 'اللون')}>
            {colors.slice(0, 10).map((c) => {
              const enabled = colorAvailable(c);
              return <button key={c} type="button" role="radio" disabled={!enabled} aria-checked={color === c} className={chip(color === c, enabled)} onClick={() => onColor(c)}>{c}</button>;
            })}
          </div>
        </div>
      )}
      {sizes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{tr('Taille', 'المقاس')}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr('Taille', 'المقاس')}>
            {sizes.slice(0, 20).map((s) => {
              const enabled = sizeAvailable(s);
              return <button key={s} type="button" role="radio" disabled={!enabled} aria-checked={size === s} className={chip(size === s, enabled)} onClick={() => onSize(s)}>{s}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};
