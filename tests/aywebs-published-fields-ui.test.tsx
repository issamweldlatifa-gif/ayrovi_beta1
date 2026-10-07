// @vitest-environment jsdom
/**
 * AYWEBs 2.5 — CE QUE L'ÉCRAN MONTRE DES CHAMPS ÉTENDUS (rendu réel).
 *
 * Le serveur publie `gtin`, `sku`, `seller`, `rating` et `review_count` ; ce
 * test monte la feuille d'achat AYWEBs avec un produit mocké et lit le DOM :
 *
 *   1. ce qui est publié est AFFICHÉ (note, nombre d'avis, vendeur, référence) ;
 *   2. ce qui ne l'est pas DISPARAÎT — aucune ligne « 0 avis », aucun vendeur
 *      supposé : c'est la règle de la Phase 0 appliquée à l'affichage.
 *
 * Le montage utilise la même mécanique que les autres suites d'interface
 * (`createRoot` + `act`, `LocaleProvider`), pas une inspection de source.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { AyWebsVariantSheet } from '../client/src/features/aywebs/components/AyWebsVariantSheet';

vi.mock('../client/src/features/aywebs/api', () => ({
  resolveAyWebsProduct: vi.fn(),
  getAyWebsVariants: vi.fn(async () => ({ variants: [] })),
  addAyWebsCartItem: vi.fn(),
  createAyWebsPurchaseRequest: vi.fn(),
  trackAyWebsEvent: vi.fn(async () => ({ ok: true })),
}));

import * as api from '../client/src/features/aywebs/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** Produit tel que `POST /product/resolve` le renvoie (corps plat). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    product_id: 'aywprd_test_1', store_id: 'amazon', store_name: 'Amazon',
    source_url: 'https://www.amazon.de/dp/B0D1XD1ZV3', source_domain: 'amazon.de',
    source_product_id: 'B0D1XD1ZV3', title: 'Casque Bluetooth', description: '', brand: 'TestBrand',
    images: [], price: 129.99, currency: 'EUR', price_verified: true, currency_verified: true,
    variants: [], variant_details: [], variant_groups: [],
    condition: null, gtin: null, sku: null, seller: null, rating: null, review_count: null,
    selected_variant: null,
    availability: {
      state: 'AVAILABLE', reason: 'merchant_published_in_stock', checked_at: new Date().toISOString(),
      source: 'adapter', quantity_hint: null,
    },
    merchant: {}, purchase_mode: 'MANUAL_REVIEW', integration_type: 'PARTIALLY_SUPPORTED',
    captured_at: new Date().toISOString(), evidence_hash: 'hash',
    ayrovi_pricing: { total_tnd: 620.5, pricing_version: 3, breakdown: {} },
    ...overrides,
  };
}

async function renderSheet(product: ReturnType<typeof payload>) {
  vi.mocked(api.resolveAyWebsProduct).mockResolvedValue({ product, quoteToken: 'qt_test' } as any);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <AyWebsVariantSheet url="https://www.amazon.de/dp/B0D1XD1ZV3" onClose={() => {}} onCheckout={() => {}} />
      </LocaleProvider>,
    );
  });
  return String(container.textContent || '');
}

/** Les séparateurs de milliers varient (espace fine insécable, insécable, normal). */
const normalize = (value: string) => value.replace(/[\u202f\u00a0\u2009]/g, ' ');

describe('AYWEBs 2.5 — la feuille d’achat affiche les champs publiés', () => {
  it('note, avis, vendeur et référence sont visibles quand la page les publie', async () => {
    const text = normalize(await renderSheet(payload({
      rating: 4.6, review_count: 46196, seller: 'ElectroShop GmbH', sku: 'B0D1XD1ZV3', gtin: '4006381333931',
    })));
    expect(text).toContain('4.6');
    expect(text).toMatch(/46 196/);
    expect(text).toContain('ElectroShop GmbH');
    expect(text).toContain('B0D1XD1ZV3');
    expect(text).toContain('4006381333931');
  });

  it('note seule ou avis seuls : la ligne reste juste, sans nombre inventé', async () => {
    const ratingOnly = normalize(await renderSheet(payload({ rating: 4.2 })));
    expect(ratingOnly).toContain('4.2');
    expect(ratingOnly).not.toMatch(/avis publiés/);
    await act(async () => root.unmount());
    root = createRoot(container);
    const reviewsOnly = normalize(await renderSheet(payload({ review_count: 87 })));
    expect(reviewsOnly).toMatch(/87 avis publiés/);
    expect(reviewsOnly).not.toMatch(/\/ 5/);
  });

  it('rien de publié ⇒ aucune de ces lignes n’apparaît', async () => {
    const text = normalize(await renderSheet(payload()));
    expect(text).not.toMatch(/avis publiés/);
    expect(text).not.toMatch(/تقييم منشور/);
    expect(text).not.toContain('Vendu par');
    expect(text).not.toContain('يبيعه');
    expect(text).not.toContain('Référence marchand');
    expect(text).not.toContain('Code-barres');
    // Le vendeur n'est jamais remplacé par le nom de la boutique.
    expect(text).not.toContain('Vendu par Amazon');
  });
});
