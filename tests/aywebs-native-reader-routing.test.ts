/**
 * AYWEBs Android natif — lecteur de page (révisé le 19/11/2026, audit P2-1 à P2-4 / P3-2).
 *
 *  • P2-1 / P3-2 : la coque ne recopie plus AUCUNE liste de domaines. Le profil
 *    de lecteur vient du `store_id` rendu par /page/analyze — c'est-à-dire du
 *    registre unique `shared/aywebsStores.ts`. SHEIN, TEMU et AliExpress
 *    recevaient le lecteur générique faute d'être dans la liste en dur.
 *  • P2-2 : un lecteur trop gros est une ERREUR explicite (jamais tronqué), et
 *    chaque script servi tient sous la borne de la coque — vérifié ici, en CI.
 *  • P2-3 : relance bornée quand la capture revient sans prix + relecture de
 *    confirmation du mode sélection (mêmes délais que l'application RN).
 *  • P2-4 : la page est lue À L'APPUI ; plus de résolution réutilisée 120 s.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { AYWEBS_STORES } from '../shared/aywebsStores';
import { describeAyWebsCaptureScript } from '../src/aywebs/captureScript';

const ANDROID_ACTIVITY = 'android/app/src/main/java/app/zayrovi/mobile/AyWebsBrowseActivity.java';
const activitySource = readFileSync(ANDROID_ACTIVITY, 'utf8');
const RN_CAPTURE_FLOW = readFileSync('apps/mobile/src/features/aywebs/captureFlow.ts', 'utf8');

function androidScriptCap(): number {
  const match = activitySource.match(/static final int CAPTURE_SCRIPT_MAX_BYTES = ([0-9_]+);/);
  expect(match, 'CAPTURE_SCRIPT_MAX_BYTES doit être déclaré').not.toBeNull();
  return Number(match![1].replace(/_/g, ''));
}

describe('AYWEBs Android — profil de lecteur issu du registre serveur (P2-1 / P3-2)', () => {
  it('lit `store_id` dans /page/analyze et l’envoie au lecteur servi', () => {
    expect(activitySource).toContain('analyzedStoreId = data.isNull("store_id") ? "" : data.optString("store_id", "")');
    expect(activitySource).toContain('captureStoreIdFor(currentUrl)');
    expect(activitySource).toContain('?store_id=" + storeId');
  });

  it('aucune liste de domaines marchands recopiée dans la coque', () => {
    expect(activitySource).not.toContain('captureStoreIdForUrl');
    expect(activitySource).not.toContain('matchesAnyDomain');
    for (const store of AYWEBS_STORES) {
      for (const domain of store.domains) {
        expect(activitySource, `${store.id} / ${domain}`).not.toContain(`"${domain}"`);
      }
    }
  });

  it('ne réutilise pas le bundle d’un autre magasin après un changement de profil', () => {
    expect(activitySource).toContain('captureScriptStoreId = cacheKey');
    expect(activitySource).toContain('captureScript = "";');
  });
});

describe('AYWEBs Android — taille du lecteur (P2-2)', () => {
  it('au-delà de la borne : erreur CAPTURE_SCRIPT_TOO_LARGE, jamais un script tronqué', () => {
    expect(activitySource).toContain('throw new java.io.IOException("CAPTURE_SCRIPT_TOO_LARGE")');
    expect(activitySource).not.toMatch(/> 512_000\) break;/);
  });

  it('chaque script servi (toutes boutiques, matrice ET sélection) tient sous la borne Android', () => {
    const cap = androidScriptCap();
    const ids: Array<string | null> = [null, ...AYWEBS_STORES.map((store) => store.id)];
    let largest = { id: '', bytes: 0 };
    for (const id of ids) {
      for (const mode of ['matrix', 'selection'] as const) {
        const served = describeAyWebsCaptureScript(id, { mode });
        const bytes = Buffer.byteLength(served.text, 'utf8');
        if (bytes > largest.bytes) largest = { id: `${id ?? 'legacy'}#${mode}`, bytes };
        expect(bytes, `${id ?? 'legacy'} (${mode}) : ${bytes} octets`).toBeLessThan(cap);
      }
    }
    // Marge de 25 % : une croissance du lecteur se voit ici avant de casser les téléphones.
    expect(largest.bytes, `plus gros script : ${largest.id}`).toBeLessThan(cap * 0.75);
  });
});

describe('AYWEBs Android — relance et double lecture (P2-3)', () => {
  it('mêmes délais de relance « sans prix » que l’application RN', () => {
    const rn = RN_CAPTURE_FLOW.match(/AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS = \[([^\]]+)\]/);
    const android = activitySource.match(/CAPTURE_PRICE_RETRY_DELAYS_MS = \{([^}]+)\}/);
    expect(rn && android).toBeTruthy();
    const norm = (value: string) => value.split(',').map((entry) => Number(entry.trim().replace(/L$/, '')));
    expect(norm(android![1])).toEqual(norm(rn![1]));
  });

  it('mode sélection : relecture de confirmation à 400 ms, au plus deux', () => {
    expect(activitySource).toContain('SELECTION_CONFIRM_DELAY_MS = 400L');
    expect(activitySource).toContain('SELECTION_CONFIRM_MAX_READS = 2');
    expect(RN_CAPTURE_FLOW).toContain('AYWEBS_SELECTION_CONFIRM_DELAY_MS = 400');
    expect(activitySource).toContain('"selection".equals(capture.optString("captureMode", ""))');
  });
});

describe('AYWEBs Android — capture à l’appui et feuille de confirmation (P2-4)', () => {
  it('plus aucune résolution pré-calculée réutilisée', () => {
    expect(activitySource).not.toContain('PREFETCH_FRESH_MS');
    expect(activitySource).not.toContain('prefetchedProduct');
  });

  it('la feuille reçoit captured_selection + quote_token, pré-remplit la quantité et renvoie à la page', () => {
    expect(activitySource).toContain('reply.optJSONObject("captured_selection")');
    expect(activitySource).toContain('selection.optInt("page_quantity", 0)');
    expect(activitySource).toContain('R.string.aywebs_change_on_page');
    expect(activitySource).toContain('body.put("quote_token", quoteToken)');
    for (const file of ['values', 'values-ar']) {
      const strings = readFileSync(`android/app/src/main/res/${file}/strings.xml`, 'utf8');
      expect(strings).toContain('name="aywebs_change_on_page"');
    }
    expect(readFileSync('android/app/src/main/res/values-ar/strings.xml', 'utf8')).toContain('بدّل في الصفحة');
  });
});
