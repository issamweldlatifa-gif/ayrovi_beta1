/**
 * Liens profonds — ce qu'on tient ici, c'est surtout ce qui doit NE PAS
 * s'ouvrir. Une traduction trop généreuse est une faille : n'importe quelle
 * page pourrait faire naviguer l'application où elle veut.
 */
import { describe, expect, it } from 'vitest';
import { DEEP_LINK_HOSTS, resolveDeepLink } from '../src/features/links/resolve';

describe('traduction des URL du site', () => {
  it('ouvre un produit, une commande, un article', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/product/42')).toBe('/product/42');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/orders/ab-12')).toBe('/orders/ab-12');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/news/7')).toBe('/news/7');
  });

  it('la racine ouvre l’accueil', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/')).toBe('/(tabs)');
    expect(resolveDeepLink('https://www.your-zayrovi-domain.example')).toBe('/(tabs)');
  });

  it('les listes et les onglets', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/catalog')).toBe('/catalog');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/orders')).toBe('/orders');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/panier')).toBe('/(tabs)/cart');
  });

  it('barre oblique finale : même écran, pas deux routes', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/orders/')).toBe('/orders');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/catalog/')).toBe('/catalog');
  });

  it('tous les anciens liens Lens reviennent au parcours caméra canonique', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/lens')).toBe('/lens');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/lens/help')).toBe('/lens');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/lens/history')).toBe('/lens');
    expect(resolveDeepLink('zayrovi:///lens/code')).toBe('/lens');
  });

  it('le plus long préfixe gagne — /orders/42 ne tombe pas sur /orders', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/orders/42')).toBe('/orders/42');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/account/notifications')).toBe('/account/notifications');
  });
});

describe('refus — un lien inconnu ne navigue pas', () => {
  it('hôte étranger : ignoré, même avec un chemin connu', () => {
    expect(resolveDeepLink('https://site-malin.tn/orders/42')).toBeNull();
    expect(resolveDeepLink('https://your-zayrovi-domain.example.evil.com/orders')).toBeNull();
  });

  it('un préfixe ne colle pas au milieu d’un segment', () => {
    expect(resolveDeepLink('https://your-zayrovi-domain.example/ordersomething')).toBeNull();
    expect(resolveDeepLink('https://your-zayrovi-domain.example/catalogue')).toBeNull();
    expect(resolveDeepLink('https://your-zayrovi-domain.example/lens')).toBe('/lens');
    expect(resolveDeepLink('https://your-zayrovi-domain.example/lenses')).toBeNull();
  });

  it('schémas qui ne sont pas les nôtres', () => {
    expect(resolveDeepLink('ftp://your-zayrovi-domain.example/orders')).toBeNull();
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
    expect(resolveDeepLink('https://your-zayrovi-domain.example/route-inexistante')).toBeNull();
  });
});

describe('schéma propre à l’application', () => {
  it('zayrovi://orders/42', () => {
    expect(resolveDeepLink('zayrovi://orders/42')).toBe('/orders/42');
  });

  it('la forme à trois barres est équivalente', () => {
    expect(resolveDeepLink('zayrovi:///orders/42')).toBe('/orders/42');
  });

  it('zayrovi:// seul ouvre l’accueil', () => {
    expect(resolveDeepLink('zayrovi://')).toBe('/(tabs)');
  });

  it('les variantes Expo (développement) restent comprises', () => {
    expect(resolveDeepLink('exp+zayrovi://orders/42')).toBe('/orders/42');
  });
});

describe('hôtes déclarés', () => {
  it('contient la liste qu’on publie réellement', () => {
    expect(DEEP_LINK_HOSTS).toContain('your-zayrovi-domain.example');
    expect(DEEP_LINK_HOSTS).toContain('www.your-zayrovi-domain.example');
  });

  it('les hôtes de préproduction sont acceptés (le paquet bêta les déclare)', () => {
    for (const host of DEEP_LINK_HOSTS) {
      expect(resolveDeepLink(`https://${host}/orders`)).toBe('/orders');
    }
  });
});
