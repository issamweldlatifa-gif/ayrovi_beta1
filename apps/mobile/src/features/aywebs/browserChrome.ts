export const BROWSER_CHROME_IDLE_MS = 140;
export const BROWSER_CHROME_SCROLL_DISTANCE = 12;

/** Ignore subpixel oscillation at rest and the bounce at the top. */
export function browserChromeDirection(previous: number, offset: number): 'top' | 'up' | 'down' | null {
  if (!Number.isFinite(offset)) return null;
  if (offset <= BROWSER_CHROME_SCROLL_DISTANCE) return 'top';
  const delta = offset - previous;
  if (Math.abs(delta) < BROWSER_CHROME_SCROLL_DISTANCE) return null;
  return delta > 0 ? 'down' : 'up';
}
