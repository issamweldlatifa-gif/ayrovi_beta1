/**
 * AYWEBs — fiches de référence PAR BOUTIQUE (12/11/2026), porte de CI.
 *
 * Chaque fichier `tests/fixtures/aywebs/stores/<boutique>/<cas>.html` est une
 * page produit figée. Le banc la fait lire par le script QUE CETTE BOUTIQUE
 * REÇOIT RÉELLEMENT (dédié, lot ou noyau — `describeAyWebsCaptureScript`),
 * puis la fait juger par le serveur avec les seuils du résolveur. Deux
 * verrous :
 *
 *  1. `expect` — l'attendu ÉCRIT PAR UN HUMAIN dans l'en-tête de la fiche
 *     (prix + devise, ou motif de refus). Il ne se régénère jamais.
 *  2. `<cas>.expected.json` — l'instantané complet (source du prix,
 *     corroboration, disponibilité, variantes, images, lot servi). Toute
 *     modification du cœur qui change la lecture d'UNE boutique fait échouer
 *     SA fiche : on voit qui est touché avant de publier.
 *
 * Mise à jour volontaire de l'instantané (après relecture du diff) :
 *   npm run aywebs:fixtures:update
 *
 * En-tête d'une fiche (première ligne) :
 *   <!-- aywebs-fixture {"url":"https://…","expect":{"price":21.4,"currency":"EUR"},
 *        "globals":{"Shopify":{…}},"source":"../autre-fichier.html","note":"…"} -->
 * Le dossier `external/` décrit des boutiques hors registre (script complet).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { describeAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { AYWEBS_STORES, ayWebsStoreRecognition, detectAyWebsStore } from '../shared/aywebsStores';

const ROOT = join(process.cwd(), 'tests/fixtures/aywebs/stores');
const UPDATE = process.env.AYWEBS_FIXTURES_UPDATE === '1';

interface FixtureMeta {
  url: string;
  expect: { price?: number; currency?: string; rejection?: string; variantGroups?: number; available?: boolean };
  globals?: Record<string, unknown>;
  source?: string;
  note?: string;
}

interface Fixture { dir: string; storeId: string | null; name: string; file: string; meta: FixtureMeta; html: string }

function loadFixtures(): Fixture[] {
  if (!existsSync(ROOT)) return [];
  const fixtures: Fixture[] = [];
  for (const dir of readdirSync(ROOT).sort()) {
    const path = join(ROOT, dir);
    if (!statSync(path).isDirectory()) continue;
    for (const name of readdirSync(path).filter((file) => file.endsWith('.html')).sort()) {
      const file = join(path, name);
      const raw = readFileSync(file, 'utf8');
      const header = raw.match(/^<!--\s*aywebs-fixture\s+([\s\S]*?)-->/);
      if (!header) throw new Error(`${dir}/${name} : en-tête « aywebs-fixture » manquant`);
      const meta = JSON.parse(header[1]) as FixtureMeta;
      const html = meta.source ? readFileSync(resolve(path, meta.source), 'utf8') : raw;
      fixtures.push({ dir, storeId: dir === 'external' ? null : dir, name: name.replace(/\.html$/, ''), file, meta, html });
    }
  }
  return fixtures;
}

function assignGlobals(target: Record<string, unknown>, globals: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(globals || {})) target[key] = value;
}

function judge(fixture: Fixture) {
  const served = describeAyWebsCaptureScript(fixture.storeId);
  const dom = new JSDOM(fixture.html, { url: fixture.meta.url, runScripts: 'outside-only' });
  try {
    assignGlobals(dom.window as unknown as Record<string, unknown>, fixture.meta.globals);
    const capture = JSON.parse(String(dom.window.eval(served.text))) as Record<string, unknown>;
    /* Mêmes seuils que `resolveAyWebsProduct` : un domaine hors registre, ou une
       boutique reconnue par la seule capture, exige corroboration + fiche produit. */
    const store = detectAyWebsStore(fixture.meta.url);
    const strict = !store || ayWebsStoreRecognition(store) !== 'url';
    const verdict = validateAyWebsCapturedPage(capture, fixture.meta.url, { requireCorroboration: strict, requireProductPage: strict });
    const images = Array.isArray(capture.images) ? (capture.images as string[]) : [];
    return {
      served: served.bundle,
      detectedStore: store?.id ?? null,
      ok: verdict.ok,
      rejection: verdict.rejection,
      price: verdict.ok ? Math.round(verdict.price * 100) / 100 : null,
      currency: verdict.ok ? verdict.currency : null,
      priceSource: verdict.priceSource,
      corroborated: verdict.corroborated,
      availability: verdict.availability,
      title: verdict.scraped?.title ?? (typeof capture.title === 'string' ? capture.title : null),
      variantGroups: verdict.variantGroups.map((group) => ({ name: group.name, values: group.values, selected: group.selected ?? [] })),
      skuCombinations: verdict.skuCombinations.length,
      images: images.length,
      firstImage: images[0] ?? null,
    };
  } finally {
    dom.window.close();
  }
}

