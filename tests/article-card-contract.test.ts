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

  it('la photo est carrée et tient dans la hauteur utile de la carte', () => {
    expect(SHARED.thumb).toBeLessThanOrEqual(SHARED.height - 2 * SHARED.padding);
    // `contain` dans la maquette : on ne rogne jamais le produit pour remplir le carré.
    expect(css).toContain('object-fit:contain');
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
