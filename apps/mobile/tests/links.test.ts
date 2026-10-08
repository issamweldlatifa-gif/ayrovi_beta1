/**
 * Liens profonds — ce qu'on tient ici, c'est surtout ce qui doit NE PAS
 * s'ouvrir. Une traduction trop généreuse est une faille : n'importe quelle
 * page pourrait faire naviguer l'application où elle veut.
 */
import { describe, expect, it } from 'vitest';
import { DEEP_LINK_HOSTS, resolveDeepLink } from '../src/features/links/resolve';

describe('traduction des URL du site', () => {
  it('ouvre un produit, une commande, un article', () => {
    expect(resolveDeepLink('https://ayrovi.tn/product/42')).toBe('/product/42');
    expect(resolveDeepLink('https://ayrovi.tn/orders/ab-12')).toBe('/orders/ab-12');
    expect(resolveDeepLink('https://ayrovi.tn/news/7')).toBe('/news/7');
  });

  it('la racine ouvre l’accueil', () => {
    expect(resolveDeepLink('https://ayrovi.tn/')).toBe('/(tabs)');
    expect(resolveDeepLink('https://www.ayrovi.tn')).toBe('/(tabs)');
  });

  it('les listes et les onglets', () => {
    expect(resolveDeepLink('https://ayrovi.tn/catalog')).toBe('/catalog');
    expect(resolveDeepLink('https://ayrovi.tn/orders')).toBe('/orders');
    expect(resolveDeepLink('https://ayrovi.tn/lens')).toBe('/(tabs)/lens');
    expect(resolveDeepLink('https://ayrovi.tn/aywebs')).toBe('/(tabs)/aywebs');
    expect(resolveDeepLink('https://ayrovi.tn/panier')).toBe('/(tabs)/cart');
  });

  it('le lien vers SONIM, sous ses deux noms', () => {
    expect(resolveDeepLink('https://ayrovi.tn/assistant')).toBe('/assistant');
    expect(resolveDeepLink('https://ayrovi.tn/sonim')).toBe('/assistant');
  });

  it('barre oblique finale : même écran, pas deux routes', () => {
    expect(resolveDeepLink('https://ayrovi.tn/orders/')).toBe('/orders');
    expect(resolveDeepLink('https://ayrovi.tn/catalog/')).toBe('/catalog');
  });

  it('le plus long préfixe gagne — /orders/42 ne tombe pas sur /orders', () => {
    expect(resolveDeepLink('https://ayrovi.tn/orders/42')).toBe('/orders/42');
    expect(resolveDeepLink('https://ayrovi.tn/account/notifications')).toBe('/account/notifications');
  });
});

describe('refus — un lien inconnu ne navigue pas', () => {
  it('hôte étranger : ignoré, même avec un chemin connu', () => {
    expect(resolveDeepLink('https://site-malin.tn/orders/42')).toBeNull();
    expect(resolveDeepLink('https://ayrovi.tn.evil.com/orders')).toBeNull();
  });

  it('la vue Web marchande n’est JAMAIS atteignable par lien profond', () => {
    // Elle prend une URL en paramètre : l'ouvrir aux liens revenait à « faire
    // afficher n'importe quelle adresse dans l'application ».
    expect(resolveDeepLink('https://ayrovi.tn/aywebs/browser?url=https://n-importe-quoi.tn')).not.toContain('browser');
  });

  it('un préfixe ne colle pas au milieu d’un segment', () => {
    expect(resolveDeepLink('https://ayrovi.tn/ordersomething')).toBeNull();
    expect(resolveDeepLink('https://ayrovi.tn/catalogue')).toBeNull();
  });

  it('schémas qui ne sont pas les nôtres', () => {
    expect(resolveDeepLink('ftp://ayrovi.tn/orders')).toBeNull();
    expect(resolveDeepLink('javascript:alert(1)')).toBeNull();
    expect(resolveDeepLink('file:///etc/passwd')).toBeNull();
  });

  it('entrées vides ou illisibles', () => {
    expect(resolveDeepLink('')).toBeNull();
    expect(resolveDeepLink(null)).toBeNull();
    expect(resolveDeepLink(undefined)).toBeNull();
    expect(resolveDeepLink('pas une url')).toBeNull();
  });

  it('chemin inconnu sur un hôte autorisé : rien, plutôt qu’un écran 404', () => {
    expect(resolveDeepLink('https://ayrovi.tn/route-inexistante')).toBeNull();
  });
});

describe('schéma propre à l’application', () => {
  it('ayrovi://orders/42', () => {
    expect(resolveDeepLink('ayrovi://orders/42')).toBe('/orders/42');
  });

  it('la forme à trois barres est équivalente', () => {
    expect(resolveDeepLink('ayrovi:///orders/42')).toBe('/orders/42');
  });

  it('ayrovi:// seul ouvre l’accueil', () => {
    expect(resolveDeepLink('ayrovi://')).toBe('/(tabs)');
  });

  it('les variantes Expo (développement) restent comprises', () => {
    expect(resolveDeepLink('exp+ayrovi://orders/42')).toBe('/orders/42');
  });
});

describe('hôtes déclarés', () => {
  it('contient la liste qu’on publie réellement', () => {
    expect(DEEP_LINK_HOSTS).toContain('ayrovi.tn');
    expect(DEEP_LINK_HOSTS).toContain('www.ayrovi.tn');
  });

  it('les hôtes de préproduction sont acceptés (le paquet bêta les déclare)', () => {
    for (const host of DEEP_LINK_HOSTS) {
      expect(resolveDeepLink(`https://${host}/orders`)).toBe('/orders');
    }
  });
});
