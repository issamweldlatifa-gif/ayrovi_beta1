import { legalPaths } from '../landing/lib/legal.mjs';

const startsAt = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);
const returns = ['customerAuth', 'cardPayment', 'orderId', 'transaction', 'session_id'];
export const itemID = /^[A-Za-z0-9_-]{1,150}$/;
export const shareKinds = { p: 'product', r: 'reel', s: 'story' };

// Evaluate on the unchanged incoming URL; forwarding must preserve the query and method.
export function routeSurface({ pathname, searchParams }) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (['/admin', '/admin-build'].some(prefix => startsAt(path, prefix))) return 'admin';
  if (path === '/' && returns.some(key => searchParams.has(key))) return 'legacy';
  if (['/', '/ar', '/robots.txt', '/sitemap.xml'].includes(path) || startsAt(path, '/site-assets') ||
      legalPaths.includes(path.replace(/^\/(?:ar\/)?/, '')) ||
      /^\/(?:ar\/)?[prs](?:\/|$)/.test(path)) return 'landing';
  // Includes API, media/uploads, old SPA assets, reset/native OAuth, Published shares and association files.
  return 'legacy';
}

export function shareRoute(path) {
  const match = path.match(/^\/(ar\/)?([prs])\/([A-Za-z0-9_-]{1,150})\/?$/);
  return match && { locale: match[1] ? 'ar' : 'fr', prefix: match[2], kind: shareKinds[match[2]], id: match[3] };
}
