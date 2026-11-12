/**
 * Coquille SPA pour la suite serveur (12/11/2026).
 *
 * Les tests de contrat HTTP (`/admin?section=…`, repli SPA des médias absents,
 * 404 honnête des pages inventées) lisent `public/index.html`, produit par
 * `npm run build`. La CI construit avant de tester ; en local (ou dans un bac à
 * sable sans build) le fichier n'existe pas et le serveur répond 404
 * « Frontend build not found » — trois tests tombaient pour cette seule raison.
 *
 * Si — et seulement si — le build manque, on pose une coquille temporaire
 * (la page source `client/index.html`, marquée) puis on la retire à la fin.
 * Un vrai build n'est jamais touché ni écrasé.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SPA_SHELL_MARKER = '<!-- ayrovi:test-spa-shell -->';

export default function setup() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) return undefined;
  const createdDir = !fs.existsSync(publicDir);
  const source = path.resolve(process.cwd(), 'client/index.html');
  const html = fs.existsSync(source)
    ? fs.readFileSync(source, 'utf8')
    : '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ZAYROVI</title></head><body><div id="root"></div></body></html>';
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(indexPath, `${SPA_SHELL_MARKER}\n${html}`);
  return () => {
    try {
      if (fs.existsSync(indexPath) && fs.readFileSync(indexPath, 'utf8').startsWith(SPA_SHELL_MARKER)) fs.unlinkSync(indexPath);
      if (createdDir && fs.existsSync(publicDir) && fs.readdirSync(publicDir).length === 0) fs.rmdirSync(publicDir);
    } catch { /* nettoyage best-effort */ }
  };
}
