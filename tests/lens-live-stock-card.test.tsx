// @vitest-environment jsdom
/*
 * STOCK SUR LA CARTE LENS (01/10/2026) — ce que la source affirme s'affiche,
 * un silence ne s'affiche pas, et le bouton « vérifier » produit une preuve
 * datée. Ces tests verrouillent surtout l'interdiction : pas de badge inventé,
 * pas de taille cachée sans explication, pas de boutons imbriqués.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { LensProductCard } from '../client/src/ayrovix/components/LensProductCard';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { AyrovixCandidate } from '../client/src/ayrovix/types';
import type { LiveStockResult } from '../client/src/ayrovix/services/lensApi';

const refreshMock = vi.hoisted(() => vi.fn());
vi.mock('../client/src/ayrovix/services/lensApi', () => ({ refreshLiveStock: refreshMock }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const candidate: AyrovixCandidate = {
  id: 'hoody', kind: 'external', title: 'I Saw It First Zip Up Hoody', brand: null, model: null,
  colors: [], sizes: [], source: 'Sports Direct', sourceUrl: 'https://shop.example/hoody',
  image: '/hoody.jpg', price: 19, currency: 'EUR', priceTnd: 76, match: 90,
} as AyrovixCandidate;

const fresh = (over: Partial<LiveStockResult> = {}): LiveStockResult => ({
  url: 'https://shop.example/hoody', availability: 'in_stock',
  sizes: ['8 (XS)', '10 (S)'], colors: ['Noir'], images: [], variants: [],
  checkedAt: new Date('2026-10-01T10:30:00Z').toISOString(), reason: 'page marchande (json_ld)', ...over,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  refreshMock.mockReset();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.restoreAllMocks();
});

async function render(patch: Partial<AyrovixCandidate> = {}) {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <LensProductCard candidate={{ ...candidate, ...patch }} onChoose={() => {}} saved={false} busy={false} onFavorite={() => {}} />
      </LocaleProvider>,
    );
  });
}
const text = () => host.textContent || '';
const verifyButton = () => host.querySelector<HTMLButtonElement>('.lens-card-verify');

describe('carte Lens — ce que la source affirme', () => {
  it('un silence de disponibilité n’affiche AUCUN badge', async () => {
    await render({ availability: undefined });
    expect(host.querySelector('.lens-card-stock')).toBeNull();
    await render({ availability: 'unknown' });
    expect(host.querySelector('.lens-card-stock')).toBeNull();
  });

  it('affiche la rupture telle quelle, sans la cacher', async () => {
    await render({ availability: 'out_of_stock' });
    const badge = host.querySelector('.lens-card-stock');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-stock')).toBe('out_of_stock');
  });

  it('affiche « stock limité » sans le transformer en disponibilité pleine', async () => {
    await render({ availability: 'limited' });
    expect(host.querySelector('.lens-card-stock')?.getAttribute('data-stock')).toBe('limited');
  });

  it('montre les tailles publiées, sans bouton imbriqué dans la carte', async () => {
    await render({ sizes: ['8 (XS)', '10 (S)', '12 (M)'] });
    const chips = [...host.querySelectorAll('.lens-card-size')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['8 (XS)', '10 (S)', '12 (M)']);
    // Des spans, jamais des <button> : un bouton dans un bouton est invalide.
    expect(chips.every((chip) => chip.tagName)).toBe(true);
    expect(host.querySelector('.lens-card-sizes')?.querySelector('button')).toBeNull();
    // Le bouton d'ouverture de la fiche reste UN seul bouton autour du contenu.
    expect(host.querySelectorAll('.lens-card-open button')).toHaveLength(0);
  });
});

describe('carte Lens — le bouton « vérifier le stock »', () => {
  it('n’existe que pour un vrai lien produit', async () => {
    await render();
    expect(verifyButton()).not.toBeNull();
    await render({ sourceUrl: '' });
    expect(verifyButton()).toBeNull();
    await render({ sourceUrl: '/interne' });
    expect(verifyButton()).toBeNull();
  });

  it('relit la source, puis affiche la preuve fraîche avec son heure', async () => {
    refreshMock.mockResolvedValue([fresh()]);
    await render();
    expect(text()).not.toContain('Vérifié à');

    await act(async () => { verifyButton()!.click(); });

    expect(refreshMock).toHaveBeenCalledWith(['https://shop.example/hoody']);
    expect(host.querySelector('.lens-card-stock')?.getAttribute('data-stock')).toBe('in_stock');
    expect(text()).toContain('Vérifié à');
    // Les tailles fraîches remplacent ce que la grille savait.
    expect([...host.querySelectorAll('.lens-card-size')].map((chip) => chip.textContent)).toEqual(['8 (XS)', '10 (S)']);
  });

  it('barre une taille que le marchand déclare indisponible', async () => {
    refreshMock.mockResolvedValue([fresh({
      variants: [
        { value: '8 (XS)', color: null, availability: 'available' },
        { value: '10 (S)', color: null, availability: 'unavailable' },
      ],
    })]);
    await render();
    await act(async () => { verifyButton()!.click(); });
    const chips = [...host.querySelectorAll('.lens-card-size')];
    expect(chips[0].getAttribute('data-state')).toBe('in');
    expect(chips[1].getAttribute('data-state')).toBe('out');
    expect(chips[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('une page mueté ne devient jamais « en stock » : elle est signalée non confirmée', async () => {
    refreshMock.mockResolvedValue([fresh({ availability: 'unknown', sizes: [] })]);
    await render();
    await act(async () => { verifyButton()!.click(); });
    expect(host.querySelector('.lens-card-stock')).toBeNull();
    expect(text()).toContain('non confirmé');
  });

  it('une erreur réseau est dite, pas masquée', async () => {
    refreshMock.mockRejectedValue(new Error('network'));
    await render();
    await act(async () => { verifyButton()!.click(); });
    expect(text()).toContain('non confirmé');
    expect(host.querySelector('.lens-card-stock')).toBeNull();
  });
});
