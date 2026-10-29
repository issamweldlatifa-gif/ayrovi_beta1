/**
 * Contrats unitaires et statiques de la refonte mobile du 29/10/2026 :
 *   1. Réservation panier 20 minutes (`cartReservation.ts`) : décompte MM:SS,
 *      rafraîchissement à l'ajout et expiration propre ;
 *   2. Analyse des variantes du gabarit officiel Bag / Zalando (`splitCartVariantLabels`) ;
 *   3. Compacité globale des boutons (`CHROME.button === 40`), barre inférieure
 *      opaque sans vide dessous (`TAB_BAR_SURFACE`) et unification du panier officiel
 *      sur `app/(tabs)/cart.tsx`, `app/aywebs/cart.tsx` et `StoreSheets.tsx` ;
 *   4. Traduction explicite du code d'erreur `NOT_A_PRODUCT_PAGE`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' }, StyleSheet: { create: (x: unknown) => x, hairlineWidth: 0.5 } }));

import { CHROME, TAB_BAR_SURFACE } from '../src/design/tokens.mobile';
import { ayWebsErrorTranslationKey } from '../src/features/aywebs/addError';
import {
  CART_RESERVATION_DURATION_MS,
  clearCartReservation,
  formatReservationCountdown,
  getCartReservationSnapshot,
  touchCartReservation,
} from '../src/features/shopping/cartReservation';
import { splitCartVariantLabels } from '../src/features/shopping/cartVariantLabels';

const ROOT = path.resolve(__dirname, '..');

describe('réservation panier 20 minutes (cartReservation)', () => {
  afterEach(() => {
    clearCartReservation();
  });

  it('formate le compte à rebours en MM:SS (20:00 -> 19:38 -> 00:00)', () => {
    expect(formatReservationCountdown(CART_RESERVATION_DURATION_MS)).toBe('20:00');
    expect(formatReservationCountdown((19 * 60 + 38) * 1000)).toBe('19:38');
    expect(formatReservationCountdown(4_200)).toBe('00:05');
    expect(formatReservationCountdown(0)).toBe('00:00');
  });

  it('active une fenêtre de 20 minutes quand le panier contient des articles et expire proprement', () => {
    const t0 = 1_760_000_000_000;
    expect(getCartReservationSnapshot(1, t0).active).toBe(false);

    touchCartReservation(t0);
    const snapStart = getCartReservationSnapshot(2, t0 + 22_000);
    expect(snapStart.active).toBe(true);
    expect(snapStart.countdown).toBe('19:38');

    // Sans article dans le panier, la pastille ne s'affiche pas.
    expect(getCartReservationSnapshot(0, t0 + 22_000).active).toBe(false);

    // Après 20 minutes révolues, la réservation est expirée.
    const expired = getCartReservationSnapshot(2, t0 + CART_RESERVATION_DURATION_MS + 1_000);
    expect(expired.active).toBe(false);
    expect(expired.countdown).toBe('00:00');
  });
});

describe('analyse des variantes du panier officiel (splitCartVariantLabels)', () => {
  it('privilégie requestedColor et requestedSize explicites du serveur et conserve une 3e dimension', () => {
    expect(
      splitCartVariantLabels({
        requestedColor: 'Noir profond',
        requestedSize: '42 EU',
        variant: 'Noir profond · 42 EU',
      }),
    ).toEqual({
      color: 'Noir profond',
      size: '42 EU',
      extra: '',
    });

    expect(
      splitCartVariantLabels({
        requestedColor: 'Noir profond',
        requestedSize: '42 EU',
        variant: 'Noir profond · 42 EU · 100 ml',
      }),
    ).toEqual({
      color: 'Noir profond',
      size: '42 EU',
      extra: '100 ml',
    });
  });

  it('décompose les étiquettes multilingues et les paires Couleur · Taille', () => {
    expect(
      splitCartVariantLabels({
        variant: 'Couleur : Jean clair · Taille : 4Y (98-104 cm)',
      }),
    ).toEqual({
      color: 'Jean clair',
      size: '4Y (98-104 cm)',
      extra: '',
    });

    expect(
      splitCartVariantLabels({
        variant: 'Black · XL',
      }),
    ).toEqual({
      color: 'Black',
      size: 'XL',
      extra: '',
    });
  });
});

describe('contrats d’unification du panier officiel, des boutons compacts et de NOT_A_PRODUCT_PAGE', () => {
  it('fixe la hauteur compacte des boutons à 40 dp et la barre inférieure opaque', () => {
    expect(CHROME.button).toBe(40);
    expect(TAB_BAR_SURFACE.light.background).toBe('#FFFFFF');
    expect(TAB_BAR_SURFACE.dark.background).toBe('#0A0A0A');
  });

  it('monte OfficialCartRow + OfficialCartStickySummary sur les trois points d’entrée panier', () => {
    for (const rel of [
      'app/(tabs)/cart.tsx',
      'app/aywebs/cart.tsx',
      'src/features/aywebs/StoreSheets.tsx',
    ]) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, rel).toContain('OfficialCartRow');
      expect(src, rel).toContain('OfficialCartStickySummary');
    }
  });

  it('traduit NOT_A_PRODUCT_PAGE vers aywebs.notAProductPage', () => {
    expect(ayWebsErrorTranslationKey('NOT_A_PRODUCT_PAGE')).toBe('aywebs.notAProductPage');
  });
});
