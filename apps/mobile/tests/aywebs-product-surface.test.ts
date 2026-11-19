import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { AyWebsPageAnalysis } from '@/api/aywebs';
import { canShowProductCapture, parseProductSurfaceMessage, productSurfaceProbe } from '@/features/aywebs/productSurface';

const url = 'https://shop.example/products/single';
const analyze = (over: Partial<AyWebsPageAnalysis> = {}) => ({ url, captureAllowed: true, ...over }) as AyWebsPageAnalysis;
const visible = (textContent = '') => ({ textContent, closest: () => null, getClientRects: () => [1] });

function runProbe({ location = url, data = {}, name = 'Un parfum', ali = false, modal = false } = {}) {
  const messages: string[] = [];
  const heading = visible(name);
  const markup = { textContent: JSON.stringify(data) };
  const sku = visible();
  let open = modal;
  let changed = () => {};
  let pending = () => {};
  const dialog = {
    ...visible(),
    getClientRects: () => open ? [1] : [],
    querySelector: () => sku,
    querySelectorAll: () => [visible('Ajouter au panier')],
  };
  runInNewContext(productSurfaceProbe(7, ali), {
    URL, location: new URL(location), getComputedStyle: () => ({ visibility: 'visible' }),
    clearTimeout: () => {}, setTimeout: (fn: () => void) => { pending = fn; },
    MutationObserver: class { constructor(fn: () => void) { this.notify = fn; } notify: () => void; observe() { const notify = this.notify; changed = () => { notify(); pending(); }; } disconnect() {} },
    window: { ReactNativeWebView: { postMessage: (event: string) => messages.push(event) } },
    document: { documentElement: {}, querySelector: () => heading, querySelectorAll: () => ali ? [dialog] : [markup] },
  });
  return { messages: () => messages.map(parseProductSurfaceMessage), setOpen: (next: boolean) => { open = next; changed(); } };
}

const product = { '@type': 'Product', name: 'Un parfum', url, offers: { '@type': 'Offer' } };

describe('AYWEBs — capture footer requires current product evidence', () => {
  it('requires server permission and rejects storefronts, even with an on-demand hint', () => {
    expect(canShowProductCapture(null, true)).toBe(false);
    expect(canShowProductCapture(analyze({ isProductPage: true, captureInjection: 'product_page' }), false)).toBe(true);
    expect(canShowProductCapture(analyze({ isProductPage: true, captureAllowed: false }), true)).toBe(false);
    expect(canShowProductCapture(analyze({ isProductPage: false, captureInjection: 'never' }), true)).toBe(false);
    expect(canShowProductCapture(analyze({ captureInjection: 'on_demand' }), false)).toBe(false);
    expect(canShowProductCapture(analyze({ captureInjection: 'on_demand' }), true)).toBe(true);
  });

  it('accepts a matching page Product, not a card in a list, an unrelated URL or title, or the homepage', () => {
    expect(runProbe({ data: { '@graph': [product] } }).messages()).toEqual([{ nonce: 7, url, product: true }]);
    for (const options of [
      { data: { '@type': 'ItemList', itemListElement: [product] } },
      { data: product, name: 'Résultats de recherche' },
      { data: { ...product, url: `${url}?id=other` } },
      { location: 'https://shop.example/', data: { ...product, url: 'https://shop.example/' } },
    ]) expect(runProbe(options).messages()[0]?.product).toBe(false);
  });

  it('reports a visible SKU dialog and removes the hint when the product dialog closes', () => {
    const probe = runProbe({ ali: true, modal: true });
    expect(probe.messages()[0]?.product).toBe(true);
    probe.setOpen(false);
    expect(probe.messages()[1]?.product).toBe(false);
  });

});
