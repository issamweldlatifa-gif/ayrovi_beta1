/** Public website origin, intentionally independent from the mobile API origin. */
function parseShareOrigin(raw: string | undefined): string | null {
  try {
    const u = new URL(raw?.trim() || '');
    if (u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash) return u.origin;
  } catch { /* An absent/invalid setting keeps existing sharing behavior. */ }
  return null;
}
export const SHARE_WEB_ORIGIN = parseShareOrigin(process.env.EXPO_PUBLIC_SHARE_WEB_ORIGIN);
export const isShareId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id);
export function publicShareUrl(kind: 'p' | 'r' | 's', id: string | undefined, locale: string, origin = SHARE_WEB_ORIGIN): string | null {
  const safeOrigin = parseShareOrigin(origin ?? undefined);
  return safeOrigin && isShareId(id) ? `${safeOrigin}${locale === 'ar' ? '/ar' : ''}/${kind}/${id}` : null;
}
