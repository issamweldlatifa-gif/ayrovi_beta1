/**
 * Test sur téléphone du 15/11 — logique pure et contrats de source.
 *
 *  • remise : prix rouge + pastille « -45% » seulement si la remise est réelle ;
 *  • panier : un badge du nombre d'articles sur CHAQUE icône panier ;
 *  • son des vidéos de Publication : actif à l'ouverture, coupé pour la session ;
 *  • lignes de section retirées, cartes Reels nues, navigateur AYWEBs bleu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AyWebsCartItem } from '@/api/aywebs';
import { saleBadgeLabel, saleSummary } from '@/design/saleLogic';
import { cartBadgeText, totalCartUnits } from '@/features/shopping/cartUnits';
import {
  PUBLICATION_SOUND_DEFAULT_ON,
  publicationSoundOn,
  resetPublicationSound,
  setPublicationSoundOn,
  subscribePublicationSound,
  togglePublicationSound,
} from '@/features/publications/publicationSound';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('remise (référence 004418)', () => {
  it('calcule le pourcentage arrondi d’une vraie remise', () => {
    expect(saleSummary(21.99, 39.99)).toEqual({ discounted: true, percent: 45 });
    expect(saleSummary(15, 20)).toEqual({ discounted: true, percent: 25 });
    expect(saleBadgeLabel(45)).toBe('-45%');
    expect(saleBadgeLabel(24.6)).toBe('-25%');
  });

  it('n’invente jamais de remise : origine absente, égale, inférieure, à peine plus haute ou absurde', () => {
    for (const [price, original] of [
      [20, null], [20, undefined], [null, 30], [20, 20], [20, 19],
      [100, 100.5], // < 1 % : bruit d'arrondi, pas une promotion
      [1, 1000],    // 99,9 % : donnée cassée
      [Number.NaN, 30], [20, Number.POSITIVE_INFINITY], [-5, 30], [0, 30],
    ] as const) {
      expect(saleSummary(price as number | null, original as number | null), `${price} / ${original}`)
        .toEqual({ discounted: false, percent: null });
    }
  });
});

describe('badge du panier — nombre d’articles partout', () => {
  const line = (quantity: number, linkedToZayrovi: boolean) => ({ quantity, linkedToZayrovi }) as AyWebsCartItem;

  it('additionne le panier Zayrovi et les lignes AYWEBs pas encore liées (jamais deux fois)', () => {
    expect(totalCartUnits(2, [line(3, false), line(5, true)])).toBe(5);
    expect(totalCartUnits(null, [line(1, false)])).toBe(1);
    expect(totalCartUnits(4, null)).toBe(4);
    expect(totalCartUnits(undefined, undefined)).toBe(0);
    expect(totalCartUnits(Number.NaN, [])).toBe(0);
  });

  it('pas de « 0 » qui crie ; 99+ au-delà', () => {
    expect(cartBadgeText(0)).toBe('');
    expect(cartBadgeText(-2)).toBe('');
    expect(cartBadgeText(Number.NaN)).toBe('');
    expect(cartBadgeText(1)).toBe('1');
    expect(cartBadgeText(2.7)).toBe('2');
    expect(cartBadgeText(99)).toBe('99');
    expect(cartBadgeText(100)).toBe('99+');
  });

  it('chaque icône panier passe par la même forme avec badge', () => {
    expect(read('src/features/shell/AppHeader.tsx')).toContain('LiveCartButton');
    expect(read('src/features/shell/LegacyMainMenu.tsx')).toContain('LiveCartButton');
    expect(read('app/aywebs/browser.tsx')).toContain('<CartGlyph');
    expect(read('src/features/shopping/LiveCartGlyph.tsx')).toContain('<CartGlyph');
    // Le badge n'est pas un second bouton bleu plein.
    expect(read('src/design/CartGlyph.tsx')).toContain('backgroundColor: badgeColor ?? CART_BADGE.background'); // 18/11 : compteur rouge
  });
});

describe('son des vidéos de Publication (« actif à l’ouverture, le client peut le couper »)', () => {
  afterEach(() => resetPublicationSound());

  it('démarre AVEC le son', () => {
    expect(PUBLICATION_SOUND_DEFAULT_ON).toBe(true);
    expect(publicationSoundOn()).toBe(true);
  });

  it('couper le son vaut pour toutes les vidéos de la session et prévient les lecteurs', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePublicationSound(listener);
    expect(togglePublicationSound()).toBe(false);
    expect(publicationSoundOn()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setPublicationSoundOn(false); // même valeur : aucun rendu inutile
    expect(listener).toHaveBeenCalledTimes(1);
    expect(togglePublicationSound()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    togglePublicationSound();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('le lecteur lit l’état partagé (pas un état local muet par défaut)', () => {
    const video = read('src/features/publications/templates/PublicationVideo.tsx');
    expect(video).toContain('useSyncExternalStore');
    expect(video).toContain('togglePublicationSound');
    expect(video).toContain('instance.muted = !publicationSoundOn()');
  });
});

describe('mise en page du 15/11', () => {
  it('plus de ligne de section sur l’accueil ni sous l’en-tête de Publication', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).not.toContain('<SectionRule');
    expect(home).toContain('<SectionBreak');
    expect(read('src/design/SectionRule.tsx')).not.toContain('hairlineWidth');
    expect(read('src/features/publications/PublicationHeader.tsx')).not.toContain('borderBottomWidth');
  });

  it('cartes « Reels • Shop » nues : ni logo, ni ligne éditeur', () => {
    const reels = read('src/features/home/ReelsShopSection.tsx');
    expect(reels).not.toContain('ReelOptions');
    expect(reels).not.toMatch(/publisher(Row|Name|Avatar)/);
  });

  it('navigateur AYWEBs façon Walmart : barre bleue, pilule blanche, logo Clean, ligne « Ajouté au panier »', () => {
    const browser = read('app/aywebs/browser.tsx');
    expect(browser).toContain('BROWSER_BAR.background'); // 16/11 : barre d'adresse claire (réf. 025233)
    expect(browser).toContain('aywebs-store-header-pill');
    expect(browser).toContain('<TabCleanIcon');
    expect(browser).toContain('aywebs-store-added-strip');
    const tokens = read('src/design/tokens.mobile.ts');
    expect(tokens).toMatch(/export const STORE_BAR = \{\s*background: BRAND\.yellow,\s*ink: BRAND\.black,/); // 19/11 : en-tête AYWEBs JAUNE, encre noire
  });

  it('panier : le logo Clean remplace « Examiner » — 16/11 : sur chaque carte, noir avec son reflet', () => {
    const cart = read('app/(tabs)/cart.tsx');
    const row = read('src/features/shopping/OfficialCartView.tsx');
    expect(cart).toContain('onAskClean={');
    expect(cart).toContain('cartItemContext(line, locale)');
    expect(row).toContain('<TabCleanIcon color={theme.colors.ink} tone="ink"');
    expect(cart).not.toMatch(/<Button label=\{t\('sonim\.shareCart'\)\}/);
  });
});
