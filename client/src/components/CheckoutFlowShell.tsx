import React from 'react';

type CheckoutFlowSize = 'form' | 'confirmation';

interface CheckoutFlowShellProps {
  children: React.ReactNode;
  direction: 'ltr' | 'rtl';
  size: CheckoutFlowSize;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/** One responsive viewport/card contract shared by Livraison, Paiement and Confirmation. */
export const CheckoutFlowShell: React.FC<CheckoutFlowShellProps> = ({
  children,
  direction,
  size,
  ariaLabel,
  ariaLabelledBy,
}) => (
  <div
    className={`checkout-flow-page checkout-flow-page--${size}`}
    dir={direction}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    data-checkout-flow={size}
  >
    <div className={`checkout-flow-container checkout-flow-container--${size} ayrovix-theme-scope`}>
      {children}
    </div>
  </div>
);
