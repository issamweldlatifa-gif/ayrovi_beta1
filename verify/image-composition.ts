/*
 * VÉRIFICATION DU MOTEUR DE COMPOSITION (phase 2, 25/09/2026).
 *
 * Rejoue le contrat d'acceptation du prototype, mais à travers le CODE DE
 * PRODUCTION (src/services/imageIsolation.ts + segmentation.ts + imageComposition.ts)
 * sur des images réelles de types, ratios, éclairages et fonds différents.
 *
 *   npm run verify:image-composition
 *   AYROVI_COMPOSITION_FIXTURES=/chemin/vers/images npm run verify:image-composition
 *
 * Les images de référence sont versionnées dans verify/fixtures/image-composition/
 * (6 cas : chaussure, sac, vêtement porté, fond complexe, fond sombre, perspective).
 *
 * Sortie visuelle : screenshots/image-composition/<nom>.png (la carte composée).
 * Code de sortie 1 si une seule garantie n'est pas tenue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isolateBuffer } from '../src/services/imageIsolation';
import { segmentBuffer } from '../src/services/segmentation';
import { acceptComposition, composeOnMockup } from '../src/services/imageComposition';

const FIXTURES = process.env.AYROVI_COMPOSITION_FIXTURES
  || path.resolve(process.cwd(), 'verify', 'fixtures', 'image-composition');
const OUTPUT = process.env.AYROVI_COMPOSITION_OUTPUT
  || path.resolve(process.cwd(), 'screenshots', 'image-composition');

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`[composition] dossier d'images introuvable : ${FIXTURES}`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT, { recursive: true });
  const files = fs.readdirSync(FIXTURES).filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).sort();
  if (!files.length) {
    console.error('[composition] aucune image à vérifier.');
    process.exit(1);
  }

  let failures = 0;
  console.log('\nMOTEUR DE COMPOSITION — contrat d\'acceptation\n');
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(FIXTURES, file));
    let isolated = await segmentBuffer(buffer);
    let route = 'segmentation';
    if (!isolated) { isolated = (await isolateBuffer(buffer, { treatWhiteAsUniform: true })).png; route = 'chroma-key'; }
    if (!isolated) {
      failures += 1;
      console.log(`  ÉCHEC   ${file} — aucune isolation disponible (l'original serait servi)`);
      continue;
    }
    const composed = await composeOnMockup(isolated);
    if (!composed) {
      failures += 1;
      console.log(`  ÉCHEC   ${file} — composition refusée`);
      continue;
    }
    const verdict = acceptComposition(composed);
    if (!verdict.pass) failures += 1;
    fs.writeFileSync(path.join(OUTPUT, `${path.parse(file).name}.png`), composed.png);
    const broken = Object.entries(verdict.checks).filter(([, ok]) => !ok).map(([name]) => name);
    console.log(
      `  ${verdict.pass ? 'OK     ' : 'ÉCHEC  '} ${file.padEnd(38)}`
      + ` ${route.padEnd(13)} cadre ${composed.frame.width}×${composed.frame.height}`
      + ` · ×${composed.placement.scale.toFixed(2)}`
      + ` · Δratio ${composed.placement.aspectDeltaPercent.toFixed(3)} %`
      + ` · occupation ${(composed.placement.coverage * 100).toFixed(1)} %`
      + (broken.length ? ` · ${broken.join(', ')}` : ''),
    );
  }
  console.log(`\n${files.length - failures}/${files.length} images conformes — sortie : ${OUTPUT}\n`);
  if (failures) process.exit(1);
}

void main();
