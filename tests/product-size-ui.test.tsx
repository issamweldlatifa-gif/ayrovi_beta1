/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { ProductResult, type AyrovixOrderSelection } from '../client/src/ayrovix/components/ProductResult';
import { normalizeSerpApiMatch, priceCommerceProduct, projectProduct } from '../src/ayrovix/services/commerceProduct';
import { db } from '../src/server';

const link = 'https://source-merchant.com/products/shoes';
const product = () => projectProduct(priceCommerceProduct(db, normalizeSerpApiMatch({
  title: 'Chaussures running', category: 'Shoes', source: 'Source Merchant', link,
  price: { value: 59.95, currency: 'EUR' },
  options: [
    { name: 'Size', options: [{ id: 'eu42', label: '42 EU', available: true }, { id: 'eu43', label: '43 EU', available: false }] },
    { name: 'Color', options: [{ id: 'blue', label: 'Blue' }, { id: 'red', label: 'Red' }] },
  ],
  variants: [
    { id: 'blue42', attributes: { Size: 'eu42', Color: 'blue' }, price: { value: 64.95, currency: 'EUR' }, available: true },
    { id: 'red43', attributes: { Size: 'eu43', Color: 'red' }, price: { value: 69.95, currency: 'EUR' }, available: false },
  ],
})));
let root: Root, node: HTMLElement;
const byText = (text: string) => [...node.querySelectorAll('button')].find(el => el.textContent?.trim() === text) as HTMLButtonElement;
const buy = () => node.querySelector('.ay-product__buy') as HTMLButtonElement;
const render = async (item = product(), onOrder = vi.fn()) => {
  await act(async () => { root.render(<LocaleProvider><ProductResult product={item}
    ordering={false} onOrder={onOrder} /></LocaleProvider>); });
  return onOrder;
};
const click = async (button: HTMLButtonElement) => act(async () => { button.click(); });

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('payment config unavailable in offline UI test'); }));
  node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => { root.unmount(); }); node.remove(); vi.unstubAllGlobals();
});

describe('sourced variant selector and cart CTA', () => {
  it('requires BOTH documented groups before enabling order; sends stable IDs and quantity, not labels as price inputs', async () => {
    const onOrder = await render();
    expect(node.textContent).toContain('Pointure');
    expect(node.textContent).toContain('Guide des tailles/pointures : consulter la fiche du marchand');
    expect(buy().disabled).toBe(true);
    await click(byText('42 EU'));
    expect(buy().disabled).toBe(true);
    await click(byText('Blue'));
    expect(buy().disabled).toBe(false);
    await click(node.querySelector('[aria-label="Augmenter la quantité"]') as HTMLButtonElement);
    expect(node.querySelector('.ay-product__counter output')?.textContent).toBe('2');
    await click(buy());
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledWith(expect.objectContaining({
      productUrl: link, selectedOptions: { size: 'eu42', color: 'blue' },
      size: '42 EU', color: 'Blue', quantity: 2,
    } satisfies Partial<AyrovixOrderSelection>));
  });

  it('disables explicitly sold-out options and never displays a misleading base price for an invalid selected combination', async () => {
    const onOrder = await render();
    expect(byText('43 EU').disabled).toBe(true);
    await click(byText('42 EU'));
    await click(byText('Red'));
    expect(byText('42 EU').getAttribute('aria-pressed')).toBe('true');
    expect(byText('Red').getAttribute('aria-pressed')).toBe('true');
    expect(buy().disabled).toBe(true);
    expect(node.textContent).toContain('Cette combinaison est indisponible');
    expect(node.querySelector('.ay-product__price')?.textContent).toContain('Prix indisponible');
    await click(buy());
    expect(onOrder).not.toHaveBeenCalled();
  });

  it('resets selections on identity change, so a second product never inherits a previous option', async () => {
    await render();
    await click(byText('42 EU')); await click(byText('Blue'));
    expect(buy().disabled).toBe(false);
    const next = product();
    next.canonical = { ...next.canonical!, id: 'another-merchant-listing',
      identity: { ...next.canonical!.identity, sourceUrl: 'https://source-merchant.com/another-item' } };
    await render(next);
    expect(buy().disabled).toBe(true);
    expect(byText('42 EU').getAttribute('aria-pressed')).toBe('false');
    expect(byText('Blue').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not offer a synthetic size group for an unoptioned skincare product', async () => {
    const plain = projectProduct(priceCommerceProduct(db, normalizeSerpApiMatch({
      title: 'Serum 30 ml and size 42', link: 'https://source-merchant.com/serum',
      source: 'Source Merchant', price: { value: 10, currency: 'EUR' },
    })));
    await render(plain);
    expect(node.querySelectorAll('.ay-product__choices')).toHaveLength(0);
    expect(node.textContent).not.toContain('Guide des tailles');
    expect(buy().disabled).toBe(false);
  });
});
