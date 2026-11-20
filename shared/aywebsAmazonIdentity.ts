/** Amazon desktop, mobile short links and legacy product routes share an ASIN. */
export const AMAZON_ASIN_PATH = /\/(?:dp|gp\/(?:product|aw\/d)|product|exec\/obidos\/ASIN|d(?:\/[^/]+)?)\/([A-Z0-9]{10})(?:[/?]|$)/i;

/** This reads the path only; callers validate the Amazon storefront separately. */
export function amazonAsinFromUrl(url: string | URL): string | null {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    return AMAZON_ASIN_PATH.exec(parsed.pathname)?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
