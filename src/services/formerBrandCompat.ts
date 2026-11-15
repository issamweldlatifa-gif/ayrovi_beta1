/**
 * Requêtes à l'ancien nom (16/11/2026).
 *
 * Routes (`/api/<ancien>x/…`), fichiers publics (logo, police), en-têtes
 * (`x-<ancien>-client`) et cookies de session portent désormais le nom ZAYROVI.
 * Une application déjà installée, un lien partagé, un e-mail envoyé hier ou un
 * navigateur encore connecté parlent l'ancien nom. Sans cette passerelle :
 * 404 sur les liens, déconnexion de tout le monde, appareils muets.
 *
 *  • chemin : redirection 308 (méthode et corps conservés) vers le nom ZAYROVI ;
 *  • en-têtes et cookies : recopiés sous le nouveau nom quand il manque — le
 *    jeton reste le même, la session continue. Les nouveaux cookies sont posés
 *    par les réponses habituelles ; les anciens expirent d'eux-mêmes.
 *
 * Aucun nom en clair ici : la reconnaissance vient de `shared/formerBrand.ts`.
 */
import type { NextFunction, Request, Response } from 'express';
import { mentionsFormerBrand, renameFormerBrand } from '../../shared/formerBrand';

export function renameCookieHeader(header: string): string {
  const pairs = header.split(';').map((part) => part.trim()).filter(Boolean);
  const names = new Set(pairs.map((pair) => pair.split('=')[0]));
  const added: string[] = [];
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    const name = index < 0 ? pair : pair.slice(0, index);
    if (!mentionsFormerBrand(name)) continue;
    const next = renameFormerBrand(name);
    if (names.has(next)) continue;
    names.add(next);
    added.push(`${next}${index < 0 ? '' : pair.slice(index)}`);
  }
  return added.length ? [...pairs, ...added].join('; ') : header;
}

export function formerBrandCompat(req: Request, res: Response, next: NextFunction): void {
  if (mentionsFormerBrand(req.path)) {
    res.redirect(308, renameFormerBrand(req.originalUrl));
    return;
  }
  for (const name of Object.keys(req.headers)) {
    if (!mentionsFormerBrand(name)) continue;
    const renamed = renameFormerBrand(name);
    if (req.headers[renamed] === undefined) req.headers[renamed] = req.headers[name];
  }
  const cookie = req.headers.cookie;
  if (cookie && mentionsFormerBrand(cookie)) req.headers.cookie = renameCookieHeader(cookie);
  next();
}
