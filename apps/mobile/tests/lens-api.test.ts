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
