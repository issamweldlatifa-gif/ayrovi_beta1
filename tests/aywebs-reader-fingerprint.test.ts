/**
 * AYWEBs — EMPREINTE DE LECTEUR FIXÉE PAR STORE (« Phase 1 », 06/10/2026).
 *
 * Ce qui est verrouillé ici n'est pas un goût, c'est une DÉCISION MESURÉE :
 *   • une seule empreinte part en premier (déterministe, documentée) ;
 *   • l'autre n'est qu'un repli différé — jamais une requête marchande
 *     supplémentaire sur le chemin qui fonctionne déjà ;
 *   • Jina part APRÈS ce repli gratuit (il coûte 13–28 s et un appel externe) ;
 *   • tout est surchargeable sans redéploiement, et une valeur inconnue ne
 *     remplace pas la mesure : elle retombe dessus.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  readerFallbackDelayMs,
  readerFingerprintReport,
  readerHeaders,
  readerJinaHeadstartMs,
  readerProfileForStore,
  readerProfileProvenance,
  readerProbePlan,
} from '../src/scraper/readerFingerprint';

const TOUCHED_ENV = [
  'AYROVIX_READER_PROFILE', 'AYROVIX_READER_PROFILE_AMAZON', 'AYROVIX_READER_PROFILE_SHEIN',
  'AYROVIX_READER_FALLBACK_MS', 'AYROVIX_JINA_HEADSTART_MS',
];

afterEach(() => {
  for (const key of TOUCHED_ENV) delete process.env[key];
});

describe('AYWEBs Phase 1 — empreinte primaire par store', () => {
  it('Amazon = mobile (la seule empreinte qui a rendu un prix mesurable)', () => {
    expect(readerProfileForStore('amazon')).toBe('mobile');
    expect(readerProfileProvenance('amazon')).toContain('693 Ko');
    expect(readerProfileProvenance('amazon')).toContain('3,8 Ko');
  });

  it('boutiques rendues côté client = bureau, et la provenance ne revendique rien', () => {
    for (const store of ['shein', 'temu', 'aliexpress']) {
      expect(readerProfileForStore(store)).toBe('desktop');
      expect(readerProfileProvenance(store).length).toBeGreaterThan(20);
    }
    expect(readerProfileProvenance('aliexpress')).toContain('302');
  });

  it('store inconnu : profil générique bureau, jamais une mesure inventée', () => {
    expect(readerProfileForStore('boutique-inconnue')).toBe('desktop');
    expect(readerProfileForStore(null)).toBe('desktop');
    expect(readerProfileProvenance('boutique-inconnue')).toContain('Aucune mesure propre');
  });

  it('surcharge sans redéploiement : par store, puis globale ; valeur inconnue ignorée', () => {
    process.env.AYROVIX_READER_PROFILE_AMAZON = 'desktop';
    expect(readerProfileForStore('amazon')).toBe('desktop');
    delete process.env.AYROVIX_READER_PROFILE_AMAZON;

    process.env.AYROVIX_READER_PROFILE = 'mobile';
    expect(readerProfileForStore('shein')).toBe('mobile');
    process.env.AYROVIX_READER_PROFILE_SHEIN = 'desktop';
    expect(readerProfileForStore('shein')).toBe('desktop'); // le store l'emporte
    delete process.env.AYROVIX_READER_PROFILE_SHEIN;

    process.env.AYROVIX_READER_PROFILE_AMAZON = 'navigateur-magique';
    expect(readerProfileForStore('amazon')).toBe('mobile'); // on retombe sur la mesure
  });
});

describe('AYWEBs Phase 1 — en-têtes figés', () => {
  it('les en-têtes sont gelés (une empreinte qui bouge seule n’en est pas une)', () => {
    expect(Object.isFrozen(readerHeaders('mobile'))).toBe(true);
    expect(Object.isFrozen(readerHeaders('desktop'))).toBe(true);
    const headers = readerHeaders('mobile');
    const before = headers['User-Agent'];
    try {
      (headers as Record<string, string>)['User-Agent'] = 'autre chose';
    } catch {
      // Mode strict : la tentative lève. Les deux issues sont acceptables,
      // l'essentiel est que l'empreinte n'ait pas bougé.
    }
    expect(readerHeaders('mobile')['User-Agent']).toBe(before);
    expect(headers['User-Agent']).toContain('iPhone');
  });

  it('deux lectures du même profil donnent exactement les mêmes en-têtes', () => {
    expect(readerHeaders('desktop')).toBe(readerHeaders('desktop'));
    expect(readerHeaders('desktop')['User-Agent']).toContain('Windows NT 10.0');
    expect(readerHeaders('desktop')['Sec-Fetch-Dest']).toBe('document');
  });
});

describe('AYWEBs Phase 1 — plan de sondes : une empreinte, puis un repli différé', () => {
  it('Amazon : mobile immédiat, bureau différé — plus jamais en parallèle', () => {
    const plan = readerProbePlan('amazon');
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ id: 'direct_mobile', profile: 'mobile', delayMs: 0 });
    expect(plan[1].id).toBe('direct_desktop');
    expect(plan[1].profile).toBe('desktop');
    expect(plan[1].delayMs).toBe(readerFallbackDelayMs());
    expect(readerFallbackDelayMs()).toBeGreaterThan(0);
  });

  it('boutique rendue côté client : l’ordre s’inverse, la politique reste la même', () => {
    const plan = readerProbePlan('shein');
    expect(plan[0]).toMatchObject({ id: 'direct_desktop', profile: 'desktop', delayMs: 0 });
    expect(plan[1]).toMatchObject({ id: 'direct_mobile', profile: 'mobile' });
    expect(plan[1].delayMs).toBe(readerFallbackDelayMs());
  });

  it('déterministe : deux appels rendent le même plan', () => {
    expect(readerProbePlan('amazon')).toEqual(readerProbePlan('amazon'));
  });

  it('le repli est réglable, et désactivable (0 = aucune seconde requête)', () => {
    process.env.AYROVIX_READER_FALLBACK_MS = '0';
    expect(readerProbePlan('amazon')[1].delayMs).toBe(0);
    process.env.AYROVIX_READER_FALLBACK_MS = '4000';
    expect(readerProbePlan('amazon')[1].delayMs).toBe(4000);
  });
});

describe('AYWEBs Phase 1 — départ du lecteur Jina', () => {
  it('Jina part APRÈS le repli gratuit (jamais à sa place)', () => {
    expect(readerJinaHeadstartMs()).toBe(readerFallbackDelayMs() + 500);
    expect(readerJinaHeadstartMs()).toBeGreaterThan(readerFallbackDelayMs());
  });

  it('surchargeable, et jamais inférieur au repli configuré si on l’impose', () => {
    process.env.AYROVIX_JINA_HEADSTART_MS = '9000';
    expect(readerJinaHeadstartMs()).toBe(9000);
    process.env.AYROVIX_READER_FALLBACK_MS = '0';
    delete process.env.AYROVIX_JINA_HEADSTART_MS;
    expect(readerJinaHeadstartMs()).toBe(500);
  });
});

describe('AYWEBs Phase 1 — rapport de diagnostic (§46 : réel, jamais estimé)', () => {
  it('expose l’empreinte active et sa provenance pour chaque store', () => {
    const report = readerFingerprintReport(['amazon', 'shein']);
    expect(report.fallback_delay_ms).toBe(readerFallbackDelayMs());
    expect(report.jina_headstart_ms).toBe(readerJinaHeadstartMs());
    expect(report.stores).toEqual([
      expect.objectContaining({ store: 'amazon', profile: 'mobile' }),
      expect.objectContaining({ store: 'shein', profile: 'desktop' }),
    ]);
    for (const store of report.stores) expect(store.provenance.length).toBeGreaterThan(20);
  });
});
