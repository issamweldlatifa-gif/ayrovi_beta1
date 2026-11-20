/**
 * Liens profonds — ce qu'on tient ici, c'est surtout ce qui doit NE PAS
 * s'ouvrir. Une traduction trop généreuse est une faille : n'importe quelle
 * page pourrait faire naviguer l'application où elle veut.
 */
import { describe, expect, it } from 'vitest';
import { DEEP_LINK_HOSTS, resolveDeepLink } from '../src/features/links/resolve';
import { publicShareUrl } from "../src/features/links/shareLinks";
import { redirectSystemPath } from "../app/+native-intent";

describe('traduction des URL du site', () => {
  it('ouvre un produit, une commande, un article', () => {
    expect(resolveDeepLink('https://zayrovi.com/product/42')).toBe('/product/42');
    expect(resolveDeepLink('https://zayrovi.com/orders/ab-12')).toBe('/orders/ab-12');
    expect(resolveDeepLink('https://zayrovi.com/news/7')).toBe('/news/7');
  });

  it('la racine ouvre l’accueil', () => {
    expect(resolveDeepLink('https://zayrovi.com/')).toBe('/(tabs)');
    expect(resolveDeepLink('https://www.zayrovi.com')).toBe('/(tabs)');
  });

  it('les listes et les onglets', () => {
    expect(resolveDeepLink('https://zayrovi.com/catalog')).toBe('/publisher/zayrovi-team');
    expect(resolveDeepLink('https://zayrovi.com/orders')).toBe('/orders');
    expect(resolveDeepLink('https://zayrovi.com/panier')).toBe('/(tabs)/cart');
  });

  it('barre oblique finale : même écran, pas deux routes', () => {
    expect(resolveDeepLink('https://zayrovi.com/orders/')).toBe('/orders');
    expect(resolveDeepLink('https://zayrovi.com/catalog/')).toBe('/publisher/zayrovi-team');
  });

  it('tous les anciens liens Lens reviennent au parcours caméra canonique', () => {
    expect(resolveDeepLink('https://zayrovi.com/lens')).toBe('/lens');
    expect(resolveDeepLink('https://zayrovi.com/lens/help')).toBe('/lens');
    expect(resolveDeepLink('https://zayrovi.com/lens/history')).toBe('/lens');
    expect(resolveDeepLink('zayrovi:///lens/code')).toBe('/lens');
  });

  it('le plus long préfixe gagne — /orders/42 ne tombe pas sur /orders', () => {
    expect(resolveDeepLink('https://zayrovi.com/orders/42')).toBe('/orders/42');
    expect(resolveDeepLink('https://zayrovi.com/account/notifications')).toBe('/account/notifications');
  });
});

describe('refus — un lien inconnu ne navigue pas', () => {
  it('hôte étranger : ignoré, même avec un chemin connu', () => {
    expect(resolveDeepLink('https://site-malin.tn/orders/42')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com.evil.com/orders')).toBeNull();
  });

  it('un préfixe ne colle pas au milieu d’un segment', () => {
    expect(resolveDeepLink('https://zayrovi.com/ordersomething')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com/catalogue')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com/lens')).toBe('/lens');
    expect(resolveDeepLink('https://zayrovi.com/lenses')).toBeNull();
  });

  it('schémas qui ne sont pas les nôtres', () => {
    expect(resolveDeepLink('ftp://zayrovi.com/orders')).toBeNull();
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
    expect(resolveDeepLink('https://zayrovi.com/route-inexistante')).toBeNull();
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
    expect(DEEP_LINK_HOSTS).toContain('zayrovi.com');
    expect(DEEP_LINK_HOSTS).toContain('www.zayrovi.com');
  });

  it('les hôtes de préproduction sont acceptés (le paquet bêta les déclare)', () => {
    for (const host of DEEP_LINK_HOSTS) {
      expect(resolveDeepLink(`https://${host}/orders`)).toBe('/orders');
    }
  });
});

