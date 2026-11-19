import { brand, documentHtml, escapeHtml as e } from './html.mjs';

const text = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';

// Only use media through the existing public media/upload boundary, or external
// HTTPS on an explicitly approved media origin. Never fetch a CMS URL server-side.
export function shareImage(value, origin, apiOrigin, mediaOrigin) {
  if (typeof value !== 'string' || /[\\\x00-\x20]/.test(value)) return null;
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.username || url.password || url.hash || /%(?:2f|5c|25)/i.test(url.pathname)) return null;
  if ([origin, apiOrigin].includes(url.origin) && /^\/(media|uploads)\//.test(url.pathname)) {
    return new URL(url.pathname + url.search, origin).href;
  }
  return mediaOrigin && url.origin === mediaOrigin ? url.href : null;
}

export function shareHtml({ locale, prefix = '', id = '', card, origin, apiOrigin, mediaOrigin = null, unavailable = false, preview = false }) {
  const ar = locale === 'ar';
  const home = ar ? '/ar/' : '/';
  const kind = ({ p: ar ? 'منتج' : 'Produit', r: 'Reel', s: 'Story' })[prefix];
  const title = card ? text(ar && card.title_ar || card.title, 200) || kind : unavailable
    ? (ar ? 'المحتوى غير متاح مؤقّتًا' : 'Contenu temporairement indisponible')
    : (ar ? 'المحتوى موش موجود' : 'Contenu introuvable');
  const description = text(card && (ar && card.description_ar || card.description), 500) || (ar ? 'مشاركة من ZAYROVI.' : 'Partagé depuis ZAYROVI.');
  const image = shareImage(card?.image, origin, apiOrigin, mediaOrigin);
  const switchLanguage = card ? `<a class="lang" href="${ar ? '/' : '/ar/'}${prefix}/${id}">${ar ? 'Français' : 'العربية'}</a>` : '';
  // Scheme uses exact native route names so previously installed builds can open products/Reels.
  const deepLink = prefix === 'p' ? `zayrovi://product/${id}` : prefix === 'r' ? `zayrovi://reels-viewer?id=${id}&shared=1` : `zayrovi://stories?id=${id}`;
  return documentHtml({ locale, title: `${title} · ZAYROVI`, description,
    canonical: card ? `${origin}${home}${prefix}/${id}` : '', image: image || origin + '/site-assets/og.png',
    robots: preview || !card ? 'noindex,follow' : '',
    body: `<header class="top"><div class="wrap bar"><a class="brand" href="${home}">${brand}</a>${switchLanguage}</div></header><main class="paper-page"><h1>${e(title)}</h1>${card ? `<p>${e(description)}</p>${image ? `<img class="share-art" src="${e(image)}" alt="">` : ''}<div class="actions"><a class="btn" href="${e(deepLink)}">${ar ? 'افتح في التطبيق' : 'Ouvrir dans l’application'}</a><a href="${home}">${ar ? 'اكتشف ZAYROVI' : 'Découvrir ZAYROVI'}</a></div><p class="small">${ar ? 'إذا التطبيق موش مثبّت، تنجم تبقى في الصفحة هاذي.' : 'Sans l’application, vous pouvez rester sur cette page.'}</p>` : `<p><a href="${home}">${ar ? 'الصفحة الرئيسية' : 'Accueil ZAYROVI'}</a></p>`}</main>` });
}
