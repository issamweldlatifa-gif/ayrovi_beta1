/** Geometry measured on the 706 px reference, normalized to the phone width. */
export function blackFridayGeometry(viewport: number) {
  const width = Math.max(1, Math.min(viewport, 600));
  const dp = (pixels: number) => Math.round(width * pixels / 706);
  return { width, bannerHeight: dp(376), overlap: dp(40), tile: dp(392), terminalHeight: dp(496),
    inset: dp(24), gap: dp(16), afterRail: dp(38), ctaHeight: dp(94), bottom: dp(40) };
}
