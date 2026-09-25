/*
 * MOTEUR DE VARIANTES & DISPONIBILITÉ (phase 3, 25/09/2026).
 *
 * Ces tests sont le CONTRAT exécutable du prototype validé :
 *  — la nature d'un attribut se déduit de SES VALEURS, jamais du nom que le
 *    marchand a choisi (« Size » = 50 ml reste un volume) ;
 *  — un attribut incompatible avec la catégorie est écarté, avec la raison ;
 *  — la disponibilité a TROIS états et « inconnu » n'est jamais promu en
 *    « disponible », ni par la fiche, ni par le cache, ni par la porte de commande ;
 *  — aucune variante n'est inventée : chacune garde son chemin JSON d'origine.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildProductCard,
  decideOrder,
  kindOfValue,
  normalizeLabel,
} from '../src/ayrovix/services/productVariants';

import {
  guardVariantOrder,
  prepareVariantCard,
  readLookupPayload,
  recordVariantContract,
  resolveVariants,
} from '../src/ayrovix/services/variantAvailability';

// Cache et contrats sont écrits dans un dossier jetable : la configuration est
// relue à chaque appel, aucun état de test ne fuit vers data/.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-variants-'));
process.env.AYROVI_VARIANT_CACHE_DIR = workDir;
process.env.AYROVI_VARIANT_MAX_LOOKUPS = '8';

afterAll(() => { fs.rmSync(workDir, { recursive: true, force: true }); });

/* ── Charges utiles minimales, calquées sur les formes réelles de SerpApi ──── */

const sneaker = {
  product_results: {
    product_id: 'sneak-1',
    title: 'Nike Air Zoom Pegasus 40 Running Shoes',
    prices: ['$129.00'],
    sizes: {
      '40': { link: 'https://x/40', product_id: 'sneak-40', serpapi_link: 'https://serpapi.com/40' },
      '41': { link: 'https://x/41', product_id: 'sneak-41', serpapi_link: 'https://serpapi.com/41' },
    },
  },
};

const perfumeTrap = {
  product_results: {
    title: 'Dior Sauvage Eau de Parfum',
    prices: ['$95.00'],
    variations: {
      // Le marchand a nommé son groupe « Size » : c'est un volume, pas une pointure.
      Size: [
        { name: '50 ml', product_id: 'p50', available: true },
        { name: '100 ml', product_id: 'p100', available: false },
      ],
      // Et une vraie pointure n'a rien à faire sur un parfum.
      Pointure: [{ name: '39', product_id: 'x39', available: true }],
    },
  },
};

describe('nature des valeurs', () => {
  it('déduit la nature de la valeur, pas du nom du groupe', () => {
    expect(kindOfValue('50 ml').kind).toBe('volume');
    expect(kindOfValue('256 GB').kind).toBe('storage');
    // Un nombre nu reste « taille numérique » : c'est la catégorie du produit
    // qui tranche ensuite entre pointure et taille de vêtement — jamais l'inverse.
    expect(kindOfValue('42').kind).toBe('numeric_size');
    expect(kindOfValue('XL').kind).toBe('clothing_size');
  });

  it('normalise sans détruire la valeur affichée', () => {
    expect(normalizeLabel('  100   ML ')).toBe('100 ML');
  });
});

describe('compréhension de la fiche', () => {
  it('nomme l’attribut par sa nature et garde le chemin JSON de chaque variante', () => {
    const { card } = buildProductCard(sneaker);
    const primary = card.attributes.find((attribute) => attribute.role === 'primary');
    expect(primary?.label).toBe('Pointure');
    expect(primary?.kind).toBe('shoe_size');
    expect(primary?.variants.map((variant) => variant.value)).toEqual(['40', '41']);
    for (const variant of primary!.variants) {
      expect(variant.sourcePath).toContain('product_results.sizes');
    }
  });

  it('écarte un attribut incompatible avec la catégorie, en donnant la raison', () => {
    const { card } = buildProductCard(perfumeTrap);
    expect(card.category).toBe('fragrance');
    const labels = card.attributes.map((attribute) => attribute.label);
    expect(labels).toContain('Volume');
    expect(labels).not.toContain('Pointure');
    expect(card.rejected.some((group) => group.sourceLabel === 'Pointure')).toBe(true);
    expect(card.rejected[0]?.reason).toBeTruthy();
  });

  it('n’invente aucune variante quand la source n’en publie pas', () => {
    const { card } = buildProductCard({ product_results: { title: 'Bougie parfumée', prices: ['$19.00'] } });
    expect(card.attributes).toHaveLength(0);
  });
});

describe('disponibilité à trois états', () => {
  it('laisse « inconnu » quand la source ne dit rien (product_results.sizes)', () => {
    const { card } = buildProductCard(sneaker);
    const states = card.attributes[0].variants.map((variant) => variant.availability);
    expect(states).toEqual(['unknown', 'unknown']);
    expect(card.availability).not.toBe('available');
  });

  it('lit un drapeau explicite quand il existe', () => {
    const { card } = buildProductCard(perfumeTrap);
    const volume = card.attributes.find((attribute) => attribute.label === 'Volume')!;
    expect(volume.variants.map((variant) => variant.availability)).toEqual(['available', 'unavailable']);
  });

  it('refuse de commander une variante non disponible', () => {
    const { card } = buildProductCard(perfumeTrap);
    expect(decideOrder(card, { Volume: '50 ml' }).allowed).toBe(true);
    expect(decideOrder(card, { Volume: '100 ml' }).allowed).toBe(false);
    expect(decideOrder(card, {}).allowed).toBe(false);
  });
});

