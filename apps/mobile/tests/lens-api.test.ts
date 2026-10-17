import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { parseCandidate, parseImageResult, parseLiveStock, parseReview, parseUrlResult } from '../src/api/lens';

const candidate = {
  id: 'c1',
  kind: 'external',
  title: 'Sneaker',
  sourceUrl: 'https://shop.example/p/1',
  image: '/m/1.jpg',
  price: null,
  currency: null,
  priceTnd: null,
  availability: 'bogus',
};

describe('Lens — parsing (contrat du site)', () => {
  it('une disponibilité hors du dictionnaire devient unknown, jamais in_stock', () => {
    expect(parseCandidate(candidate).availability).toBe('unknown');
    expect(parseCandidate({ ...candidate, availability: 'in_stock' }).availability).toBe('in_stock');
  });

  it('prix absent reste null : aucune valeur inventée', () => {
    const parsed = parseCandidate(candidate);
    expect(parsed.price).toBeNull();
    expect(parsed.priceTnd).toBeNull();
  });

  it('lit sans perte le prix barré, la promo et les preuves de source', () => {
    const parsed = parseCandidate({
      ...candidate,
      promo: { percent: 3, label: 'Jour', priceTnd: 97, originalPriceTnd: 100 },
      originalPrice: 30,
      originalPriceTnd: 100,
      priceOrigin: 'merchant',
      rating: 4.7,
      ratingCount: 42,
      ratingKind: 'merchant',
      match: 93,
      sourceRead: { at: '2026-10-14T12:00:00.000Z', variantsAvailable: 2, variantsUnavailable: 1, variantsUnknown: 0 },
    });
    expect(parsed.promo?.originalPriceTnd).toBe(100);
    expect(parsed.originalPriceTnd).toBe(100);
    expect(parsed.priceOrigin).toBe('merchant');
    expect(parsed.ratingKind).toBe('merchant');
    expect(parsed.match).toBe(93);
    expect(parsed.availabilityCheckedAt).toBe('2026-10-14T12:00:00.000Z');
  });

  it('lit uniquement les faits structurés complets et ferme leurs sections', () => {
    const parsed = parseCandidate({
      ...candidate,
      details: [
        { key: 'material', label: 'Matière', value: 'Coton', section: 'material' },
        { key: null, label: 'Motif', value: 'Rayé', section: 'section-inconnue' },
        { key: 'fit', label: '', value: 'Regular', section: 'fit' },
      ],
    });
    expect(parsed.details).toEqual([
      { key: 'material', label: 'Matière', value: 'Coton', section: 'material' },
      { key: null, label: 'Motif', value: 'Rayé', section: 'details' },
    ]);
  });

  it('fiche sans identifiant ou lien → erreur malformed', () => {
    expect(() => parseCandidate({ ...candidate, id: '' })).toThrow(ApiError);
    expect(() => parseCandidate({ ...candidate, sourceUrl: '' })).toThrow(ApiError);
  });

  it('résultat image : identification et exclusions lues telles quelles', () => {
    const result = parseImageResult({
      identification: { input_kind: 'product_photo', category: 'shoes', brand: null, color: ['red'] },
      query: 'red shoes',
      candidates: [candidate],
      eventId: 'evt-1',
      excluded: { count: 2, reasons: { price_unread: 2 } },
    });
    expect(result.identification.category).toBe('shoes');
    expect(result.identification.color).toEqual(['red']);
    expect(result.excluded).toEqual({ count: 2, reasons: { price_unread: 2 } });
    expect(result.eventId).toBe('evt-1');
  });

  it('résultat image sans objet → erreur', () => {
    expect(() => parseImageResult(null)).toThrow(ApiError);
  });

  it('résultat lien : fallback booléen strict', () => {
    const result = parseUrlResult({ product: candidate, alternates: [], eventId: 'e', fallback: 'yes' });
    expect(result.fallback).toBe(false);
  });

  it('résultat lien accepte le contrat produit sans id et crée un identifiant stable', () => {
    const result = parseUrlResult({
      product: { title: 'Fiche', sourceUrl: 'https://shop.example/p/1', image: 'x' },
      alternates: [], eventId: 'e2',
    });
    expect(result.product.id).toBe('url:https://shop.example/p/1');
    expect(result.product.sourceUrl).toBe('https://shop.example/p/1');
  });

  it('stock frais : chaque variante a une disponibilité fermée', () => {
    const [row] = parseLiveStock({
      results: [{ url: 'u', availability: 'limited', variants: [{ value: 'M', availability: 'maybe' }], checkedAt: 't', reason: '' }],
    });
    expect(row.availability).toBe('limited');
    expect(row.variants[0].availability).toBe('unknown');
    expect(row.priceToken).toBeNull();
  });

  it('stock: enveloppe sans results → erreur', () => {
    expect(() => parseLiveStock({})).toThrow(ApiError);
  });

  it('demande de révision: statut inconnu → PENDING', () => {
    const review = parseReview({ id: 'r1', status: 'WHATEVER' });
    expect(review.status).toBe('PENDING');
    expect(review.duplicate).toBe(false);
  });
});

