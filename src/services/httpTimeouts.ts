/**
 * Délais HTTP du serveur — audit d'architecture du 12/11/2026.
 *
 * Node ferme une connexion keep-alive inactive après 5 s par défaut. Derrière
 * le proxy de Render (ou tout répartiteur de charge), qui garde ses connexions
 * vers l'application ouvertes plus longtemps, le proxy envoie parfois une
 * requête sur une connexion que Node est en train de fermer : 502 / ECONNRESET
 * intermittents, invisibles dans les journaux de l'application. Le test de
 * charge « utilisateurs simultanés » l'a reproduit (erreurs réseau dès 500
 * utilisateurs, temps de réflexion 3–9 s à cheval sur les 5 s).
 *
 * Règle : keep-alive de l'application > délai d'inactivité du proxy, et
 * headersTimeout > keepAliveTimeout (sinon Node coupe quand même la connexion).
 * Réglable par HTTP_KEEP_ALIVE_TIMEOUT_MS (5 s … 10 min, défaut 120 s).
 */
import type { Server } from 'node:http';

export const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 120_000;
const HEADERS_MARGIN_MS = 5_000;

export function httpTimeouts(env: NodeJS.ProcessEnv = process.env): { keepAliveTimeout: number; headersTimeout: number } {
  const requested = Number(env.HTTP_KEEP_ALIVE_TIMEOUT_MS);
  const keepAliveTimeout = Number.isFinite(requested) && requested >= 5_000 && requested <= 600_000
    ? Math.round(requested)
    : DEFAULT_KEEP_ALIVE_TIMEOUT_MS;
  return { keepAliveTimeout, headersTimeout: keepAliveTimeout + HEADERS_MARGIN_MS };
}

export function applyHttpTimeouts(server: Server, env: NodeJS.ProcessEnv = process.env) {
  const timeouts = httpTimeouts(env);
  server.keepAliveTimeout = timeouts.keepAliveTimeout;
  server.headersTimeout = timeouts.headersTimeout;
  return timeouts;
}
