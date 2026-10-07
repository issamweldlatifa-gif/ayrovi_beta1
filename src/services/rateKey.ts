/**
 * Clé de limitation de débit : **l'identité de la session d'abord, l'IP ensuite**.
 *
 * Pourquoi (constat du 07/10/2026, Tunisie) : les opérateurs mobiles font sortir
 * des milliers d'abonnés derrière la même adresse IP publique (CGNAT). Un
 * plafond « par IP » n'y mesure donc pas un client : il mesure un opérateur.
 * Avec `/api/ayrovix` limité à 40 analyses coûteuses par jour et par IP, les
 * utilisateurs d'un même opérateur se seraient privés les uns les autres.
 *
 * Le jeton de session n'est PAS un identifiant choisi par l'appelant : il est
 * créé et haché par le serveur (cookie web ou Bearer mobile). On hache encore
 * ici, en tronquant : une table de compteurs en mémoire ne doit jamais contenir
 * un secret exploitable.
 *
 * Les requêtes sans session (navigation anonyme, inscription) retombent sur
 * l'IP : c'est le seul repère disponible, et leurs plafonds sont dimensionnés
 * pour un réseau partagé (voir server.ts).
 */
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { sessionTokenFromRequest } from '../customer/auth';

export function clientRateLimitKey(req: Pick<Request, 'headers' | 'ip'>): string {
  const token = sessionTokenFromRequest(req as Request);
  if (token) return `session:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`;
  return `ip:${req.ip || 'unknown'}`;
}