describe('Lens — historique', () => {
  it('ligne valide : type fermé, vérification fermée', async () => {
    const { parseHistory } = await import('../src/api/lens');
    const [item] = parseHistory([{ id: 'h1', kind: 'nouveau', verificationStatus: 'VERIFIED', resultsCount: 3 }]);
    expect(item.kind).toBe('text');
    expect(item.verificationStatus).toBe('VERIFIED');
    expect(item.resultsCount).toBe(3);
    expect(item.price).toBeNull();
  });
  it('ligne sans identifiant ou liste non tableau → erreur', async () => {
    const { parseHistory } = await import('../src/api/lens');
    expect(() => parseHistory([{ kind: 'image' }])).toThrow(ApiError);
    expect(() => parseHistory({})).toThrow(ApiError);
  });
  it('statut inconnu → PENDING_MANUAL (jamais VERIFIED par défaut)', async () => {
    const { parseHistory } = await import('../src/api/lens');
    const [item] = parseHistory([{ id: 'h2', kind: 'url', verificationStatus: 'ok' }]);
    expect(item.verificationStatus).toBe('PENDING_MANUAL');
  });
});

describe('Z Lens — correspondances visuelles (/detect)', () => {
  it('lit les correspondances (nom, image, lien, marchand) et écarte les entrées sans nom ou sans lien', async () => {
    const { parseVisualSearch } = await import('../src/api/lens');
    const parsed = parseVisualSearch({
      // SerpApi ne rend pas de boîtes : seules les pages sont renvoyées.
      matches: [
        { name: 'Sweat à capuche jaune', image: 'https://cdn.test/a.jpg', url: 'https://shop.test/a', source: 'Shop' },
        { name: '', image: 'https://cdn.test/b.jpg', url: 'https://shop.test/b', source: 'Shop' },
        { name: 'Sans lien', image: 'https://cdn.test/c.jpg', url: '', source: 'Shop' },
      ],
      width: 768,
      height: 1050,
    });
    expect(parsed.matches).toEqual([
      { name: 'Sweat à capuche jaune', image: 'https://cdn.test/a.jpg', url: 'https://shop.test/a', source: 'Shop' },
    ]);
    expect(parsed.width).toBe(768);
    expect(parsed.height).toBe(1050);
  });

  it('une correspondance n’est jamais un prix deviné : aucun champ de prix', async () => {
    const { parseVisualSearch } = await import('../src/api/lens');
    const parsed = parseVisualSearch({
      matches: [{ name: 'Article', image: '', url: 'https://shop.test/a', source: 'Shop', price: 12.5 }],
    });
    expect(Object.keys(parsed.matches[0]).sort()).toEqual(['image', 'name', 'source', 'url']);
  });

  it('réponse sans objet → malformed ; réponse vide → aucune correspondance (cadre manuel)', async () => {
    const { parseVisualSearch } = await import('../src/api/lens');
    expect(() => parseVisualSearch(null)).toThrow(ApiError);
    expect(parseVisualSearch({})).toEqual({ matches: [], width: null, height: null });
  });
});
