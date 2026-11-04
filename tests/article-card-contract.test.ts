/**
 * Contrat de la carte « article » — trois rendus, UN seul jeu de cotes.
 *
 * Décision du 24/10/2026 : module retenu = **la carte entière est pressable**,
 * sans bouton « Découvrir ». Elle apparaît à trois endroits :
 *   1. la maquette `docs/design/reel/assets/card.css` (HTML de référence) ;
 *   2. `shared/articleCard.ts` (source des cotes côté serveur/admin) ;
 *   3. `apps/mobile/src/design/articleCard.ts` (React Native — Metro ne lit pas `shared/`).
 *
 * Sans ce test, la troisième copie dérive en silence et l'aperçu du back-office
 * se remet à mentir sur ce que l'application affiche. C'est exactement l'écart
 * qu'on vient de corriger (44 px / 56 px / 118 px pour la même photo).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ARTICLE_CARD as SHARED } from '../shared/articleCard';

/* Vitest exécute depuis la racine du dépôt (module commun : pas d'`import.meta`). */
const at = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const css = at('docs/design/reel/assets/card.css');
const admin = at('client/src/admin/ProductIntegration.tsx');
const mobileCard = at('apps/mobile/src/features/shopping/LinkedProductCard.tsx');
const mobileTokens = at('apps/mobile/src/design/articleCard.ts');

/**
 * Le paquet Expo a son propre `tsconfig` (hérité de `expo/tsconfig.base`), que la
 * suite racine ne sait pas charger : on lit donc les nombres de la copie native
 * comme on lit ceux de la feuille CSS — par valeur, pas par import.
 */
function mobileNumber(name: keyof typeof SHARED): number {
  const match = mobileTokens.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
  if (!match) throw new Error(`${name} absente de apps/mobile/src/design/articleCard.ts`);
  return Number(match[1]);
}

/** Lit une variable de la feuille de la maquette (source visuelle de référence). */
function cssNumber(name: string): number {
  const match = css.match(new RegExp(`--${name}:\\s*(\\d+)px`));
  if (!match) throw new Error(`--${name} absente de card.css`);
  return Number(match[1]);
}

describe('carte article — cotes canoniques', () => {
  it('la maquette CSS, le contrat partagé et le rendu natif disent la même chose', () => {
    expect(cssNumber('card-w')).toBe(SHARED.width);
    expect(cssNumber('card-h')).toBe(SHARED.height);
    expect(cssNumber('card-r')).toBe(SHARED.radius);
    expect(cssNumber('card-pad')).toBe(SHARED.padding);
    expect(cssNumber('thumb')).toBe(SHARED.thumb);
    expect(cssNumber('thumb-r')).toBe(SHARED.thumbRadius);
    expect(cssNumber('brand')).toBe(SHARED.brandSize);
    expect(cssNumber('title')).toBe(SHARED.titleSize);
    expect(cssNumber('price')).toBe(SHARED.priceSize);
    expect(cssNumber('fav')).toBe(SHARED.favourite);

    // La copie React Native est identique, champ par champ.
    for (const key of Object.keys(SHARED) as Array<keyof typeof SHARED>) {
      expect(mobileNumber(key), `apps/mobile/src/design/articleCard.ts → ${key}`).toBe(SHARED[key]);
    }
  });

  it('la photo est une bande rectangulaire pleine hauteur (30 % de la largeur)', () => {
    expect(SHARED.padding).toBe(0);
    expect(SHARED.thumb).toBe(Math.round(SHARED.width * 0.3));
    expect(SHARED.thumbRadius).toBe(0);
    // `contain` dans la maquette : on ne rogne jamais le produit pour remplir la bande.
    expect(css).toContain('object-fit:contain');
  });

  it('aucune bordure, aucun ombre portée : la carte flotte sur la vidéo', () => {
    expect(css).not.toMatch(/border:\s*1px solid/);
    expect(css).not.toMatch(/box-shadow/);
    expect(mobileCard).not.toMatch(/borderWidth/);
    expect(mobileCard).not.toMatch(/shadow(Color|Offset|Opacity|Radius)/);
  });

  it('les cotes canoniques sont celles du modèle mesuré, pas une invention', () => {
    // Modèle : 664×303 px sur un écran de 720 (360 dp). À 390 dp la carte vaut
    // 362 (écran − 12 de marge − 9 d'amorce − 7 d'écart).
    expect(SHARED.width).toBe(362);
    expect(SHARED.height).toBe(165);
    expect(SHARED.thumb).toBe(109);
  });

  it('les proportions sont celles du modèle mesuré (663×303 px ⇒ 0.457)', () => {
    const ratio = SHARED.height / SHARED.width;
    expect(Math.abs(ratio - 663 / 303 / (663 / 303))).toBeLessThan(1); // garde-fou
    expect(Math.abs(ratio - 303 / 663)).toBeLessThan(0.005);
    // Le rayon suit la même proportion (20 px sur 663 ⇒ 3 %).
    expect(Math.abs(SHARED.radius / SHARED.width - 20 / 663)).toBeLessThan(0.005);
  });
});

