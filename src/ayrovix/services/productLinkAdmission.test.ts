import { describe, expect, it } from 'vitest';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { AyrovixCandidate } from '../types';
import {
  admitLensProductCandidates,
  classifyLensProductLink,
  normalizeLensProductLink,
} from './productLinkAdmission';

const scraper = { cleanPastedUrl: (value: string) => value } as SmartLinkScraper;
const AMAZON = 'https://www.amazon.com/dp/B0ABC12345';

function candidate(overrides: Partial<AyrovixCandidate> = {}): AyrovixCandidate {
  return {
    id: 'candidate-1',
    kind: 'external',
    title: 'Nike Air Max 270',
    brand: 'Nike',
    model: null,
    colors: [],
    sizes: [],
    source: 'Amazon',
    sourceUrl: AMAZON,
    image: 'https://images.example.com/nike.jpg',
    images: ['https://images.example.com/nike.jpg'],
    price: 129.99,
    currency: 'EUR',
    priceTnd: null,
    availability: 'in_stock',
    match: 90,
    ...overrides,
  };
}

function typeOf(url: string, overrides: Partial<AyrovixCandidate> = {}) {
  return classifyLensProductLink(candidate({ sourceUrl: url, ...overrides }), scraper);
}

describe('normalisation du lien produit Lens', () => {
  it('retire seulement le tracking clair et conserve les paramètres produit/variante', () => {
    const result = normalizeLensProductLink(`${AMAZON}?th=1&psc=1&utm_source=google&fbclid=abc#reviews`);
    expect(result?.url).toBe(`${AMAZON}?th=1&psc=1`);
  });

  it('ne déduit jamais une destination depuis une entrée dangereuse', () => {
    expect(normalizeLensProductLink('http://www.amazon.com/dp/B0ABC12345')).toBeNull();
    expect(normalizeLensProductLink('https://localhost/dp/B0ABC12345')).toBeNull();
    expect(normalizeLensProductLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLensProductLink('https://user:pass@www.amazon.com/dp/B0ABC12345')).toBeNull();
  });

  it('refuse une URL trop longue pour la capture au lieu de tronquer sa variante', () => {
    expect(normalizeLensProductLink(`${AMAZON}?th=1&variant=${'x'.repeat(700)}`)).toBeNull();
  });
});

describe('classification Lens — seuls les liens PRODUCT suffisamment corroborés passent', () => {
  it.each([
    ['Amazon', `${AMAZON}?th=1`],
    ['SHEIN', 'https://www.shein.com/example-p-123456.html?goods_id=123456'],
    ['TEMU', 'https://www.temu.com/goods.html?goods_id=123456789&sku_id=98765'],
    ['AliExpress', 'https://www.aliexpress.com/item/123456789.html?productId=123456789'],
    ['Walmart', 'https://www.walmart.com/ip/example-product/123456789'],
    ['Etsy', 'https://www.etsy.com/listing/123456789/example-product'],
    ['Zalando', 'https://www.zalando.fr/baskets-homme-AB1234.html'],
  ])('%s : fiche reconnue + données SerpApi = PRODUCT', (_store, url) => {
    const decision = typeOf(url);
    expect(decision.pageType).toBe('PRODUCT');
    expect(decision.accepted).toBe(true);
    expect(decision.verification).toBe('VERIFIED');
  });

  it('une URL de produit seule, sans donnée produit SerpApi, reste UNKNOWN', () => {
    const decision = typeOf(AMAZON, { image: '', images: [], price: null, currency: null });
    expect(decision.pageType).toBe('UNKNOWN');
    expect(decision.reason).toBe('INSUFFICIENT_PROVIDER_PRODUCT_EVIDENCE');
    expect(decision.accepted).toBe(false);
  });

  it('une vignette privée ou non HTTPS ne compte pas comme preuve produit', () => {
    const decision = typeOf(AMAZON, {
      image: 'https://127.0.0.1/private.jpg', images: ['http://cdn.example.com/insecure.jpg'], price: null, currency: null,
    });
    expect(decision.pageType).toBe('UNKNOWN');
    expect(decision.reason).toBe('INSUFFICIENT_PROVIDER_PRODUCT_EVIDENCE');
    expect(decision.accepted).toBe(false);
  });

  it('le mot product dans une URL inconnue ne fabrique pas une fiche', () => {
    const decision = typeOf('https://unregistered-shop.com/product/123');
    expect(decision.pageType).toBe('UNKNOWN');
    expect(decision.accepted).toBe(false);
  });

  it('une boutique capture-only sans motif déclaré reste UNKNOWN', () => {
    const decision = typeOf('https://www.cdiscount.com/product/123');
    expect(decision.pageType).toBe('UNKNOWN');
    expect(decision.accepted).toBe(false);
  });

  it.each([
    ['SEARCH', 'https://www.amazon.com/s?k=nike+air+max'],
    ['STORE_HOME', 'https://www.amazon.com/'],
    ['STORE_HOME', 'https://www.zalando.fr/fr/'],
    ['CATEGORY', 'https://www.zalando.fr/collections/homme/'],
    ['ARTICLE', 'https://www.zalando.fr/blog/comment-choisir-ses-baskets'],
  ])('%s est explicitement rejeté même avec image et prix', (pageType, url) => {
    const decision = typeOf(url);
    expect(decision.pageType).toBe(pageType);
    expect(decision.accepted).toBe(false);
  });

  it.each([
    ['SOCIAL_POST', 'https://www.instagram.com/p/ABC123/'],
    ['SOCIAL_PROFILE', 'https://www.instagram.com/a.shop/'],
    ['SOCIAL_POST', 'https://www.tiktok.com/@shop/video/123456789'],
    ['SOCIAL_POST', 'https://www.facebook.com/marketplace/item/123456789'],
    ['SOCIAL_PROFILE', 'https://www.facebook.com/a.shop'],
  ])('%s ne devient jamais une carte produit', (pageType, url) => {
    const decision = typeOf(url);
    expect(decision.pageType).toBe(pageType);
    expect(decision.accepted).toBe(false);
  });

  it('un shortlink non résolu reste UNKNOWN au lieu de deviner sa cible', () => {
    const decision = typeOf('https://bit.ly/abc123');
    expect(decision.pageType).toBe('UNKNOWN');
    expect(decision.reason).toBe('UNVERIFIED_REDIRECT');
    expect(decision.accepted).toBe(false);
  });
});

