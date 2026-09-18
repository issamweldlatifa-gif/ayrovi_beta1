import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Price.
 * Affichage canonique des montants TND : encre noire, tabulaires,
 * prix barré optionnel (gris secondaire) + libellé devise.
 */
export interface PriceProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number;
  originalAmount?: number;
  size?: 'sm' | 'md' | 'lg';
  currencyLabel?: string;
  showCurrency?: boolean;
}

const SIZES = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' } as const;
const ORIGINAL = { sm: 'text-xs', md: 'text-sm', lg: 'text-sm' } as const;

const formatTND = (amount: number): string =>
  new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2, minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

export const Price: React.FC<PriceProps> = ({
  amount, originalAmount, size = 'md', currencyLabel = 'DT', showCurrency = true, className, ...props
}) => {
  const hasOriginal = originalAmount != null && originalAmount > amount;
  return (
    <span className={twMerge('inline-flex flex-col items-end leading-tight', className)} {...props}>
      <span className={twMerge('font-bold tabular-nums tracking-tight text-ink', SIZES[size])}>
        {formatTND(amount)}
        {showCurrency && <span className="ml-1 text-muted">{currencyLabel}</span>}
      </span>
      {hasOriginal && (
        <span className={twMerge('font-semibold tabular-nums text-muted line-through', ORIGINAL[size])} aria-label="Prix initial">
          {formatTND(originalAmount as number)}
        </span>
      )}
    </span>
  );
};