describe('résolution du stock par appel dédié (option 1)', () => {
  it('lit une réponse marchande : offre réelle = disponible', () => {
    const verdict = readLookupPayload({ product_results: { title: 'x' }, sellers_results: { online_sellers: [{ name: 'Nike', base_price: '$129.00' }] } });
    expect(verdict.availability).toBe('available');
  });

  it('lit une rupture annoncée, dans n’importe quelle langue', () => {
    for (const text of ['Out of stock', 'Rupture de stock', 'غير متوفر']) {
      const verdict = readLookupPayload({ product_results: { title: 'x' }, sellers_results: { online_sellers: [{ name: 'S', base_price: '$1', badge: text }] } });
      expect(verdict.availability, text).toBe('unavailable');
    }
  });

  it('reste « inconnu » si la réponse est vide ou en erreur — jamais « disponible »', () => {
    expect(readLookupPayload({ error: 'Invalid API key' }).availability).toBe('unknown');
    expect(readLookupPayload({}).availability).toBe('unknown');
  });

  it('n’appelle que les variantes inconnues ET identifiables, puis met en cache', async () => {
    const calls: string[] = [];
    const fetcher = async (productId: string) => {
      calls.push(productId);
      return { product_results: { title: 't' }, sellers_results: { online_sellers: [{ name: 'S', base_price: '$10' }] } };
    };
    const input = [
      { value: '40', productId: 'res-40', known: 'unknown' as const, knownReason: '' },
      { value: '41', productId: 'res-41', known: 'available' as const, knownReason: 'drapeau source' },
      { value: '42', known: 'unknown' as const, knownReason: '' }, // non identifiable
    ];
    const first = await resolveVariants(input, fetcher);
    expect(calls).toEqual(['res-40']);
    expect(first[0]).toMatchObject({ availability: 'available', origin: 'lookup' });
    expect(first[1].origin).toBe('source');
    expect(first[2]).toMatchObject({ availability: 'unknown' });

    const second = await resolveVariants(input, fetcher);
    expect(calls).toEqual(['res-40']);          // le cache a évité le second appel
    expect(second[0].origin).toBe('cache');
  });

  it('un appel qui échoue laisse « inconnu », il ne suppose rien', async () => {
    const failing = async () => { throw new Error('ECONNRESET'); };
    const [resolved] = await resolveVariants([{ value: 'XS', productId: 'boom-1', known: 'unknown', knownReason: '' }], failing);
    expect(resolved.availability).toBe('unknown');
    expect(resolved.origin).toBe('error');
  });
});

describe('porte de commande côté serveur', () => {
  beforeEach(() => {
    recordVariantContract('https://shop.test/sneaker', {
      attribute: 'Pointure',
      variants: [
        { value: '40', availability: 'available', reason: 'offre constatée' },
        { value: '41', availability: 'unavailable', reason: 'rupture' },
        { value: '42', availability: 'unknown', reason: 'stock non confirmé' },
      ],
    });
  });

  it('autorise la variante réellement disponible', () => {
    expect(guardVariantOrder('https://shop.test/sneaker', '40')).toMatchObject({ allowed: true, code: 'ALLOWED' });
  });

  it('refuse la rupture, l’inconnu et l’inexistant', () => {
    expect(guardVariantOrder('https://shop.test/sneaker', '41').code).toBe('VARIANT_UNAVAILABLE');
    expect(guardVariantOrder('https://shop.test/sneaker', '42').code).toBe('VARIANT_AVAILABILITY_UNKNOWN');
    expect(guardVariantOrder('https://shop.test/sneaker', '47').code).toBe('VARIANT_NOT_FOUND');
    expect(guardVariantOrder('https://shop.test/sneaker', '41').allowed).toBe(false);
  });

  it('ne casse pas le parcours historique : sans contrat, la commande passe', () => {
    expect(guardVariantOrder('https://autre.test/produit-manuel', 'M').allowed).toBe(true);
    expect(guardVariantOrder('https://autre.test/produit-manuel', 'M').code).toBe('NO_CONTRACT');
  });
});

describe('chaîne complète : JSON → fiche → stock résolu → contrat', () => {
  it('résout les pointures sans disponibilité puis verrouille la commande', async () => {
    const key = 'https://shop.test/pipeline';
    const { card } = await prepareVariantCard(sneaker, key, async (productId: string) => (
      productId === 'sneak-40'
        ? { product_results: { title: 't' }, sellers_results: { online_sellers: [{ name: 'S', base_price: '$129' }] } }
        : { product_results: { title: 't' }, sellers_results: { online_sellers: [] } }
    ));
    const states = Object.fromEntries(card.attributes[0].variants.map((variant) => [variant.value, variant.availability]));
    expect(states).toEqual({ '40': 'available', '41': 'unavailable' });
    expect(card.availability).toBe('available');
    expect(guardVariantOrder(key, '40').allowed).toBe(true);
    expect(guardVariantOrder(key, '41').allowed).toBe(false);
  });
});
