/**
 * Grande fiche — règles et contrat (réécrit le 25/10/2026).
 *
 * Ce que ces tests protègent, dans l'ordre de la maquette
 * `docs/design/cardproduit/mockup-complet-25-10.png` :
 *  • les cotes (photo 581, ligne « Taille » 49, bande grise 9, barre 71) ;
 *  • la règle « une donnée absente disparaît » : attribut vide, description
 *    vide, couleur non déclarée, taille unique ⇒ pas de bloc, pas de feuille ;
 *  • **aucun prix barré, aucune remise, aucune pastille de pourcentage** ;
 *  • la galerie (photos puis vidéo), la feuille de taille (ordre du serveur,
 *    « Dernier article » seulement quand le stock vaut 1) ;
 *  • les vignettes de couleur : la photo vient du média de la variante, jamais
 *    d'une autre couleur ;
 *  • la livraison : la date est calculée depuis le délai du CRM, jamais écrite.
 *
 * Le rendu (React Native) n'est pas monté : la mécanique et les décisions sont
 * pures, donc lisibles ici — même méthode que `reelTray.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FICHE,
  addBusinessDays,
  colorTiles,
  deliveryWindow,
  ficheSections,
  formatDay,
  galleryItems,
  hasSizeChoice,
  headerIsSolid,
  headerProgress,
  sectionIcon,
  sectionLabelKey,
  selectionReady,
  singleDimensionValue,
  singleSize,
  sizeChoices,
  sizeRows,
  specGroups,
  specRows,
} from '../src/features/product/fiche';

/** Le code, sans ses commentaires : une phrase citée dans une explication n'est
 *  pas une couleur ni une ligne d'écran. */
const code = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/** Le fichier entier, commentaires compris (pour vérifier ce qui est MONTÉ). */
const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('fiche — cotes de la maquette (720 × 1600 px ⇒ ÷ 2 en dp)', () => {
  it('la photo mesure 581 dp (1162 px) et la barre d’achat 71 dp (142 px)', () => {
    expect(FICHE.imageHeight).toBe(581);
    expect(FICHE.barHeight).toBe(71);
    expect(FICHE.rowHeight).toBe(49);
    expect(FICHE.band).toBe(9);
  });

  it('l’en-tête bascule quand la photo a quitté le haut de l’écran — pas avant', () => {
    const seuil = FICHE.imageHeight - FICHE.headerHeight;
    expect(headerIsSolid(seuil - 1)).toBe(false);
    expect(headerIsSolid(seuil)).toBe(true);
    expect(headerIsSolid(seuil + 200)).toBe(true);
    // Le dégradé couvre les 40 dp qui précèdent : aucun saut d'un pixel à l'autre.
    expect(headerProgress(seuil - 40)).toBe(0);
    expect(headerProgress(seuil)).toBe(1);
    expect(headerProgress(seuil - 20)).toBeCloseTo(0.5, 5);
  });

  it('les 12 tailles de la maquette tiennent sur un écran de 800 dp', () => {
    // 430 px de début + 12 × 96 px = 1582 px, soit 791 dp : le dernier numéro est visible.
    const debut = 215; // (430 px)
    expect(debut + 12 * FICHE.sizeRowHeight).toBeLessThanOrEqual(791);
  });
});

