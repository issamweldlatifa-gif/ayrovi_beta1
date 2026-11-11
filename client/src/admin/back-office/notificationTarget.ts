/**
 * Où mène une notification de la cloche (11/11/2026) — logique pure.
 *
 * Avant : seules trois formes d'URL étaient reconnues (Lens, support, `tab=orders`) ;
 * les notifications CRM (`?section=crm-tasks`), « Nouvelle commande »
 * (`?section=orders&order=…`) ou `/admin/orders/<id>` fermaient la cloche sans
 * rien ouvrir — un bouton mort. Ici, toute URL de console est lue de la même façon.
 */
export interface NotificationTarget {
  section: string;
  request?: string;
}

const SECTION = /^[a-z0-9][a-z0-9-]{0,40}$/;
/**
 * Écrans dont le paramètre `request` signifie AUTRE CHOSE qu'un identifiant
 * (Commandes : filtre de statut). On y ouvre l'écran, sans paramètre.
 */
const REQUEST_IS_FILTER = new Set(['orders']);
const withRequest = (section: string, request?: string): NotificationTarget =>
  request && !REQUEST_IS_FILTER.has(section) ? { section, request } : { section };

export function notificationTarget(actionUrl: string, origin = 'https://console.local'): NotificationTarget | null {
  const raw = String(actionUrl || '').trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw, origin); } catch { return null; }
  if (url.origin !== new URL(origin).origin) return null;
  const params = url.searchParams;
  const request = params.get('request') || params.get('ticket') || params.get('order') || undefined;
  const section = params.get('section');
  if (section && SECTION.test(section)) return withRequest(section, request);
  if (params.get('tab') === 'orders') return { section: 'orders' };
  // `/admin/orders/<id>` ou `/admin/<section>`.
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'admin' || !parts[1] || !SECTION.test(parts[1])) return null;
  const id = parts[2] ? decodeURIComponent(parts[2]) : undefined;
  return withRequest(parts[1], id || request);
}
