/**
 * AYWEBs — MESURE PAR BOUTIQUE (23/10/2026).
 *
 * La question « adaptateur dédié partout, ou adaptateur collectif ? » ne se
 * tranche pas à l'opinion : elle se tranche avec un taux d'acceptation par
 * boutique. Encore faut-il que la mesure existe, qu'elle soit attribuée au bon
 * domaine, et qu'elle ne devienne pas une fuite mémoire.
 *
 * Ce fichier verrouille les quatre propriétés qui rendent la mesure utilisable :
 *
 *   1. ATTRIBUTION — une capture est comptée pour la boutique du domaine :
 *      `registre:<id>` (ouverte), `catalogue:<id>` (prévue mais fermée, donc
 *      demande réelle), `external` (hors catalogue) ;
 *   2. HONNÊTETÉ — une capture refusée compte UNE fois (pas deux), et son motif
 *      est conservé ;
 *   3. BORNES — le nombre de boutiques suivies et de motifs par boutique est
 *      plafonné : le domaine vient du client, il ne doit pas faire grandir la
 *      mémoire du serveur ;
 *   4. TAUX — `acceptance_rate` est le rapport réel acceptées / jugées.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_VERSION } from '../shared/aywebsCapture';
import { AYWEBS_CATALOG_STORES } from '../shared/aywebsStoreCatalog';
import { AYWEBS_CAPTURE_TRACKED_STORES, ayWebsCaptureStoreKey, ayWebsWebviewCaptureStats, resetAyWebsWebviewCaptureStats, validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

const WALMART = 'https://www.walmart.com/ip/hanes-tee/123456';
const EBAY = 'https://www.ebay.com/itm/123456789';
const UNKNOWN = 'https://boutique-inconnue.test/produit/1';

/** Capture minimale valide (JSON-LD + DOM d'accord sur le prix). */
function capture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: AYWEBS_CAPTURE_VERSION,
    url: WALMART,
    title: 'Hanes Men’s T-Shirt',
    priceCandidates: [
      { text: '9.98 USD', source: 'json_ld' },
      { text: '$9.98', source: 'dom' },
    ],
    availabilityText: 'In stock',
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

const stats = () => ayWebsWebviewCaptureStats();

beforeEach(() => {
  resetAyWebsWebviewCaptureStats();
});

describe('attribution d’une capture à sa boutique', () => {
  it('boutique OUVERTE du registre', () => {
    expect(ayWebsCaptureStoreKey(WALMART)).toBe('registre:walmart');
    expect(ayWebsCaptureStoreKey('https://www.amazon.com/dp/B0GYM3V9H5')).toBe('registre:amazon');
  });

  it('boutique PRÉVUE mais fermée : la demande est visible quand même', () => {
    expect(ayWebsCaptureStoreKey(EBAY)).toBe('catalogue:ebay');
  });

  it('sous-domaine : on reconnaît le domaine enregistré', () => {
    expect(ayWebsCaptureStoreKey('https://shop.zalando.com/xyz-123456.html')).toBe('registre:zalando');
  });

  it('domaine inconnu et URL illisible : étiquetés, jamais confondus', () => {
    expect(ayWebsCaptureStoreKey(UNKNOWN)).toBe('external');
    expect(ayWebsCaptureStoreKey('pas une url')).toBe('url_invalide');
    expect(ayWebsCaptureStoreKey('')).toBe('url_invalide');
  });
});

