// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import type { AyrovixProduct } from '../client/src/ayrovix/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const source: AyrovixProduct = {
  title: 'Chaussures de running', brand: 'Marque publiée', model: null, description: '',
  image: '/shoe.jpg', images: ['/shoe.jpg'], source: 'Boutique', sourceUrl: 'https://shop.example/shoe',
  price: 30, currency: 'EUR', priceTnd: 100, exchangeRate: 3.37,
  colors: [], sizes: ['43', '40.5', '42'], variantOptions: [], availability: 'unknown',
};
let root: Root, host: HTMLDivElement;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { lineTotalTND: 117.32, originalLineTotalTND: null, promo: null, pricingVersion: 2 } }) })) as unknown as typeof fetch;
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; });
const render = async (product: AyrovixProduct) => act(async () => root.render(<LocaleProvider><ProductResult product={product} onOrder={vi.fn()} /></LocaleProvider>));

function button(text: string) {
  const match = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text));
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

describe('source-backed product options on the mobile detail page', () => {
  it('shoes open one bottom sheet and sort only sourced pointures, without invented stock or conversions', async () => {
    await render(source);
    expect(host.textContent).toContain('Pointure');
    expect(button('Ajouter au panier').disabled).toBe(true); // size not yet chosen
    await act(async () => button('Votre taille').click());
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Pointures disponibles');
    expect(dialog.textContent!.indexOf('40.5')).toBeLessThan(dialog.textContent!.indexOf('42'));
    expect(dialog.textContent!.indexOf('42')).toBeLessThan(dialog.textContent!.indexOf('43'));
    expect(dialog.textContent).not.toContain('Il en reste 2');
    expect(dialog.textContent).not.toContain('Taille marque');
    await act(async () => button('42').click());
    expect(button('Ajouter au panier').disabled).toBe(false);
  });

  it('clothing shows sourced sizes, no fake recommendation or merchant-specific chart', async () => {
    await render({ ...source, title: 'Pantalon jogging', sizes: ['XL', 'S', 'M'] });
    expect(host.textContent).toContain('Taille');
    expect(host.textContent).not.toContain('recommandation de taille');
    await act(async () => button('Votre taille').click());
    const rows = [...host.querySelectorAll('[role="dialog"] button strong')].map(row => row.textContent);
    expect(rows).toEqual(['S', 'M', 'XL']);
  });

  it('beauty shows capacity variants only if the merchant listed them; otherwise shows the title capacity alone', async () => {
    const serum = { ...source, title: 'Sérum contour des yeux 10 ml', sizes: [] };
    await render(serum);
    expect(host.textContent).toContain('10 ml');
    expect(host.textContent).not.toContain('Contenance non communiquée');
    expect(host.textContent).not.toContain('Votre taille');
    await render({ ...serum, sizes: ['10 ml', '20 ml'] });
    expect(host.textContent).toContain('Contenance');
    await act(async () => button('Choisir une contenance').click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('20 ml');
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain('30 ml');
  });

  it('a laptop without variants has no apparel size selector or fake capacity', async () => {
    await render({ ...source, title: 'Laptop 14 pouces', sizes: [], colors: [] });
    expect(host.textContent).not.toContain('Votre taille');
    expect(host.textContent).not.toContain('Contenance');
    expect(host.textContent).not.toContain('Pointures disponibles');
  });
});
