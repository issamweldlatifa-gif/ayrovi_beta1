import React from "react";

/** Grey heart-handshake. Animation lives in the SVG and respects reduced motion.
 * Decorative: the enclosing loading state owns its accessible status/label. */
export function BrandLoadingIndicator({ size = 64 }: { size?: number }) {
  return (
    <img
      src="/media/logo-ayrovi-loading.svg?v=6.0"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}