describe('admission et déduplication Lens', () => {
  it('dédoublonne la même URL trackée sans toucher aux paramètres de produit', () => {
    const first = candidate({ sourceUrl: `${AMAZON}?th=1&utm_source=one`, match: 80 });
    const duplicate = candidate({ id: 'duplicate', sourceUrl: `${AMAZON}?utm_medium=x&th=1`, match: 95 });
    const otherVariant = candidate({ id: 'other-variant', sourceUrl: `${AMAZON}?th=2`, match: 85 });
    const result = admitLensProductCandidates([first, duplicate, otherVariant], scraper);

    expect(result.candidates.map((item) => item.id)).toEqual(['duplicate', 'other-variant']);
    expect(result.candidates[0].sourceUrl).toBe(`${AMAZON}?th=1`);
    expect(result.candidates[1].sourceUrl).toBe(`${AMAZON}?th=2`);
    expect(result.excluded.reasons.DUPLICATE_PRODUCT_URL).toBe(1);
  });

  it('ne fusionne pas deux produits distincts seulement parce que leurs titres sont identiques', () => {
    const result = admitLensProductCandidates([
      candidate({ id: 'a', sourceUrl: 'https://www.amazon.com/dp/B0ABC12345' }),
      candidate({ id: 'b', sourceUrl: 'https://www.amazon.com/dp/B0ABC12346' }),
    ], scraper);
    expect(result.candidates.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('un résultat refusé ne bloque pas les autres et le stock snippet reste unknown', () => {
    const result = admitLensProductCandidates([
      candidate({ id: 'social', sourceUrl: 'https://www.instagram.com/p/ABC123/' }),
      candidate({ id: 'valid', availability: 'in_stock' }),
    ], scraper);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: 'valid',
      productPageType: 'PRODUCT',
      productLinkStatus: 'VERIFIED',
      availability: 'unknown',
      sourceRead: null,
      priceOrigin: 'search',
      priceVerificationStatus: 'PENDING_MANUAL',
    });
    expect(result.excluded.count).toBe(1);
  });

  it('ne conserve que des vignettes HTTPS publiques, sans fabriquer de remplacement', () => {
    const result = admitLensProductCandidates([
      candidate({
        image: 'http://cdn.example.com/insecure.jpg',
        images: ['http://cdn.example.com/insecure.jpg', 'https://127.0.0.1/private.jpg', 'https://cdn.example.com/safe.jpg'],
      }),
    ], scraper);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].image).toBe('https://cdn.example.com/safe.jpg');
    expect(result.candidates[0].images).toEqual(['https://cdn.example.com/safe.jpg']);
    expect(result.candidates[0].discoveryDataStatus).toBe('TITLE_IMAGE_PRICE');
  });
});