const fixtures = loadFixtures();

describe('fiches de référence AYWEBs par boutique', () => {
  it('le banc trouve des fiches, une par dossier au moins, et les dossiers nomment des boutiques du registre', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    const known = new Set(AYWEBS_STORES.map((store) => store.id));
    for (const dir of new Set(fixtures.map((fixture) => fixture.dir))) {
      expect(dir === 'external' || known.has(dir), `dossier « ${dir} » inconnu du registre`).toBe(true);
    }
  });

  it.each(fixtures.map((fixture) => [`${fixture.dir}/${fixture.name}`, fixture] as const))('%s', (_label, fixture) => {
    const result = judge(fixture);
    const wanted = fixture.meta.expect;

    /* 1. L'attendu humain : jamais régénéré. */
    if (fixture.storeId) expect(result.detectedStore, 'l’URL de la fiche doit désigner la boutique de son dossier').toBe(fixture.storeId);
    else expect(result.detectedStore).toBeNull();
    if (wanted.rejection) {
      expect(result.ok, `refus attendu (${wanted.rejection})`).toBe(false);
      expect(result.rejection).toBe(wanted.rejection);
    } else {
      expect(result.ok, `capture refusée : ${result.rejection}`).toBe(true);
      if (wanted.price !== undefined) expect(result.price).toBeCloseTo(wanted.price, 2);
      if (wanted.currency) expect(result.currency).toBe(wanted.currency);
    }
    if (wanted.variantGroups !== undefined) expect(result.variantGroups).toHaveLength(wanted.variantGroups);
    if (wanted.available !== undefined) expect(result.availability === 'OUT_OF_STOCK').toBe(!wanted.available);

    /* 2. L'instantané complet. */
    const snapshotFile = fixture.file.replace(/\.html$/, '.expected.json');
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (UPDATE || !existsSync(snapshotFile)) {
      if (!UPDATE && process.env.CI) throw new Error(`${snapshotFile} absent : lancez « npm run aywebs:fixtures:update » et relisez-le`);
      writeFileSync(snapshotFile, serialized);
      return;
    }
    expect(JSON.parse(serialized), `instantané ${fixture.dir}/${fixture.name} — relisez le diff, puis « npm run aywebs:fixtures:update »`)
      .toEqual(JSON.parse(readFileSync(snapshotFile, 'utf8')));
  });

  it('chaque instantané a sa fiche (pas d’orphelin)', () => {
    if (!existsSync(ROOT)) return;
    for (const dir of readdirSync(ROOT)) {
      const path = join(ROOT, dir);
      if (!statSync(path).isDirectory()) continue;
      for (const file of readdirSync(path).filter((name) => name.endsWith('.expected.json'))) {
        expect(existsSync(join(path, file.replace(/\.expected\.json$/, '.html'))), `${dir}/${file} orphelin`).toBe(true);
      }
    }
  });
});
