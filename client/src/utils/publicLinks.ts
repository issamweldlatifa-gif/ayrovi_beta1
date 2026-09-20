/** Links from CMS/config are data, not executable schemes. No protocol-relative redirects. */
export function safePublicHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f\\]/.test(href) || href.startsWith('//')) return null;
  if (!href.startsWith('/') && !href.startsWith('#') && !/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href, 'https://ayrovi.invalid');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return href;
  } catch { return null; }
}
