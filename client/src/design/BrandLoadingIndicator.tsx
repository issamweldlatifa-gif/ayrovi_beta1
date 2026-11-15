import React from "react";

/** Grey zebra Z (v7) fitted inside its ring. Animation lives in the SVG and respects reduced motion.
 * Decorative: the enclosing loading state owns its accessible status/label. */
export function BrandLoadingIndicator({ size = 64 }: { size?: number }) {
  return (
    <img
      src="/media/logo-zayrovi-loading.svg?v=8.0"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}