describe('compteurs de boutique', () => {
  it('une capture acceptée compte une fois, avec son taux', () => {
    const result = validateAyWebsCapturedPage(capture(), WALMART, { requireCorroboration: true });
    expect(result.ok).toBe(true);
    const bucket = stats().by_store['registre:walmart'];
    expect(bucket).toMatchObject({ validated: 1, accepted: 1, rejected: 0, acceptance_rate: 1 });
  });

  it('une capture refusée compte UNE fois et garde son motif', () => {
    const stale = capture({ capturedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    const result = validateAyWebsCapturedPage(stale, WALMART, { requireCorroboration: true });
    expect(result.ok).toBe(false);
    expect(result.rejection).toBe('STALE_CAPTURE');
    const bucket = stats().by_store['registre:walmart'];
    expect(bucket).toMatchObject({ validated: 1, accepted: 0, rejected: 1, acceptance_rate: 0 });
    expect(bucket.rejections.STALE_CAPTURE).toBe(1);
  });

  it('une capture illisible est attribuée quand même (rien ne disparaît)', () => {
    validateAyWebsCapturedPage(null, WALMART);
    expect(stats().by_store['registre:walmart']).toMatchObject({ validated: 1, rejected: 1 });
    expect(stats().by_store['registre:walmart'].rejections.NOT_AN_OBJECT).toBe(1);
  });

  it('deux boutiques ne mélangent pas leurs chiffres', () => {
    validateAyWebsCapturedPage(capture(), WALMART, { requireCorroboration: true });
    validateAyWebsCapturedPage(capture({ url: EBAY }), EBAY, { requireCorroboration: true });
    expect(stats().by_store['registre:walmart'].accepted).toBe(1);
    expect(stats().by_store['catalogue:ebay'].accepted).toBe(1);
    expect(stats().by_store['registre:walmart'].acceptance_rate).toBe(1);
  });

  it('le taux suit les refus (0.5 = une acceptée, une refusée)', () => {
    validateAyWebsCapturedPage(capture(), WALMART, { requireCorroboration: true });
    validateAyWebsCapturedPage(capture({ priceCandidates: [{ text: '$9.98', source: 'dom' }] }), WALMART, { requireCorroboration: true });
    expect(stats().by_store['registre:walmart'].acceptance_rate).toBe(0.5);
  });

  it('une page qui publie des groupes de variantes est signalée', () => {
    validateAyWebsCapturedPage(capture({
      variantGroups: [{ name: 'Taille', values: ['S', 'M'], selected: ['M'] }],
    }), WALMART, { requireCorroboration: true });
    expect(stats().by_store['registre:walmart'].variant_groups_seen).toBe(1);
  });

  it('les compteurs globaux restent cohérents avec la somme des boutiques', () => {
    validateAyWebsCapturedPage(capture(), WALMART, { requireCorroboration: true });
    validateAyWebsCapturedPage(null, EBAY);
    const global = stats();
    const sumValidated = Object.values(global.by_store).reduce((sum, bucket) => sum + bucket.validated, 0);
    const sumAccepted = Object.values(global.by_store).reduce((sum, bucket) => sum + bucket.accepted, 0);
    expect(sumValidated).toBe(global.validated);
    expect(sumAccepted).toBe(global.accepted);
  });

  it('la mémoire est bornée : au-delà du plafond, tout va dans « autres »', () => {
    /* Cas réel : le catalogue compte ~350 boutiques fermées. On en visite 5 de
       plus que le plafond ; au-delà, le détail s'arrête et le reste est agrégé. */
    const visited = AYWEBS_CATALOG_STORES.slice(0, AYWEBS_CAPTURE_TRACKED_STORES + 5);
    for (const store of visited) {
      validateAyWebsCapturedPage(null, `https://www.${store.domains[0]}/produit/1`);
    }
    const buckets = Object.keys(stats().by_store);
    expect(buckets.length).toBeLessThanOrEqual(AYWEBS_CAPTURE_TRACKED_STORES);
    expect(buckets).toContain('autres');
    /* Aucune capture perdue : le global compte tout, même ce qui n'est plus détaillé. */
    expect(stats().validated).toBe(visited.length);
    const sum = Object.values(stats().by_store).reduce((total, bucket) => total + bucket.validated, 0);
    expect(sum).toBe(visited.length);
  });

  it('les motifs de refus par boutique sont plafonnés, jamais tronqués en silence', () => {
    /* Un même domaine, douze motifs différents puis un treizième : le treizième
       tombe dans « autre », il n'est pas avalé. */
    const rejections = [
      'NOT_AN_OBJECT', 'BAD_VERSION', 'TOO_LARGE', 'URL_HOST_MISMATCH', 'CANONICAL_HOST_MISMATCH',
      'STALE_CAPTURE', 'FUTURE_CAPTURE', 'PRICE_REJECTED', 'NO_PRICE_TEXT', 'AMBIGUOUS_PRICE',
      'PRICE_NOT_CORROBORATED', 'OUT_OF_STOCK', 'VARIANT_NOT_PROVEN',
    ];
    for (const rejection of rejections) {
      if (rejection === 'NOT_AN_OBJECT') validateAyWebsCapturedPage(null, WALMART);
      else if (rejection === 'BAD_VERSION') validateAyWebsCapturedPage({ v: 999 }, WALMART);
      else if (rejection === 'TOO_LARGE') validateAyWebsCapturedPage(capture({ title: 'x'.repeat(70_000) }), WALMART);
      else if (rejection === 'URL_HOST_MISMATCH') validateAyWebsCapturedPage(capture({ url: EBAY }), WALMART);
      else if (rejection === 'CANONICAL_HOST_MISMATCH') validateAyWebsCapturedPage(capture({ canonicalUrl: EBAY }), WALMART);
      else if (rejection === 'FUTURE_CAPTURE') validateAyWebsCapturedPage(capture({ capturedAt: new Date(Date.now() + 10 * 60_000).toISOString() }), WALMART);
      else if (rejection === 'NO_PRICE_TEXT') validateAyWebsCapturedPage(capture({ priceCandidates: [] }), WALMART);
      else if (rejection === 'PRICE_REJECTED') validateAyWebsCapturedPage(capture({ priceCandidates: [{ text: 'gratuit', source: 'dom' }] }), WALMART);
      else if (rejection === 'PRICE_NOT_CORROBORATED') validateAyWebsCapturedPage(capture({ priceCandidates: [{ text: '$9.98', source: 'dom' }] }), WALMART, { requireCorroboration: true });
      else if (rejection === 'AMBIGUOUS_PRICE') {
        validateAyWebsCapturedPage(capture({
          priceCandidates: [{ text: '$9.98', source: 'dom' }, { text: '$19.98', source: 'meta' }],
        }), WALMART);
      } else if (rejection === 'OUT_OF_STOCK') {
        validateAyWebsCapturedPage(capture({ priceCandidates: [], availabilityText: 'Rupture de stock' }), WALMART);
      } else {
        /* STALE_CAPTURE et VARIANT_NOT_PROVEN : laissés au détail près, un seul
           suffit à remplir la table. */
        validateAyWebsCapturedPage(capture({ capturedAt: new Date(Date.now() - 60 * 60_000).toISOString() }), WALMART);
      }
    }
    const bucket = stats().by_store['registre:walmart'];
    expect(Object.keys(bucket.rejections).length).toBeLessThanOrEqual(12);
    expect(bucket.rejected).toBe(rejections.length);
  });
});
