import React from 'react';

export type NavigationBrandIconProps = React.SVGProps<SVGSVGElement> & { size?: number };

/** AYROVIX mark rebuilt as a clean vector from the supplied nested-arrow reference. */
export const AyrovixNavIcon: React.FC<NavigationBrandIconProps> = ({ size = 26, className = '', ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" aria-hidden="true" focusable="false" {...props}>
    <path d="M4.2 5.1h13.1c1 0 1.7.7 1.7 1.7v12.1" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.2 10h8.5c1 0 1.7.7 1.7 1.7v7.2" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="m4.3 19 6.2-6.2M4.7 12.8h5.8v5.8" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** AYVISI mark rebuilt as a two-piece eye from the supplied reference. */
export const AyvisiNavIcon: React.FC<NavigationBrandIconProps> = ({ size = 27, className = '', ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <path d="M2.1 12 6.8 7.15l3.15 2.95L8.05 12l1.9 1.9-3.15 2.95L2.1 12Z"/>
    <path d="M8.2 6.15c3.65-1.28 7.46-.57 10.14 1.47A12.17 12.17 0 0 1 21.9 12a12.17 12.17 0 0 1-3.56 4.38c-2.68 2.04-6.49 2.75-10.14 1.47 3.02-1.64 4.67-3.57 4.67-5.85S11.22 7.79 8.2 6.15Z"/>
  </svg>
);
