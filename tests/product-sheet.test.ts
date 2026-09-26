/*
 * FICHE PRODUIT « feuille montante » (25/09/2026) — contrat de présentation.
 *
 * Le comportement validé par le client : au repos le produit est ENTIER, puis
 * le panneau d'information monte PAR-DESSUS l'image, qui s'éteint derrière lui.
 * Ces tests gardent les trois pièces qui le rendent possible ; si l'une saute,
 * la fiche redevient une page ordinaire sans que personne ne s'en aperçoive.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const sheetCss = read('client/src/shop/shop.css');
const component = read('client/src/shop/ProductPage.tsx');

describe('fiche produit — feuille montante', () => {
  it('la feuille de style vit avec l’écran qu’elle habille', () => {
    // La feuille est chargée avec l'application, pas en morceau différé : en
    // production, un chunk CSS manquant laissait les boutons sans fond.
    expect(read('client/src/index.css')).toContain('./shop/shop.css');
    expect(read('client/src/shop/ProductPage.tsx')).not.toContain("import './shop.css'");
  });

  it('le média reste collé pendant que la feuille monte par-dessus', () => {
    expect(sheetCss).toMatch(/\.s-media\s*\{[^}]*position: sticky/);
    expect(sheetCss).toMatch(/\.s-sheet\s*\{[^}]*z-index: 10/);
  });

  it('une seule variable pilote le rendu, écrite par le composant et lue par le CSS', () => {
    expect(component).toContain("setProperty('--s-reveal'");
    expect(sheetCss).toContain('var(--s-reveal, 0)');
  });

  it('le voile est de l’encre pure et ne dépasse jamais 58 % : le produit reste lisible', () => {
    expect(sheetCss).toContain('background: #000');
    expect(sheetCss).toContain('calc(var(--s-reveal, 0) * 0.58)');
    expect(component).toContain('s-scrim');
  });

  it('les commandes flottantes de la photo s’effacent quand la feuille les recouvre', () => {
    expect(component).toContain('s-rail');
    expect(sheetCss).toContain('.s-rail[data-hidden="true"] { pointer-events: none; }');
  });

  it('le mouvement est désactivable (accessibilité)', () => {
    expect(sheetCss).toContain('prefers-reduced-motion');
  });

  it('l’échelle de recul est unique en X et en Y — aucune déformation du produit', () => {
    const scales = sheetCss.match(/scale\(calc\(1 - var\(--s-reveal, 0\) \* 0\.04\)\)/g);
    expect(scales).toHaveLength(1);
  });
});

/*
 * PARITÉ D'IMAGE entre la petite carte et la grande fiche (25/09/2026).
 * Le client a vu le défaut avant nous : la carte affichait le produit détouré
 * sur notre fond studio, la fiche affichait encore l'image marchand isolée.
 * Une seule chaîne sert désormais les deux surfaces.
 */
describe('image produit — une seule chaîne pour la carte et la fiche', () => {
  const service = read('client/src/ayrovix/services/mediaIsolation.ts');

  it('la chaîne va de la composition à l’image brute, dans cet ordre', () => {
    const body = service.split('export function withIsolation')[1].split('\n}')[0];
    expect(body.indexOf('composedMediaUrl')).toBeLessThan(body.indexOf('isolatedMediaUrl'));
    expect(body.indexOf('isolatedMediaUrl')).toBeLessThan(body.indexOf('output.push(url)'));
  });

  it('la fiche consomme la composition, plus l’isolation seule', () => {
    const adapter = read('client/src/shop/adapter.ts');
    expect(adapter).toContain('withIsolation([url])');
    expect(adapter).not.toContain('isolatedSrc(');
  });

  it('un échec recule d’un cran au lieu de laisser un trou', () => {
    expect(component).toContain('onError');
    expect(component).toContain('mediaStep');
    expect(component).toContain('chain.length - 1');
  });
});

/*
 * Forme téléphone : actions posées sur la photo, achat toujours atteignable.
 */