describe('Social Commerce', () => {
  it('préserve uniquement les filtres publics autorisés', () => {
    expect(resolveDeepLink('zayrovi://social?filter=stories')).toBe('/(tabs)/social?filter=stories');
    expect(resolveDeepLink('https://zayrovi.com/social/?filter=reels')).toBe('/(tabs)/social?filter=reels');
    expect(resolveDeepLink('https://zayrovi.com/social?filter=%2Fcheckout')).toBe('/(tabs)/social?filter=all');
    expect(resolveDeepLink('https://zayrovi.com/social-other')).toBeNull();
    expect(resolveDeepLink('https://other.example/social?filter=stories')).toBeNull();
  });
});

describe('per-item share links', () => {
  it('resolves exact item IDs with both locales and preserves the scheme fallback', () => {
    expect(resolveDeepLink('https://zayrovi.com/p/product_1')).toBe('/product/product_1');
    expect(resolveDeepLink('https://zayrovi.com/ar/r/reel_1')).toBe('/reels-viewer?id=reel_1&shared=1');
    expect(resolveDeepLink('https://zayrovi.com/ar/s/story_1')).toBe('/stories?id=story_1');
    expect(resolveDeepLink('zayrovi://reels-viewer?id=reel_1&shared=1')).toBe('/reels-viewer?id=reel_1&shared=1');
    expect(resolveDeepLink('zayrovi://stories?id=story_1')).toBe('/stories?id=story_1');
    expect(resolveDeepLink('zayrovi://lens')).toBe('/lens');
  });
  it('rejects unknown hosts, invalid IDs and unsafe query payloads', () => {
    expect(resolveDeepLink('https://thirdparty.example/ar/p/a')).toBeNull();
    expect(resolveDeepLink('http://zayrovi.com/p/a')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com:8443/p/a')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com/p/a/b')).toBeNull();
    expect(resolveDeepLink('https://zayrovi.com/r/%2Fa')).toBeNull();
    expect(resolveDeepLink('zayrovi://reels-viewer?id=%2Faccounts')).toBeNull();
  });
});

it('creates HTTPS share links only with an explicit separate website origin', () => {
  expect(publicShareUrl('s', 'story_1', 'ar', 'https://public.example')).toBe('https://public.example/ar/s/story_1');
  expect(publicShareUrl('p', 'product_1', 'fr', null)).toBeNull();
  expect(publicShareUrl('p', '../product_1', 'fr', 'https://public.example')).toBeNull();
  expect(publicShareUrl('p', 'product_1', 'fr', 'https://public.example/unsafe')).toBeNull();
});

it('rewrites short system links before Expo routing, without taking over OAuth or scheme links', () => {
  for (const initial of [true, false]) {
    expect(redirectSystemPath({ path: 'https://zayrovi.com/ar/s/story_1', initial })).toBe('/stories?id=story_1');
    expect(redirectSystemPath({ path: 'https://zayrovi.com/r/reel_1?shared=0', initial })).toBe('/reels-viewer?id=reel_1&shared=1');
    for (const path of ['https://unknown.example/p/item', 'https://zayrovi.com/r/%2Fa', 'zayrovi://lens', 'https://zayrovi.com/auth/native-done.html']) {
      expect(redirectSystemPath({ path, initial })).toBe(path);
    }
  }
});

it('opens the official publisher and preserves valid legacy arrival bookmarks', () => {
  for (const path of ['/catalog?arrivalId=arr_1', 'https://zayrovi.com/catalog?arrivalId=arr_1', 'zayrovi://boutique?arrivalId=arr_1']) {
    expect(redirectSystemPath({ path, initial: true })).toBe('/publisher/zayrovi-team?arrivalId=arr_1');
  }
  for (const path of ['zayrovi://publisher/zayrovi-team', 'https://zayrovi.com/catalog?arrivalId=../private']) {
    expect(redirectSystemPath({ path, initial: false })).toBe('/publisher/zayrovi-team');
  }
  const foreign = 'https://other.example/catalog';
  expect(redirectSystemPath({ path: foreign, initial: false })).toBe(foreign);
});
