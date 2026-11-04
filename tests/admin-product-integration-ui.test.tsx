// @vitest-environment jsdom
/**
 * Admin — bloc « Product Integration / ربط المنتج » (Reel, Story, Publication).
 *  • par défaut : contenu normal, aucune recherche, aucune carte ;
 *  • Shoppable : recherche catalogue (nom, SKU, référence) ; seuls les produits vendables sont proposés ;
 *  • choisir écrit uniquement content_mode + product_id ;
 *  • édition : le produit lié est relu dans le catalogue (nom, prix) ; « Délier » vide le lien ;
 *  • aperçu : la carte telle qu'elle apparaîtra, ou l'indication qu'aucune carte ne sera affichée.
 */
import React, { useState, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('../client/src/admin/api', () => apiMock);

import { ProductIntegration, type ProductLinkValue } from '../client/src/admin/ProductIntegration';
import { ARTICLE_CARD } from '../shared/articleCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let lastValue: ProductLinkValue | null = null;

function Harness({ initial, kind = 'reel' }: { initial: ProductLinkValue; kind?: 'reel' | 'story' | 'publication' }) {
  const [value, setValue] = useState<ProductLinkValue>(initial);
  return (
    <ProductIntegration
      kind={kind}
      value={value}
      onChange={(next) => { lastValue = next; setValue(next); }}
    />
  );
}

async function mount(initial: ProductLinkValue, kind?: 'reel' | 'story' | 'publication') {
  await act(async () => root.render(<Harness initial={initial} kind={kind} />));
}

const buttonByText = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

async function type(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Rechercher un produit"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const sellable = { id: 'p_ok', name: 'Pantalon taille haute', image: '/m/p.jpg', status: 'ACTIVE', final_price: 89, currency: 'TND', stock_status: 'AVAILABLE', product_code: 'REF-42' };
const inactive = { ...sellable, id: 'p_off', name: 'Ancien modèle', status: 'INACTIVE' };
const noPrice = { ...sellable, id: 'p_free', name: 'Sans prix', final_price: null };

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  lastValue = null;
  apiMock.adminApi.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('Product Integration — admin', () => {
  it('par défaut : contenu normal, aucune recherche, aucun aperçu de carte', async () => {
    await mount({ content_mode: 'normal', product_id: '' });
    expect(host.textContent).toContain('Produit à associer / ربط المنتج');
    expect(host.querySelector('input[aria-label="Rechercher un produit"]')).toBeNull();
    expect(host.textContent).not.toContain('Aperçu sur le téléphone');
    expect(apiMock.adminApi).not.toHaveBeenCalled();
  });

  it('Shoppable : la recherche interroge le catalogue par nom/SKU/référence et filtre les produits non vendables', async () => {
    vi.useFakeTimers();
    apiMock.adminApi.mockResolvedValue({ success: true, data: [sellable, inactive, noPrice] });
    await mount({ content_mode: 'normal', product_id: '' });
    await act(async () => buttonByText('Produit du catalogue')!.click());
    await type('REF-42');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(apiMock.adminApi).toHaveBeenCalledWith('/catalogue/products?search=REF-42&status=ACTIVE&page_size=8');
    expect(host.textContent).toContain('Pantalon taille haute');
    expect(host.textContent).not.toContain('Ancien modèle');
    expect(host.textContent).not.toContain('Sans prix');
    expect(host.textContent).toContain('89.00 TND');
  });

  /** La recherche renvoie une liste, la relecture par identifiant renvoie l'objet. */
  const mockCatalogue = (product: any) => apiMock.adminApi.mockImplementation((url: string) =>
    String(url).startsWith('/catalogue/products/')
      ? Promise.resolve({ success: true, data: product })
      : Promise.resolve({ success: true, data: [product] }));

  it('choisir un produit n’écrit que le mode et l’identifiant, puis affiche l’aperçu', async () => {
    vi.useFakeTimers();
    mockCatalogue(sellable);
    await mount({ content_mode: 'normal', product_id: '' });
    await act(async () => buttonByText('Produit du catalogue')!.click());
    await type('pant');
    await act(async () => { vi.advanceTimersByTime(300); });
    const option = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Pantalon taille haute'))!;
    await act(async () => option.click());
    await act(async () => { await Promise.resolve(); });
    // Lot F1 (24/10/2026) : la valeur porte aussi le tiroir, dans l'ordre choisi.
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'p_ok', product_ids: ['p_ok'] });
    expect(host.textContent).toContain('Aperçu sur le téléphone');
    // Module retenu (24/10/2026) : la carte entière est pressable, pas de bouton séparé.
    expect(host.textContent).not.toContain('Découvrir');
    const card = host.querySelector('[data-article-card]') as HTMLButtonElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute('aria-label')).toContain('Pantalon taille haute');
    // Les cotes viennent du contrat partagé : on ne les réécrit pas ici.
    expect(card.style.height).toBe(`${ARTICLE_CARD.height}px`);
    expect(card.style.maxWidth).toBe(`${ARTICLE_CARD.width}px`);
  });

  it('Créer un produit temporaire : pas de recherche catalogue, création publiée puis association par identifiant', async () => {
    const created = { ...sellable, id: 'prod_temp_new', name: 'Veste temporaire', visibility: 'CONTENT', final_price: 120 };
    apiMock.adminApi.mockResolvedValue({ success: true, data: created });
    await mount({ content_mode: 'normal', product_id: '' });
    await act(async () => buttonByText('Créer un produit temporaire')!.click());
    expect(host.querySelector('input[aria-label="Rechercher un produit"]')).toBeNull();
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Nom du produit temporaire"]')!;
    const price = host.querySelector<HTMLInputElement>('input[aria-label="Prix d’origine"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(name, 'Veste temporaire');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(price, '80');
      price.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => buttonByText('Publier et associer')!.click());
    expect(apiMock.adminApi).toHaveBeenCalledWith('/catalogue/content-products', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(apiMock.adminApi.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: 'Veste temporaire', original_price: 80, status: 'ACTIVE' });
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'prod_temp_new', product_ids: ['prod_temp_new'] });
  });

  it('un produit temporaire lié se signale comme tel, et « Aucun produit » délie sans recherche', async () => {
    apiMock.adminApi.mockResolvedValue({ success: true, data: { ...sellable, visibility: 'CONTENT' } });
    await mount({ content_mode: 'shoppable', product_id: 'p_ok' });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('produit temporaire');
    await act(async () => buttonByText('Aucun produit')!.click());
    expect(lastValue).toEqual({ content_mode: 'normal', product_id: '' });
  });

  it('édition : le produit lié est relu dans le catalogue ; « Délier » vide le lien', async () => {
    apiMock.adminApi.mockResolvedValue({ success: true, data: sellable });
    await mount({ content_mode: 'shoppable', product_id: 'p_ok' });
    expect(apiMock.adminApi).toHaveBeenCalledWith('/catalogue/products/p_ok');
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('réf. REF-42');
    await act(async () => buttonByText('Délier')!.click());
    // « Délier » vide AUSSI le tiroir : sinon d'anciennes lignes continueraient de s'afficher.
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: '', product_ids: [] });
  });

  it('tiroir à plusieurs articles : ajout, ordre (l’ordre ici = l’ordre à l’écran) et retrait', async () => {
    vi.useFakeTimers();
    const second = { ...sellable, id: 'p_two', name: 'Robe longue', product_code: 'REF-43' };
    const third = { ...sellable, id: 'p_three', name: 'Foulard soie', product_code: 'REF-44' };
    apiMock.adminApi.mockImplementation((url: string) => {
      const path = String(url);
      if (path.startsWith('/catalogue/products?')) return Promise.resolve({ success: true, data: [second] });
      const id = path.split('/catalogue/products/')[1];
      return Promise.resolve({ success: true, data: [sellable, second, third].find((p) => p.id === id) ?? sellable });
    });

    await mount({ content_mode: 'shoppable', product_id: 'p_ok', product_ids: ['p_ok'] });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('Articles du tiroir (1)');

    // Ajout au tiroir sans toucher au produit principal (il reste le premier).
    await act(async () => buttonByText('Produit du catalogue')!.click());
    const add = host.querySelector<HTMLInputElement>('input[aria-label="Ajouter un article au tiroir"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(add, 'robe');
      add.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(300); });
    const option = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Robe longue'))!;
    await act(async () => option.click());
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'p_ok', product_ids: ['p_ok', 'p_two'] });

    // Monter / descendre change l'ordre, et le premier article redevient `product_id`.
    await act(async () => { await Promise.resolve(); });
    await act(async () => (host.querySelector('button[aria-label="Monter Robe longue"]') as HTMLButtonElement).click());
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'p_two', product_ids: ['p_two', 'p_ok'] });
    await act(async () => { await Promise.resolve(); });
    await act(async () => (host.querySelector('button[aria-label="Descendre Robe longue"]') as HTMLButtonElement).click());
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'p_ok', product_ids: ['p_ok', 'p_two'] });

    // Retirer un article garde les autres ; retirer le dernier vide la liste (aucune carte fantôme).
    await act(async () => { await Promise.resolve(); });
    await act(async () => (host.querySelector('button[aria-label="Retirer Robe longue"]') as HTMLButtonElement).click());
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: 'p_ok', product_ids: ['p_ok'] });
    await act(async () => { await Promise.resolve(); });
    await act(async () => (host.querySelector('button[aria-label="Retirer Pantalon taille haute"]') as HTMLButtonElement).click());
    expect(lastValue).toEqual({ content_mode: 'shoppable', product_id: '', product_ids: [] });
  });

  it('produit introuvable (supprimé) : message clair, pas de carte cassée', async () => {
    apiMock.adminApi.mockRejectedValue(new Error('not found'));
    await mount({ content_mode: 'shoppable', product_id: 'p_gone' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(host.textContent).toContain('Le produit lié est introuvable');
    expect(host.querySelector('img')).toBeNull();
  });

  it('aperçu : la carte entière est l’action — l’appui annonce l’ouverture de la fiche', async () => {
    vi.useFakeTimers();
    mockCatalogue(sellable);
    await mount({ content_mode: 'normal', product_id: '' });
    await act(async () => buttonByText('Produit du catalogue')!.click());
    await type('pant');
    await act(async () => { vi.advanceTimersByTime(300); });
    const option = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Pantalon taille haute'))!;
    await act(async () => option.click());
    expect(host.textContent).toContain('La carte entière est l’action');
    const card = host.querySelector('[data-article-card]') as HTMLButtonElement;
    await act(async () => card.click());
    expect(host.textContent).toContain('la fiche produit s’ouvre dans l’application');
  });

  it('aperçu d’une story sans produit : indique qu’aucune carte ne sera affichée', async () => {
    await mount({ content_mode: 'shoppable', product_id: '' }, 'story');
    expect(host.textContent).toContain('Aucun produit : aucune carte ne sera affichée.');
  });
});
