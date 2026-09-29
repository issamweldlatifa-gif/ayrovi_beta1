import React from 'react';

interface OrderConfirmationShellProps {
  children: React.ReactNode;
  direction: 'ltr' | 'rtl';
  ariaLabelledBy: string;
}

/** Full-screen modal shell for the post-checkout order confirmation only. */
export const OrderConfirmationShell: React.FC<OrderConfirmationShellProps> = ({
  children,
  direction,
  ariaLabelledBy,
}) => (
  <div
    className="order-confirmation-page"
    dir={direction}
    role="dialog"
    aria-modal="true"
    aria-labelledby={ariaLabelledBy}
    data-order-confirmation
  >
    <div className="order-confirmation-container ayrovix-theme-scope">
      {children}
    </div>
  </div>
);
