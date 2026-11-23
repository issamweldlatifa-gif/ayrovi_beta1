/**
 * Lien d'une notification serveur → route de l'application.
 *
 * Le back office (CRM, livraison, factures) écrit des `action_url` en chemins
 * WEB (`/compte/commandes/<id>`, `/compte/suivi`). L'application ne connaît pas
 * ces chemins : sans traduction, une notification de livraison restait un texte
 * mort, alors que l'information existe et que l'écran existe aussi.
 *
 * Cette fonction ne devine rien : un chemin inconnu retourne `null`, et l'écran
 * n'affiche alors aucun bouton (jamais de bouton qui ne mène nulle part).
 */
export type NotificationDestination =
  | { pathname: '/orders' }
  | { pathname: '/orders/[id]'; params: { id: string } }
  | { pathname: '/account/profile' }
  | { pathname: '/(tabs)/account' }
  | { pathname: '/(tabs)/cart' };

const ORDER_ID = /^\/compte\/commandes\/([A-Za-z0-9_-]{1,120})\/?$/;
const PROFILE = /^\/compte\/(profil|securite|sécurité)\/?$/;
const TRACKING = /^\/compte\/(suivi|commandes)\/?$/;
const ACCOUNT = /^\/compte\/?$/;
const INVOICES = /^\/compte\/(factures|paiements)\/?$/;
const CART = /^\/(panier|cart)\/?$/;

export function notificationDestination(actionUrl: string | null | undefined): NotificationDestination | null {
  const raw = String(actionUrl || '').trim();
  if (!raw || raw.length > 300) return null;
  // Une URL absolue vers un autre site n'est jamais ouverte par l'application.
  if (/^[a-z]+:\/\//i.test(raw)) return null;
  const path = raw.split('?')[0].split('#')[0];
  const order = ORDER_ID.exec(path);
  if (order) return { pathname: '/orders/[id]', params: { id: order[1] } };
  if (PROFILE.test(path)) return { pathname: '/account/profile' };
  if (TRACKING.test(path) || INVOICES.test(path)) return { pathname: '/orders' };
  if (ACCOUNT.test(path)) return { pathname: '/(tabs)/account' };
  if (CART.test(path)) return { pathname: '/(tabs)/cart' };
  return null;
}
