/**
 * Injecte la police officielle AYROVI (Zalando Sans, fichier local du dépôt) dans les prototypes
 * Admin : chaque maquette reste un fichier HTML autonome, lisible hors ligne et dans l'aperçu
 * sandboxé (aucune requête réseau, aucune police externe).
 *
 * Usage : node docs/admin-prototypes/inject-font.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const fontPath = path.resolve(here, '../../client/public/fonts/editorial/zalando-sans.woff2');
const base64 = fs.readFileSync(fontPath).toString('base64');
const dataUri = `data:font/woff2;base64,${base64}`;

const targets = fs.readdirSync(here).filter((file) => file.endsWith('.html'));
for (const file of targets) {
  const full = path.join(here, file);
  const source = fs.readFileSync(full, 'utf8');
  const marker = '/*AYROVI_FONT_PLACEHOLDER*/';
  const asset = 'assets/zalando-sans.woff2';
  let next = source;
  if (source.includes(marker)) {
    next = source.replace(marker, dataUri);
  } else if (source.includes('__FONT_DATA_URI__')) {
    next = source.replace('__FONT_DATA_URI__', dataUri);
  } else if (source.includes(asset)) {
    // Version légère : la maquette pointe vers la police copiée à côté (aperçu local).
    next = source;
  }
  if (next !== source) fs.writeFileSync(full, next);
  console.log(`${file}: ${next === source ? 'inchangé' : 'police injectée'} (${Math.round(next.length / 1024)} Ko)`);
}
