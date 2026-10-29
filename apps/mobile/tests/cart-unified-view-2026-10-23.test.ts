/**
 * Panier principal = TOUT ce que le client a choisi (23/10/2026).
 *
 * Le serveur relie chaque ajout du navigateur au panier ZAYROVI (pont
 * idempotent). Ce qui manquait, c'est la vue : quand la liaison n'avait pas
 * abouti, la ligne n'existait que dans l'écran AYWEBs — le client croyait
 * l'avoir perdue.
 *
 * Ce test verrouille les trois morceaux de la correction :
 *   1. l'écran du panier lit AYWEBs et nomme les lignes en attente ;
 *   2. il propose de les relier (une action, pas une explication) ;
 *   3. après un ajout, la feuille renvoie au panier PRINCIPAL, pas à un
 *      deuxième panier.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ar } from '@/i18n/ar';
import { fr } from '@/i18n/fr';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.join(here, '..', relative), 'utf8');

describe('panier principal — les lignes du navigateur y sont visibles', () => {
  const cart = read('app/(tabs)/cart.tsx');

  it('l’écran lit le panier AYWEBs (pas seulement le panier ZAYROVI)', () => {
    expect(cart).toContain('fetchAyWebsCart');
    expect(cart).toContain('pendingAyWebsLines');
    expect(cart).toContain('pendingAyWebsUnits');
  });

  it('il propose de lier les lignes en attente, et dit ce qui se passe en cas d’échec', () => {
    expect(cart).toContain('bridgeAyWebsCartToAyrovi');
    expect(cart).toContain("t('cart.pendingLink')");
    /* Le repli d'erreur passe par `onNote(..., 'cart.linkFailed')`. */
    expect(cart).toContain("'cart.linkFailed'");
  });

  it('le panier AYWEBs est relu après une liaison (aucun état figé)', () => {
    expect(cart).toContain("invalidateQueries({ queryKey: ['aywebs'] })");
  });
});

describe('après l’ajout, on revient au panier principal', () => {
  const sheet = read('src/features/aywebs/AddToCartSheet.tsx');

  it('la feuille empile /panier sur le Stack racine et n’ouvre plus le panier AYWEBs séparé', () => {
    expect(sheet).toContain("router.push('/panier')");
    expect(sheet).not.toContain("router.push('/aywebs/cart')");
  });
});

describe('les textes existent dans les deux langues', () => {
  const keys = ['cart.pendingTitle', 'cart.pendingBody', 'cart.pendingLink', 'cart.linkFailed'] as const;

  it('le client ne voit jamais une clé brute', () => {
    for (const key of keys) {
      expect(fr[key], key).toBeTruthy();
      expect(ar[key], key).toBeTruthy();
    }
  });

  it('le nombre d’articles garde le même jeton dans les deux langues', () => {
    expect(fr['cart.pendingBody']).toContain('{count}');
    expect(ar['cart.pendingBody']).toContain('{count}');
  });
});