describe('fiche — la donnée absente disparaît', () => {
  it('un attribut sans valeur ne produit aucune ligne', () => {
    const rows = specRows([
      { key: 'material', label: 'Matière', type: 'TEXT', section: '', value: 'Coton' },
      { key: 'care', label: 'Entretien', type: 'TEXT', section: '', value: '   ' },
      { key: 'origin', label: 'Origine', type: 'TEXT', section: '', value: '' },
      { key: 'washing', label: 'Lavage', type: 'TEXT', section: '', value: '30°' },
    ]);
    expect(rows.map((row) => row.key)).toEqual(['material', 'washing']);
  });

  it('deux attributs qui partagent un libellé restent deux faits distincts', () => {
    const rows = specRows([
      { key: 'a', label: 'Taille', type: 'TEXT', section: '', value: 'M' },
      { key: 'b', label: 'Taille', type: 'TEXT', section: '', value: 'L' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.value)).toEqual(['M', 'L']);
  });

  it('les sections vides n’existent pas', () => {
    expect(ficheSections({ attributes: [], description: '  ', hasPrice: false }))
      .toEqual({ specs: false, description: false, priceDetail: false });
    expect(ficheSections({ attributes: [{ key: 'a', label: 'A', type: 'TEXT', section: '', value: '1' }], description: 'x', hasPrice: true }))
      .toEqual({ specs: true, description: true, priceDetail: true });
  });
});

describe('fiche — sections décidées par le CRM', () => {
  const a = (key: string, section: string, value: string) => ({ key, label: key, type: 'TEXT', section, value });

  it('regroupe par section, dans l’ordre convenu, et jette les sections vides', () => {
    const groups = specGroups([
      a('memory_storage', 'technique', '256 Go'),
      a('material', 'matiere', 'Coton'),
      a('warranty', 'pratique', '12 mois'),
      a('care', 'matiere', ''),
    ]);
    expect(groups.map((group) => group.section)).toEqual(['matiere', 'technique', 'pratique']);
    expect(groups[0].rows.map((row) => row.key)).toEqual(['material']);
  });

  it('une section inventée dans le CRM garde son propre bloc, et son nom vient du CRM', () => {
    // Le propriétaire peut créer une section (« matiere_bio ») : elle ne fond pas
    // dans un fourre-tout, sinon son nom n arriverait jamais à l écran.
    const groups = specGroups(
      [a('unknown_key', 'section_inventee', 'valeur'), a('niche', '', 'x')],
      { section_inventee: 'Matière recyclée' },
    );
    expect(groups).toEqual([
      { section: 'section_inventee', title: 'Matière recyclée', rows: [{ key: 'unknown_key', label: 'unknown_key', value: 'valeur' }] },
      { section: 'specs', title: null, rows: [{ key: 'niche', label: 'niche', value: 'x' }] },
    ]);
  });

  it('sans nom dans le CRM, la section retombe sur la traduction de l application', () => {
    const groups = specGroups([a('material', 'matiere', 'coton')]);
    expect(groups[0]).toMatchObject({ section: 'matiere', title: null });
  });

  it('chaque section a un libellé TRADUIT et une icône de la famille officielle', () => {
    expect(sectionLabelKey('matiere')).toBe('product.section.matiere');
    expect(sectionLabelKey('')).toBe('product.specs');
    // Ionicons : la seule famille d'icônes du projet — aucun pictogramme rapporté.
    for (const section of ['identite', 'matiere', 'mesures', 'technique', 'beaute', 'pratique', 'inconnue']) {
      expect(sectionIcon(section)).toMatch(/-outline$/);
    }
  });
});

describe('fiche — galerie (« photos puis vidéo »)', () => {
  it('photos d’abord, vidéo ensuite, sans doublon ni vide', () => {
    expect(galleryItems(['a.jpg', '', 'a.jpg', 'b.jpg'], ['v.mp4'])).toEqual([
      { kind: 'image', url: 'a.jpg' },
      { kind: 'image', url: 'b.jpg' },
      { kind: 'video', url: 'v.mp4' },
    ]);
  });

  it('sans vidéo, la galerie reste une galerie', () => {
    expect(galleryItems(['a.jpg'])).toEqual([{ kind: 'image', url: 'a.jpg' }]);
    expect(galleryItems([], [])).toEqual([]);
  });
});

describe('fiche — feuille de taille', () => {
  const dimensions = [{ key: 'size', values: [{ value: 'S', available: true, stock: 3 }, { value: 'M', available: false, stock: 0 }] }];

  it('garde l’ordre du serveur et garde les tailles épuisées visibles', () => {
    expect(sizeChoices(dimensions).map((choice) => choice.value)).toEqual(['S', 'M']);
    expect(sizeChoices(dimensions)[1].available).toBe(false);
  });

  it('aucune dimension déclarée ⇒ aucune taille inventée', () => {
    expect(sizeChoices(null)).toEqual([]);
    expect(sizeChoices([])).toEqual([]);
    expect(sizeChoices([{ key: 'color', values: [{ value: 'Noir', available: true, stock: 1 }] }])).toEqual([]);
  });

  it('« Dernier article » n’est annoncé que si le stock vaut exactement 1', () => {
    const rows = sizeRows([
      { value: '40', available: true, stock: 1 },
      { value: '41', available: true, stock: 4 },
      { value: '42', available: true, stock: null },
      { value: '43', available: false, stock: 0 },
    ]);
    expect(rows.map((row) => row.state)).toEqual(['last', null, null, null]);
  });

  it('une seule taille ⇒ ligne informative, pas de feuille', () => {
    const unique = [{ value: 'M', available: true, stock: 2 }];
    expect(singleSize(unique)).toBe('M');
    expect(hasSizeChoice(unique)).toBe(false);
    expect(hasSizeChoice([...unique, { value: 'L', available: true, stock: 1 }])).toBe(true);
    expect(singleDimensionValue([{ key: 'size', label: 'Taille', values: unique }], 'size')).toBe('M');
    expect(singleDimensionValue([{ key: 'size', label: 'Taille', values: [
      { value: 'M', available: true, stock: 1 }, { value: 'L', available: true, stock: 1 },
    ] }], 'size')).toBe('');
  });

  it('le CTA n’est armé que si le choix est complet', () => {
    expect(selectionReady(true, false, '', '')).toBe(false);
    expect(selectionReady(true, false, 'M', '')).toBe(true);
    expect(selectionReady(false, true, '', 'Noir')).toBe(true);
    expect(selectionReady(false, true, '', '')).toBe(false);
  });
});

describe('fiche — vignettes de couleur', () => {
  const dimension = {
    key: 'color' as const,
    label: 'Couleur',
    values: [
      { value: 'Gris', available: true, stock: 4 },
      { value: 'Rouge', available: false, stock: 0 },
    ],
  };

  it('la photo d’une couleur vient de SES variantes, jamais d’une autre', () => {
    const tiles = colorTiles({
      dimensions: [dimension],
      variants: [
        { id: 'v1', sku: 'A', size: '40', color: 'Gris', images: ['/media/gris.jpg'], available: true, stock: 4, reason: null },
        { id: 'v2', sku: 'B', size: '40', color: 'Rouge', images: [], available: false, stock: 0, reason: 'OUT_OF_STOCK' },
      ],
    });
    expect(tiles).toEqual([
      { color: 'Gris', available: true, image: '/media/gris.jpg' },
      { color: 'Rouge', available: false, image: null },
    ]);
  });

  it('aucun choix de couleur (0 ou 1 valeur) ⇒ aucun bloc Couleur', () => {
    expect(colorTiles({ dimensions: [dimension], variants: [] })).toHaveLength(2);
    expect(colorTiles({ dimensions: [{ ...dimension, values: [dimension.values[0]] }], variants: [] })).toEqual([]);
    expect(colorTiles(null)).toEqual([]);
  });
});

describe('fiche — livraison et retours lus dans le CRM', () => {
  const now = new Date('2026-10-25T10:00:00.000Z'); // un dimanche

  it('« 5 à 8 jours ouvrés » donne la fenêtre de la maquette (30 octobre - 04 novembre)', () => {
    expect(deliveryWindow('5 à 8 jours ouvrés', now, 'fr')).toEqual({ from: '30 octobre', to: '4 novembre' });
  });

  it('les jours ouvrés sautent le week-end, et une seule valeur donne un seul jour', () => {
    expect(addBusinessDays(now, 1).getDay()).toBe(1); // lundi
    expect(addBusinessDays(now, 5).getDay()).toBe(5); // vendredi
    expect(deliveryWindow('3 jours', now, 'fr')).toEqual({ from: '28 octobre', to: '28 octobre' });
  });

  it('sans nombre dans le réglage, aucune date n’est inventée', () => {
    expect(deliveryWindow('', now, 'fr')).toBeNull();
    expect(deliveryWindow(null, now, 'fr')).toBeNull();
    expect(deliveryWindow('bientôt', now, 'fr')).toBeNull();
  });

  it('la date se lit dans la langue de l’application', () => {
    expect(formatDay(now, 'fr')).toBe('25 octobre');
    expect(formatDay(now, 'ar')).toBe('25 أكتوبر');
  });
});

describe('fiche — contrat d’écran', () => {
  it('l’écran monte les pièces de la maquette, dans son ordre', () => {
    const screen = src('app/product/[id].tsx');
    for (const piece of ['FicheHeader', 'FichePhoto', 'FicheIdentity', 'ChoiceRow', 'ColorStrip', 'SectionRow', 'InfoRow', 'BuyBar', 'GalleryViewer', 'SizeSheet']) {
      expect(screen, piece).toContain(piece);
    }
    expect(screen).toContain('Animated.ScrollView');
    expect(screen).toContain('deliveryWindow');
  });

  it('aucun « prix conseillé », aucun prix barré, aucune remise', () => {
    for (const rel of ['app/product/[id].tsx', 'src/features/product/ProductFiche.tsx', 'src/features/product/fiche.ts']) {
      const source = code(rel);
      expect(source, rel).not.toContain('compareAtPrice');
      expect(source, rel).not.toContain('Prix conseillé');
      expect(source, rel).not.toMatch(/remise|discount|pourcentage/i);
    }
  });

  it('le CTA est NOIR (décision du propriétaire) et la fiche ne calcule aucun prix', () => {
    const parts = src('src/features/product/ProductFiche.tsx');
    // Le bouton du CTA est dessiné dans la fiche (rayon 24 dp, cote de la
    // maquette) mais sa COULEUR est celle de l encre : noir, jamais le violet
    // d action (`action`).
    expect(parts).toContain('backgroundColor: pressed ? theme.colors.secondary : theme.colors.ink');
    expect(parts).not.toMatch(/theme\.colors\.action\b/);
    expect(parts).not.toMatch(/tone="main"/);
    const screen = src('app/product/[id].tsx');
    // Le total est celui du serveur, jamais une somme locale.
    expect(screen).toContain('product.finalPrice.toFixed(2)');
    expect(screen).not.toMatch(/finalPrice\s*\+|customsFee\s*\+/);
  });

  it('la vidéo vient du serveur et la galerie lit bien les deux listes', () => {
    const screen = src('app/product/[id].tsx');
    expect(screen).toContain('sheet?.videos');
    expect(screen).toContain('galleryItems(images');
  });

  /**
   * LA MÉCANIQUE DE LA PLANCHE `docs/design/bigcard/mockup-sticky-24-10.png` :
   * « الصورة ثابتة والورقة تتحرك » — la photo ne défile pas, la feuille blanche
   * monte par-dessus, l'en-tête passe de transparent à blanc quand elle arrive,
   * et la barre d'achat ne bouge jamais.
   */
  it('la photo est ÉPINGLÉE et la feuille glisse par-dessus', () => {
    const fiche = src('src/features/product/ProductFiche.tsx');
    // Une couche fixe en haut de l'écran, de la hauteur exacte de la photo.
    expect(fiche).toContain('pinnedPhoto: { position: \'absolute\', top: 0, start: 0, end: 0, height: FICHE.imageHeight }');
    expect(fiche).toContain('export function FichePhotoLayer');
    // La couche est inerte au toucher : l'appui passe à la fenêtre de la feuille.
    expect(fiche).toContain('pointerEvents="none"');

    const screen = src('app/product/[id].tsx');
    // La photo n'est PLUS dans le flux du défilement…
    expect(screen).toContain('<FichePhotoLayer');
    expect(screen).not.toMatch(/<FichePhoto\s/);
    // …la feuille réserve la fenêtre de la photo, puis monte par-dessus.
    expect(screen).toContain('photoWindow: { height: FICHE.imageHeight }');
    expect(screen).toContain('styles.photoWindow');
    expect(screen).toContain('product-photo-window');
  });

  it('l’en-tête devient blanc exactement quand la feuille atteint le haut', () => {
    // Le seuil est la hauteur de photo MOINS la hauteur d'en-tête : au-delà, la
    // feuille est sous l'en-tête, il n'y a plus de photo derrière lui.
    expect(headerIsSolid(FICHE.imageHeight - FICHE.headerHeight - 1)).toBe(false);
    expect(headerIsSolid(FICHE.imageHeight - FICHE.headerHeight)).toBe(true);
    // La fenêtre de photo est plus haute que l'en-tête, sinon il n'y aurait
    // jamais de photo derrière un en-tête transparent.
    expect(FICHE.imageHeight).toBeGreaterThan(FICHE.headerHeight);
    const fiche = src('src/features/product/ProductFiche.tsx');
    expect(fiche).toContain('borderBottomWidth: FICHE.headerRule');
    expect(fiche).toContain('opacity: solid');
  });

  it('la barre d’achat est FIXE (elle ne défile pas)', () => {
    const fiche = src('src/features/product/ProductFiche.tsx');
    expect(fiche).toContain('buyBar: { position: \'absolute\', start: 0, end: 0, bottom: 0 }');
    const screen = src('app/product/[id].tsx');
    // Elle est rendue HORS du ScrollView (après sa fermeture).
    const afterScroll = screen.slice(screen.indexOf('</Animated.ScrollView>'));
    expect(afterScroll).toContain('<BuyBar');
    // Et la page réserve sa hauteur en bas du contenu.
    expect(screen).toContain('paddingBottom: FICHE.ctaHeight + insets.bottom');
  });
});
