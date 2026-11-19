export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const brand = '<img src="/site-assets/mark.svg" width="34" height="34" alt=""><span>zayrovi</span>';
export function documentHtml({ locale = 'fr', title, description, canonical, image, body, extra = '', robots = '' }) {
  const esc = escapeHtml;
  return `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a0a0a">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${esc(robots)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}"><meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="${locale === 'ar' ? 'ar_TN' : 'fr_TN'}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" type="image/svg+xml" href="/site-assets/mark.svg"><link rel="stylesheet" href="/site-assets/site.css">${extra}</head><body>${body}</body></html>`;
}
