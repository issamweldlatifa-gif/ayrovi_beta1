// @vitest-environment jsdom
/**
 * CRM → Social → Publication : l'onglet des blocs (refonte du 13/11/2026).
 *  • liste les blocs dans l'ordre, avec couleur, modèle et nombre de produits ;
 *  • monter / descendre envoie l'ordre complet au serveur ;
 *  • éditeur : modèle, palette complète + nuancier, produits, aperçu fidèle ;
 *  • le duo sponsorisé a deux tuiles strictement de même taille ;
 *  • validation française avant l'envoi ; enregistrement en PUT partiel ;
 *  • lecture seule : aucun bouton d'écriture actif.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('../client/src/admin/api', () => apiMock);

import {
  PublicationBlockPreview,
  PublicationBlocksTab,
  blockFormError,
  emptyBlock,
  type BlockCatalogueProduct,
} from '../client/src/admin/PublicationBlocksTab';
import { PUBLICATION_BLOCK_SWATCHES } from '../shared/publicationBlocks';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const product = (id: string, name: string): BlockCatalogueProduct => ({
  id, name, image: `/media/catalogue/official/${id}.jpg`, status: 'ACTIVE', final_price: 94, currency: 'TND', brand_name: 'Nike',
});
const BLOCKS = [
  { id: 'b1', kind: 'container', title: 'Sneakers', subtitle: 'Deux classiques', bg_color: '#F2AD11', panel_color: '', sponsored: false, media_type: '', media_url: '', poster_url: '', product_ids: ['p1', 'p2'], active: true },
  { id: 'b2', kind: 'sponsored_pair', title: 'Sony', subtitle: 'Le silence', bg_color: '#1F3A5F', panel_color: '', sponsored: true, media_type: 'image', media_url: '/media/x.jpg', poster_url: '', product_ids: ['p1'], active: false },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  apiMock.adminApi.mockReset();
  apiMock.adminApi.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/publication-blocks' && !init) return { data: BLOCKS };
    if (path === '/publication-blocks/order') return { data: JSON.parse(String(init?.body)).ids.map((id: string) => BLOCKS.find((b) => b.id === id)) };
    if (path.startsWith('/catalogue/products/')) {
      const id = decodeURIComponent(path.split('/').pop()!);
      return { data: product(id, `Produit ${id}`) };
    }
    return { data: {} };
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const buttonByLabel = (label: string) => [...document.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);

describe('onglet Publication du CRM', () => {
  it('liste les blocs avec modèle, produits et statut', async () => {
    await act(async () => root.render(<PublicationBlocksTab canWrite />));
    await flush();
    const text = host.textContent ?? '';
    expect(text).toContain('Sneakers');
    expect(text).toContain('Conteneur coloré + rangée de produits');
    expect(text).toContain('Duo sponsorisé (image + deux cartes produit)');
    expect(text).toContain('Inactif');
    expect(text).toContain('zayrovi team');
    expect(host.querySelectorAll('table')).toHaveLength(1);
  });

  it('descendre le premier bloc envoie l’ordre complet', async () => {
    await act(async () => root.render(<PublicationBlocksTab canWrite />));
    await flush();
    const down = buttonByLabel('Descendre')[0];
    await act(async () => { down.click(); });
    await flush();
    const call = apiMock.adminApi.mock.calls.find(([path]) => path === '/publication-blocks/order');
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1].body))).toEqual({ ids: ['b2', 'b1'] });
  });

  it('éditer : palette complète, nuancier, aperçu et PUT partiel', async () => {
    await act(async () => root.render(<PublicationBlocksTab canWrite />));
    await flush();
    await act(async () => { buttonByLabel('Éditer')[0].click(); });
    await flush();
    const dialog = document.body;
    expect(dialog.querySelector('input[type="color"]')).toBeTruthy();
    for (const swatch of PUBLICATION_BLOCK_SWATCHES) expect(buttonByLabel(swatch).length).toBeGreaterThan(0);
    expect(dialog.querySelector('[data-testid="block-preview"][data-kind="container"]')).toBeTruthy();
    // choisir une teinte du nuancier puis enregistrer
    await act(async () => { buttonByLabel('#2E7D5B')[0].click(); });
    await act(async () => { buttonByLabel('Enregistrer')[0].click(); });
    await flush();
    const put = apiMock.adminApi.mock.calls.find(([path, init]) => path === '/publication-blocks/b1' && init?.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse(String(put![1].body))).toMatchObject({ kind: 'container', bg_color: '#2E7D5B', product_ids: ['p1', 'p2'] });
  });

  it('lecture seule : ajout, ordre et suppression désactivés', async () => {
    await act(async () => root.render(<PublicationBlocksTab canWrite={false} />));
    await flush();
    expect(buttonByLabel('Ajouter un bloc')[0]?.disabled ?? [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Ajouter un bloc'))?.disabled).toBe(true);
    expect(buttonByLabel('Supprimer').every((b) => b.disabled)).toBe(true);
    expect(buttonByLabel('Descendre').every((b) => b.disabled)).toBe(true);
  });
});

describe('aperçu et validation', () => {
  it('duo sponsorisé : deux tuiles de même taille', () => {
    const form = { ...emptyBlock('sponsored_pair'), title: 'Sony', media_url: '/media/x.jpg', product_ids: ['p1'] };
    const html = renderToStaticMarkup(<PublicationBlockPreview form={form} products={[product('p1', 'Casque')]} />);
    const size = (testId: string) => html.match(new RegExp(`data-testid="${testId}" style="width:(\\d+)px;height:(\\d+)px`))?.slice(1);
    expect(size('pair-left')).toBeTruthy();
    expect(size('pair-left')).toEqual(size('pair-right'));
    expect(html).toContain('Sponsorisé');
  });

  it('média vidéo : affiche la couverture et la mention vidéo', () => {
    const form = { ...emptyBlock('media'), title: 'Nike', media_type: 'video' as const, media_url: '/v.mp4', poster_url: '/p.jpg', product_ids: ['p1'] };
    const html = renderToStaticMarkup(<PublicationBlockPreview form={form} products={[product('p1', 'Tee')]} />);
    expect(html).toContain('src="/p.jpg"');
    expect(html).toContain('Vidéo');
  });

  it('messages de validation en français', () => {
    expect(blockFormError(emptyBlock('container'))).toContain('titre');
    expect(blockFormError({ ...emptyBlock('container'), title: 'Ok', bg_color: 'vert' })).toContain('Couleur');
    expect(blockFormError({ ...emptyBlock('media'), title: 'Ok' })).toContain('image ou une vidéo');
    expect(blockFormError({ ...emptyBlock('sponsored_pair'), title: 'Ok', media_url: '/x.jpg' })).toContain('produit');
    expect(blockFormError({ ...emptyBlock('container'), title: 'Ok', product_ids: ['p1'] })).toBe('');
  });
});