describe('fiche produit — format téléphone', () => {
  it('interroge le navigateur au lieu de dupliquer le balisage', () => {
    // L'écran v2 n'a plus besoin d'interroger le navigateur : sa mise en page est
    // la même partout, et la feuille monte par-dessus le média dans tous les cas.
    expect(component).not.toContain('matchMedia');
  });

  it('le panier quitte l’en-tête pour se poser sur la photo', () => {
    expect(component).toContain('s-rail__btn');
    expect(sheetCss).toContain('.s-rail__btn');
  });

  it('la barre d’achat est fixe et rend son espace au contenu', () => {
    expect(sheetCss).toMatch(/\.s-buybar\s*\{[^}]*position: sticky/);
    expect(sheetCss).toMatch(/\.s-buybar\s*\{[^}]*bottom: 0/);
  });
});

/*
 * Drap des tailles : deux échelles, mais seulement quand la source en donne deux.
 */
describe('drap des tailles', () => {
  it('n’invente aucune table de conversion : l’échelle marque vient des libellés reçus', () => {
    const adapter = read('client/src/shop/adapter.ts');
    const types = read('client/src/shop/types.ts');
    expect(adapter).toContain('option.label.trim()');
    expect(types).toContain('hasBrandScale');
    expect(types).toContain('length >= 2');
  });

  it('les onglets n’apparaissent pas quand il n’y a qu’une échelle', () => {
    const drape = read('client/src/shop/SizeDrape.tsx');
    expect(drape).toContain('{brandAvailable && (');
    expect(drape).toContain('role="tablist"');
  });

  it('le drap MONTE au lieu d’apparaître', () => {
    expect(sheetCss).toContain('@keyframes s-rise');
    expect(sheetCss).toContain('translateY(100%)');
  });

  it('les trois états du moteur de disponibilité restent distincts', () => {
    const drape = read('client/src/shop/SizeDrape.tsx');
    expect(drape).toContain("size.state === 'unknown'");
    expect(drape).toContain('Stock non confirmé');
    expect(drape).toContain("size.state === 'unavailable'");
  });
});

/*
 * Attente ≠ échec : pendant la vérification du prix, la fiche le DIT.
 */
describe('vérification du prix à la source', () => {
  const container = read('client/src/shop/ShopProductScreen.tsx');

  it('distingue « on vérifie » de « prix à confirmer »', () => {
    expect(container).toContain('setQuoteLoading');
    expect(component).toContain('Vérification du prix à la source');
    expect(component).toContain('priceChecking');
  });

  it('le drapeau retombe quoi qu’il arrive — jamais de rotor éternel', () => {
    expect(container).toContain('.finally(');
    expect(container).toContain('setQuoteLoading(false)');
  });

  it('aucun montant n’est affiché avant le devis serveur', () => {
    expect(container).toContain('awaitingQuote');
    expect(container).toContain('canAdd={!awaitingQuote}');
  });
});

/*
 * Défauts constatés EN PRODUCTION le 25/09/2026, sur capture du client.
 */
describe('corrections de production', () => {
  it('le rail d’actions et les flèches de galerie ne se recouvrent pas', () => {
    const rail = sheetCss.split('.s-rail {')[1].split('}')[0];
    const nav = sheetCss.split('.s-gallery-nav {')[1].split('}')[0];
    expect(rail).toContain('inset-inline-end');
    expect(nav).toContain('inset-inline-start');
  });

  it('quand la composition décline, l’image est posée sur NOTRE canvas, pas renvoyée telle quelle', () => {
    const routes = read('src/public/routes.ts');
    const card = routes.split("router.get('/media/card'")[1].split("router.get('/media/img'")[0];
    expect(card).toContain("fit: 'contain'");
    expect(card).toContain('CARD_CANVAS');
    expect(card).toContain("X-Ayrovi-Card', 'letterbox'");
    // La redirection brute reste le tout dernier recours, après le cadrage.
    expect(card.indexOf('letterbox')).toBeLessThan(card.lastIndexOf('res.redirect(302, url)'));
  });
});
