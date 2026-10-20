import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { ZalandoAdapter } from '../src/aywebs/adapters/zalando';
import { AYWEBS_STORES, detectAyWebsStore, validateAyWebsStoreRegistry } from '../shared/aywebsStores';
import { AYWEBS_CATALOG_STORES } from '../shared/aywebsStoreCatalog';
import { detectMerchantStore } from '../src/scraper/merchantDomains';
import { SmartLinkScraper } from '../src/scraper/scraper';
import { createAyWebsAdapterById, ayWebsAdapterDescriptor } from '../src/aywebs/adapters/registry';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const path = '/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html';
const url = `https://www.zalando.fr${path}`;
const html = `<!doctype html><html><head><title>Nike Club Tee</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Nike Club Tee","sku":"NI121D0A2-Q11","offers":{"@type":"Offer","price":"89.99","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
</head><body><h1>Nike Club Tee</h1><span data-testid="pdp-price">89,99 €</span><button>Add to cart</button></body></html>`;

describe('Zalando integration ported from fc3cce38', () => {
  it.each(['fr', 'de'])('registers the .%s domain and classifies product/search pages', (country) => {
    const target = `https://www.zalando.${country}${path}`;
    const adapter = createAyWebsAdapterById('zalando', {} as SmartLinkScraper);
    expect(detectAyWebsStore(target)?.adapter).toBe('zalando');
    expect(detectMerchantStore(target)).toBe('zalando');
    expect(adapter.canHandle(target)).toBe(true);
    expect(adapter.classifyPage(target).pageType).toBe('PRODUCT');
    expect(adapter.classifyPage(`https://www.zalando.${country}/catalog/?q=shirt`).pageType).toBe('SEARCH');
  });

  it('promotes the catalog entry without duplicating store IDs', () => {
    expect(AYWEBS_STORES.filter((s) => s.id === 'zalando')).toHaveLength(1);
    expect(AYWEBS_CATALOG_STORES.some((s) => s.id === 'zalando')).toBe(false);
    expect(validateAyWebsStoreRegistry()).toEqual([]);
    expect(detectAyWebsStore(url)?.logo).toBe('/stores/zalando.png');
  });

  it.each(['https://www.zalando.fr.evil.example' + path, 'https://evilzalando.fr' + path, 'https://www.zalando.com' + path])('rejects unsupported or lookalike host %s', (target) => {
    const adapter = createAyWebsAdapterById('zalando', {} as SmartLinkScraper);
    expect(adapter.canHandle(target)).toBe(false);
    expect(detectAyWebsStore(target)).toBeNull();
    expect(detectMerchantStore(target)).toBe('generic');
  });

  it('captures real page evidence through WebView and validates EUR', () => {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    try {
      const payload = JSON.parse(String(dom.window.eval(AYWEBS_CAPTURE_SCRIPT)));
      const validated = validateAyWebsCapturedPage(payload, url);
      expect(validated.ok).toBe(true);
      expect(validated.price).toBe(89.99);
      expect(validated.currency).toBe('EUR');
      expect(validated.scraped?.store).toBe('zalando.fr');
      expect(validated.scraped?.externalId).toBe('ZALANDO-NI121D0A2-Q11');
    } finally { dom.window.close(); }
  });

  it('reads native Zalando DOM price, stock and selected options without JSON-LD', () => {
    const page = `<!doctype html><html><head><title>Nike Club Tee</title></head><body>
      <h1>Nike Club Tee</h1><span data-testid="pdp-price">89,99 €</span>
      <div class="availability-message">In stock</div>
      <fieldset><legend>Size</legend><select name="size"><option value="S" selected>S</option><option value="M" disabled>M</option></select></fieldset>
      <fieldset><legend>Color</legend><button type="button" aria-pressed="true" data-value="Navy">Navy</button><button type="button" aria-pressed="false" data-value="Blue">Blue</button></fieldset>
      </body></html>`;
    const dom = new JSDOM(page, { url, runScripts: 'outside-only' });
    try {
      const payload = JSON.parse(String(dom.window.eval(AYWEBS_CAPTURE_SCRIPT)));
      const result = validateAyWebsCapturedPage(payload, url);
      expect(result.ok).toBe(true);
      expect(result.price).toBe(89.99);
      expect(result.currency).toBe('EUR');
      expect(result.availability).toBe('AVAILABLE');
      expect(result.selectedVariantAttributes).toMatchObject({ size: 'S', color: 'Navy' });
      expect(result.variantGroups.find((g) => g.attribute === 'size')?.values).toContain('M');
    } finally { dom.window.close(); }
  });

  it('uses the server page parser for published price evidence', () => {
    const result = parseProductPageHtml(html, url, 'zalando');
    expect(result.price).toBe(89.99);
    expect(result.currency).toBe('EUR');
  });

  it('falls back only for identity, never for a price, and checks URL before scraping', async () => {
    const scrapeProduct = vi.fn().mockResolvedValue({ store: 'zalando', externalId: 'UNRESOLVED-test', sourcePrice: 0 });
    const adapter = createAyWebsAdapterById('zalando', { scrapeProduct, cleanPastedUrl: (v: string) => v } as unknown as SmartLinkScraper);
    const product = await adapter.capture(url);
    expect(product.externalId).toBe('ZALANDO-NI121D0A2-Q11');
    expect(product.sourcePrice).toBe(0);
    await expect(adapter.capture('https://www.zalando.fr/catalog/?q=shirt')).rejects.toMatchObject({ code: 'PRODUCT_PAGE_REQUIRED' });
    await expect(adapter.capture('https://www.zalando.fr.evil.example' + path)).rejects.toMatchObject({ code: 'STORE_MISMATCH' });
    expect(scrapeProduct).toHaveBeenCalledTimes(1);
  });

  it('keeps purchase under human review, not an automatic checkout', async () => {
    const adapter = new ZalandoAdapter({} as SmartLinkScraper);
    expect(ayWebsAdapterDescriptor('zalando')?.implemented).toBe(true);
    expect(adapter.purchaseMode).toBe('MANUAL_REVIEW');
    expect(await adapter.preparePurchase()).toMatchObject({ status: 'PENDING_INTEGRATION', requiredAction: 'MANUAL_REVIEW' });
  });
});
