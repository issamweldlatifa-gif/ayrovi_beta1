import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Container.
 * Conteneur de contenu : max 1200px, gouttière 16/24/32px, centré.
 */
export const Container: React.FC<React.HTMLAttributes<HTMLDivElement> & { narrow?: boolean }> = ({
  narrow = false, className, ...props
}) => (
  <div
    className={twMerge('mx-auto w-full px-4 sm:px-6 lg:px-8', narrow ? 'max-w-[56rem]' : 'max-w-[75rem]', className)}
    {...props}
  />
);