describe('carte article — taille fluide (correction du 24/10/2026, le soir)', () => {
  /**
   * Le défaut signalé sur l'appareil : une carte de 300 dp au milieu d'un écran
   * de 360, là où le modèle en fait 332 et va d'un bord à l'autre. Ces tests
   * fixent la taille **mesurée** pour que la dérive ne revienne pas.
   */
  it('sur un écran de 360 dp, on retrouve la mesure du modèle au pixel', async () => {
    const { articleCardSize } = await import('../shared/articleCard');
    // 24 px de marge + 664 px de carte + 13 d'écart + 19 d'amorce = 720 px.
    expect(articleCardSize(360)).toEqual({ width: 332, height: 151, thumb: 100 });
  });

  it('à 390 dp, exactement les cotes canoniques', async () => {
    const { articleCardSize } = await import('../shared/articleCard');
    expect(articleCardSize(390)).toEqual({ width: 362, height: 165, thumb: 109 });
  });

  it('bornes : petit téléphone et tablette ne déforment pas la carte', async () => {
    const { articleCardSize, ARTICLE_CARD } = await import('../shared/articleCard');
    expect(articleCardSize(260).width).toBe(240); // jamais moins de 240
    expect(articleCardSize(1024).width).toBe(ARTICLE_CARD.maxWidth); // jamais plus de 420
  });

  it('le rendu natif calcule la largeur au lieu de la figer', () => {
    expect(mobileTokens).toContain('export function articleCardSize');
    expect(mobileCard).toContain('articleCardSize(viewport)');
    expect(mobileCard).not.toMatch(/width:\s*ARTICLE_CARD\.width/);
  });
});

describe('carte article — une seule action', () => {
  it('aucun bouton « Découvrir » ne subsiste dans les deux rendus de production', () => {
    expect(admin).not.toMatch(/Découvrir/);
    expect(mobileCard).not.toMatch(/>\s*Découvrir|label=\{t\('shopping\.discover'\)\}/);
  });

  it('le rendu natif est une Pressable qui porte le rôle bouton', () => {
    expect(mobileCard).toContain('<Pressable');
    expect(mobileCard).toContain('accessibilityRole="button"');
  });

  it('l’aperçu du back-office utilise les cotes partagées, pas des nombres locaux', () => {
    expect(admin).toContain("from '../../../shared/articleCard'");
    expect(admin).toContain('ARTICLE_CARD.height');
    expect(admin).toContain('ARTICLE_CARD.thumb');
  });
});

describe('carte article — ce qui s’affiche quand la donnée manque', () => {
  it('sans nom, aucune carte', async () => {
    const { articleCardVisibility } = await import('../shared/articleCard');
    expect(articleCardVisibility({ name: '   ' }).render).toBe(false);
  });

  it('sans prix, aucun montant — jamais un « — » ni un prix recalculé', async () => {
    const { articleCardVisibility } = await import('../shared/articleCard');
    for (const price of [0, -3, null, undefined, Number.NaN]) {
      expect(articleCardVisibility({ name: 'Pull', price: price as number }).price).toBeNull();
    }
  });

  it('disponibilité : seul un false explicite s’écrit ; inconnu ne s’affirme pas', async () => {
    const { articleCardVisibility } = await import('../shared/articleCard');
    expect(articleCardVisibility({ name: 'Pull', available: null }).unavailable).toBe(false);
    expect(articleCardVisibility({ name: 'Pull', available: undefined }).unavailable).toBe(false);
    expect(articleCardVisibility({ name: 'Pull', available: true }).unavailable).toBe(false);
    expect(articleCardVisibility({ name: 'Pull', available: false }).unavailable).toBe(true);
  });

  it('le prix porte la devise du serveur et deux décimales', async () => {
    const { articleCardVisibility } = await import('../shared/articleCard');
    expect(articleCardVisibility({ name: 'Pull', price: 149, currency: 'TND' }).price).toBe('149.00 TND');
    expect(articleCardVisibility({ name: 'Pull', price: 27.99, currency: null }).price).toBe('27.99 TND');
    expect(articleCardVisibility({ name: 'Pull', price: 12, brand: '  Bershka ' }).brand).toBe('Bershka');
  });
});
