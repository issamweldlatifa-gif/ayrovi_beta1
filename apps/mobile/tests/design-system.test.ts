/**
 * ZAYROVI — verrou d'application du Design System (mobile).
 *
 * ── Ce que ce fichier est ────────────────────────────────────────────────────
 * La traduction en CODE du §17 (anti-patrons) et du §21.2 (empêcher la
 * construction d'une interface hors système). Sans lui, `DESIGN_SYSTEM.md`
 * reste un PDF que rien ne fait respecter — la documentation le dit
 * elle-même : « sans ces tests, la spécification reste un vœu pieux ».
 *
 * ── Pourquoi un seuil à ZÉRO et pas un « ratchet » ───────────────────────────
 * Le verrou web (`tests/design-tokens.test.ts`) fonctionne au ratchet : il
 * plafonne une dette existante qu'il ne peut pas rembourser d'un coup. Ici,
 * la dette a d'abord été REMBOURSÉE (18 couleurs littérales → 0, 78 valeurs
 * d'espacement hors échelle → 0), mesurée avant d'être vérifiée. Le test
 * peut donc exiger zéro, et c'est bien plus solide : un ratchet autorise à
 * rester aussi mauvais qu'hier, zéro oblige à rester propre.
 *
 * ── Ce test ne juge pas le goût ──────────────────────────────────────────────
 * Il ne vérifie pas qu'une couleur est « jolie ». Il vérifie qu'aucune valeur
 * n'est écrite en dur là où un jeton existe. C'est vérifiable, contrairement
 * à une opinion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

/**
 * ⚠️ On n'importe PAS `tokens.mobile` : il importe `react-native`, que Vitest
 * ne sait pas transformer (syntaxe Flow). Importer le module ferait échouer
 * tout le fichier de test avant même la première assertion.
 *
 * On lit donc la valeur dans la source. Ce n'est pas un pis-aller : le test
 * vérifie ainsi le FICHIER que le développeur édite, pas un artefact
 * retraduit — et cela garde une source unique sans dépendance native.
 */
function tokenFileNumbers(exportName: string): number[] {
  const raw = fs.readFileSync(path.join(ROOT, 'src/design/tokens.mobile.ts'), 'utf8');
  const match = new RegExp(`export const ${exportName} = \\[([^\\]]*)\\]`).exec(raw);
  if (!match) throw new Error(`Jeton ${exportName} introuvable dans tokens.mobile.ts`);
  return match[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
}

/** Marches ajoutées à l'échelle de l'identité (mesurées, voir tokens.mobile). */
const SPACE_EXTENDED = tokenFileNumbers('SPACE_EXTENDED');

/** Là où les valeurs ont le DROIT d'être littérales : c'est leur définition. */
const TOKEN_FILES = new Set([
  'src/design/tokens.generated.ts', // généré depuis brand.json + identity.json
  'src/design/tokens.mobile.ts', // jetons propres au natif
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = [...sources('app'), ...sources('src')];

/** Le code, sans ses commentaires : une couleur citée dans une explication
 *  n'est pas une couleur utilisée. */
function code(rel: string): string {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Palette de glyphes d'Ionicons, lue dans le paquet installé. C'est la seule
 * source qui dise « ceci est un nom d'icône » sans heuristique fragile.
 */
const GLYPHS: Set<string> = (() => {
  const file = path.join(
    ROOT,
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
  );
  return new Set(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>));
})();

/** Échelle d'espacement admise : celle de l'identité, complétée (et mesurée). */
const SPACE_SCALE = new Set<number>([0, 1, 4, 8, 12, 16, 24, 32, 48, 64, 96, ...SPACE_EXTENDED]);

const SPACING_PROPS =
  '(?:padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingStart|paddingEnd|' +
  'paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|' +
  'marginStart|marginEnd|marginHorizontal|marginVertical|gap|rowGap|columnGap)';

describe('Design System — aucune valeur en dur là où un jeton existe', () => {
  it('aucune couleur littérale hors des fichiers de jetons', () => {
    /**
     * Modules de DONNÉES, pas de design : `optionColour.ts` traduit un nom de
     * couleur publié par le marchand (« Royal Blue ») en pastille, quand aucune
     * photo de produit n'existe. Ces teintes ne peignent jamais un bouton, un
     * fond ou un texte — le design system reste la seule source pour l'UI.
     */
    const DATA_COLOUR_MODULES = new Set(['src/features/aywebs/optionColour.ts']);
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel) || DATA_COLOUR_MODULES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Toute couleur doit venir de `theme.colors` — voir DESIGN_SYSTEM.md §2 et §17.',
    ).toEqual([]);
  });

  /**
   * Les voiles `rgba(0,0,0,x)` / `rgba(255,255,255,x)` étaient éparpillés dans
   * une dizaine d'écrans (17 occurrences, 12 opacités différentes). Ils passent
   * désormais par `veil(opacité)` / `frost(opacité)` de `tokens.mobile.ts` : la
   * couleur vient de la marque, seule l'opacité reste un choix local.
   *
   * Exception : `heroPalette.ts`, module de CALCUL de couleur (il fabrique un
   * `rgba(...)` à partir d'une couleur extraite d'image) — ce n'est pas une
   * couleur de design écrite à la main.
   */
  it('aucun voile `rgb()/rgba()` littéral hors des fichiers de jetons', () => {
    const CALCULATION_MODULES = new Set(['src/features/home/heroPalette.ts']);
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel) || CALCULATION_MODULES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(offenders, 'Utiliser `veil(opacité)` ou `frost(opacité)` de tokens.mobile.ts.').toEqual([]);
  });

  it('aucun espacement hors échelle', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      const re = new RegExp(`${SPACING_PROPS}:\\s*(-?\\d+)\\b`, 'g');
      for (const match of text.matchAll(re)) {
        const value = Number(match[1]);
        if (SPACE_SCALE.has(value)) continue;
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(offenders, `Échelle admise : ${[...SPACE_SCALE].sort((a, b) => a - b).join(', ')}`).toEqual([]);
  });

  /**
   * §17 : « pas de `absolute` sauf pour une vraie superposition ». La seule
   * superposition légitime est l'en-tête transparent, et elle est implémentée
   * UNE fois dans `AppScreen`. Ailleurs, un `absolute` est un positionnement
   * qu'on n'a pas su faire dans le flux — et c'est lui qui casse sur les
   * appareils qu'on n'a pas testés.
   */
  it('aucun `position: absolute` hors des superpositions autorisées', () => {
    /**
     * §17 n'interdit pas `absolute` : il interdit de s'en servir pour POSER
     * un élément qu'on n'a pas su placer dans le flux. Une vraie superposition
     * (un badge sur une image, un voile, un en-tête transparent) est légitime.
     *
     * Comme « vraie superposition » ne se vérifie pas automatiquement, la
     * liste est EXPLICITE et chaque entrée porte sa raison. Ce n'est pas une
     * dérogation qu'on cache : c'est un inventaire qu'on relit. Ajouter une
     * ligne ici doit se justifier — c'est là que se joue la dérive.
     */
    const ALLOWED = new Set([
      'src/design/layout.tsx', // `AppScreen.overlayHeader` — la superposition de référence
      'src/design/ui.tsx', // le tiroir : panneau au-dessus du contenu
      'src/features/shell/AppHeader.tsx', // en-tête transparent sous lequel défile la page
      'app/(tabs)/_layout.tsx', // barre d'onglets flottante transparente à angles arrondis sous laquelle défile la page
      'app/aywebs/browser.tsx', // AYWEBs : voile de chargement posé au-dessus de la page du magasin (WebView)
      'src/features/sections/PromotionCard.tsx', // badge de réduction posé sur la vignette
      'src/features/social/ReelCard.tsx', // durée posée sur la vignette vidéo
      'src/features/shopping/LinkedProductCard.tsx', // pastille favori posée dans l'angle de la carte article
      'src/features/aywebs/AyWebsHomeContent.tsx', // cœur posé dans l'angle de la grande carte boutique (même motif que la carte article)
      'src/features/aywebs/StoresContent.tsx', // cœur posé SUR le visuel 3:4 de la carte boutique (pastille qui reste lisible sur tout logo)
      'src/features/aywebs/VariantOptionChips.tsx', // coche posée SUR la pastille de couleur (elle ne doit pas décaler le libellé)
      'src/features/reels/ReelShopTray.tsx', // tiroir « articles » qui sort PAR-DESSUS la vidéo du Reel + bouton posé sur le média (le Reel continue de tourner dessous)
      'src/features/social/StoryViewer.tsx', // zones de tape + pied, au-dessus du média
      'src/features/home/HeroCarousel.tsx', // couches de fond (le fond de chaque photo) et voile du titre (§5.4)
      'app/reels-viewer.tsx', // en-tête transparent FIXE au-dessus de la liste plein écran (Reels)
      'src/design/sheet/AppSheet.tsx', // درج موحّد: الورقة والظل فوق المحتوى (إيماءة سحب، بلا Modal)
      'src/design/sheet/SheetBackdrop.tsx', // الظل الخلفي للدرج، يغطي الشاشة تحت الورقة
      'app/lens.tsx', // caméra plein écran : commandes, cadre et feuille au-dessus du flux vidéo
      'src/features/lens/LensProductView.tsx', // galerie : en-tête fixe, badges et aide zoom au-dessus des images
      'src/features/lens/LensResultCard.tsx', // badge promo et favori posés sur la vignette produit
      'src/features/lens/LensSelectionView.tsx', // Z Lens : photo, voile, cadre de sélection et points posés les uns sur les autres
      'src/features/lens/LensLiveOverlay.tsx', // Z Lens Live : cadre et points posés sur l'aperçu caméra plein écran
      'src/features/lens/LensMenu.tsx', // menu ⋮ flottant au-dessus de la caméra, sous son bouton
      'src/features/lens/LensGalleryViewer.tsx', // visionneuse plein écran : photo, voile noir, chrome et compteur au-dessus
      'src/features/lens/LensSizeGuide.tsx', // guide des tailles : feuille modale au-dessus de la fiche
      'src/features/lens/LensSearchRing.tsx', // Z Lens : couronne de points et balayage posés sur le cadre, au-dessus de la photo
      'src/features/product/ProductFiche.tsx', // grande fiche : photo FIXE derrière la feuille qui monte, en-tête et barre d'achat posés dessus (planche mockup-sticky)
    ]);
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (ALLOWED.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/position:\s*['"]absolute['"]/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      'Un `absolute` ailleurs que dans une superposition est un positionnement ' +
        'qu’on n’a pas su faire dans le flux (§17).',
    ).toEqual([]);
  });

  /**
   * 17/10/2026 — consigne client : « استعمال مكثف للون رمادي » (trop de gris).
   * Les écrans Lens ne peignent PLUS de fond gris (`infoSoft`) : cartes,
   * pastilles de couleur et résumés de choix sont BLANCS, le gris reste aux
   * filets (`line`, `lineControl`) et aux textes secondaires — soit bien moins
   * de 2 % de la surface. Verrouillé pour ne pas y revenir.
   */
  /**
   * 17/10/2026 — décision client n° 1, application entière : « les fonds gris
   * sont remplacés par du blanc, sauf les filets qui séparent les sections ».
   * Le gris clair ne survit QUE dans le squelette de chargement (un bloc blanc
   * n'existerait pas à l'écran) ; partout ailleurs c'est du blanc + un filet.
   */
  it('décision n° 1 : plus aucun fond gris, du blanc et des filets', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const match of text.matchAll(/backgroundColor: theme\.colors\.(infoSoft|divider)/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} ${match[0]}`);
      }
    }
    expect(offenders, 'Un fond gris subsiste : passer la surface en `theme.colors.surface` (blanc) et séparer par un filet.').toEqual([]);

    // Le seul aplat gris toléré : le squelette de chargement, et lui seul.
    const skeletonTolerant = new Set(['src/features/lens/LensSearchSkeleton.tsx']);
    const grey: string[] = [];
    for (const rel of FILES) {
      if (skeletonTolerant.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/LENS_COLORS\.skeleton/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        grey.push(`${rel}:${line}`);
      }
    }
    expect(grey, 'Le gris clair est réservé au squelette de chargement.').toEqual([]);
  });

  it('aucun fond gris dans les écrans Lens : du blanc, le gris reste un filet', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (!rel.startsWith('src/features/lens/')) continue;
      const text = code(rel);
      for (const match of text.matchAll(/infoSoft/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, 'Le gris de fond est réservé aux filets : passer la surface en `theme.colors.surface`.').toEqual([]);
  });

  /**
   * Même consigne, autre conséquence : plus de PASTILLE (rond clair) autour
   * d'une icône posée sur une image. L'icône est nue, lisible par son ombre de
   * glyphe. Un rond `frost(...)` + `borderRadius` servant de conteneur
   * d'icône est ce que le client a demandé de retirer.
   */
  it('aucune pastille blanche servant de conteneur d’icône', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      // Un bloc de style = une pastille quand il cumule un fond givré ET un
      // rayon de rond/pilule : c'est exactement le conteneur retiré le
      // 17/10/2026. Un voile sans rayon (fondu de la photo) reste légitime.
      for (const match of text.matchAll(/\{([^{}]*)\}/g)) {
        const block = match[1];
        if (!/backgroundColor:\s*frost\(/.test(block)) continue;
        const radius = /borderRadius:\s*(\d+(?:\.\d+)?)/.exec(block);
        if (!radius || Number(radius[1]) < 16) continue;
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, 'Poser l’icône à même le média (ombre de glyphe) au lieu d’une pastille rapportée.').toEqual([]);
  });

  /**
   * §4.3 : la zone sûre se règle UNE fois, dans `AppScreen`. Une marge basse
   * arbitraire pour « faire passer » sur un appareil est l'anti-patron que la
   * consigne interdit nommément.
   */
  it('aucune marge basse arbitraire censée compenser un appareil', () => {
    /**
     * Portée volontairement LIMITÉE AUX ÉCRANS (`app/**`) :
     *
     * un composant (`src/features/**`) a parfaitement le droit de définir sa
     * propre marge interne — le pied de page, par exemple. Ce qui est interdit,
     * c'est un ÉCRAN qui calcule la sienne : c'est le rôle d'`AppScreen`
     * (§4.3), et c'est ainsi qu'on a fini avec 23 écrans sur 35 sans zone sûre.
     *
     * Seuil à 30 : en dessous, une marge basse est un choix de composition ;
     * au-dessus, c'est presque toujours une tentative de « faire passer » le
     * contenu au-dessus d'un bec ou d'une barre gestuelle.
     */
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (!rel.startsWith('app/') || TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/paddingBottom:\s*(?:insets\.bottom\s*\+\s*)?(\d{2,3})\b/g)) {
        if (match[0].includes('insets.bottom')) continue; // calculé : légitime
        if (Number(match[1]) < 30) continue;
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Un écran ne calcule pas sa marge basse : c’est le rôle d’`AppScreen` ' +
        '(§4.3). Migrer l’écran plutôt que poser un nombre (§17).',
    ).toEqual([]);
  });
});

describe('Design System — contrat sémantique des couleurs (§2.10)', () => {
  /**
   * Rappel du contrat, parce qu'un test qui ne dit pas sa raison devient
   * arbitraire à la première pression :
   *
   *   🟡 warning = avertissement   🔴 danger = erreur/danger
   *   🟣 info    = information / état actif (violet lisible)
   *   🟢 success = succès
   *   🟣 accent / action / focus = MARQUE + action principale + élément actif,
   *      jamais un succès, une erreur ou un avertissement
   *   ⬛⬜ noir / blanc / gris = structure, ne signale rien
   */
  const usage = (token: string) => {
    let count = 0;
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      const re = new RegExp(`theme\\.colors\\.${token}\\b`, 'g');
      count += (text.match(re) ?? []).length;
    }
    return count;
  };

  const occurrences = (pattern: RegExp) => {
    let count = 0;
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      count += (code(rel).match(pattern) ?? []).length;
    }
    return count;
  };

  const statusUsage = () => occurrences(/theme\.status\.\w+\.\w+/g);

  /**
   * Budget de VIOLET. ⚠️ HONNÊTETÉ : c'est un PROXY, pas la vraie mesure.
   *
   * L'identité vise ≈ 10 % de violet à l'écran. Compter des références dans le
   * code n'est pas mesurer une surface : un CTA pleine largeur compte pour une
   * référence et couvre plus que dix icônes actives. Mesurer une surface exige
   * un rendu, qu'on n'a pas ici.
   *
   * Ce test fait donc ce qu'un test peut faire : il interdit la DÉRIVE (le
   * plafond ne peut pas monter sans décision) et il documente la cible. La
   * vérification réelle reste un contrôle visuel sur appareil (§19).
   *
   * 64 = mesuré le 15/10/2026 après la bascule (accent 8 · accentText 19 ·
   * action 13 · actionHover 3 · focus 5 · accentOnMedia 2 · LENS active 4 ·
   * status.info 10).
   */
  const VIOLET_BUDGET = 64;

  it('le budget violet ne dérive pas (proxy — la vraie mesure est visuelle)', () => {
    const violet = ['accent', 'accentText', 'action', 'actionHover', 'focus', 'accentOnMedia']
      .reduce((sum, token) => sum + usage(token), 0)
      + occurrences(/LENS_COLORS\.active\b/g)
      + occurrences(/theme\.status\.info\.\w+/g);
    expect(
      violet,
      `Budget violet dépassé : ${violet} > ${VIOLET_BUDGET}. Le violet est réservé aux ` +
        'actions principales, aux liens importants, aux éléments actifs et au focus (§2.10).',
    ).toBeLessThanOrEqual(VIOLET_BUDGET);
  });

  /**
   * La règle la plus mécaniquement vérifiable du contrat : un élément annoncé
   * comme alerte au lecteur d’écran n’est JAMAIS de la marque. Un succès, une
   * erreur ou un avertissement ne se peint pas en violet.
   */
  it('aucun élément `alert` peint aux couleurs de la marque', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(
        /accessibilityRole="alert"[^>]{0,400}?theme\.colors\.(?:accent|action|focus)\w*/g,
      )) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      'Une alerte est un ÉTAT (succès / erreur / avertissement), jamais une ' +
        'marque. Utiliser `theme.status.*` (§2.10.2).',
    ).toEqual([]);
  });

  it('les couleurs de statut sont réellement employées', () => {
    /**
     * Avant la palette fonctionnelle, `info` et `success` n’étaient utilisés
     * NULLE PART : l’interface ne savait dire que « couleur de marque » ou
     * « rouge pâle ». Ce test empêche de revenir à ce mono-langage.
     */
    expect(statusUsage(), 'Aucune couleur de statut utilisée — l’interface redevient muette.')
      .toBeGreaterThan(0);
  });

  it('les teintes pâles de l’identité ne servent plus de signal', () => {
    /**
     * `colors.danger` (#FFABAB en sombre), `colors.info` (un GRIS) et
     * `colors.success` (#90D6AF en sombre) sont des teintes pâles de palette.
     * En signalétique mobile elles sont illisibles : `theme.status.*` les remplace.
     */
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/theme\.colors\.(danger|info|success)\b/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Ces teintes sont trop pâles pour un signal mobile. Utiliser ' +
        '`theme.status.<état>.fg` (§2.10.4).',
    ).toEqual([]);
  });
});

describe('Design System — cohérence des jetons', () => {
  /**
   * L'échelle étendue ne doit PAS contenir une marche déjà définie par
   * l'identité : deux définitions de la même valeur, c'est exactement la
   * duplication que §22 interdit.
   */
  it('l’échelle complétée n’entre pas en conflit avec l’identité', () => {
    const identity = [4, 8, 12, 16, 24, 32, 48, 64, 96];
    const clash = SPACE_EXTENDED.filter((value) => identity.includes(value));
    expect(clash, 'Une marche déjà définie par l’identité ne doit pas être redéfinie.').toEqual([]);
  });

  it('l’échelle complétée est triée et sans doublon', () => {
    const sorted = [...SPACE_EXTENDED].sort((a, b) => a - b);
    expect([...SPACE_EXTENDED]).toEqual(sorted);
    expect(new Set(SPACE_EXTENDED).size).toBe(SPACE_EXTENDED.length);
  });
});

/**
 * ── Audit du 27/10/2026 : ce que le verrou ne voyait pas ─────────────────────
 *
 * Le verrou d'origine contrôlait les COULEURS et l'ESPACEMENT. Il laissait
 * passer quatre familles entières de valeurs, et c'est exactement là que la
 * dérive s'était installée :
 *
 *   • 9 tailles de texte littérales (11, 15, 16, 17, 19) dont quatre hors
 *     échelle — la fiche produit écrivait sa marque en 19 pt et son titre en
 *     17 pt, la carte de résultat sa marque en 15 pt : trois hiérarchies
 *     différentes pour le même couple marque/titre ;
 *   • 46 rayons littéraux (2, 3, 4, 8, 9, 10, 12, 14, 16, 18, 19, 21, 24, 26,
 *     28, 34, 36, 999) alors que `RADIUS` existe de xs à full ;
 *   • 9 interlignes et 4 interlettrages littéraux, tous contraires au ratio de
 *     l'identité (1.4 corps / 1.18 titre) et au `letterSpacing: 0em` ;
 *   • 68 tailles d'icônes sur 19 valeurs distinctes (11 → 64) et des glyphes
 *     pleins employés comme des icônes de contenu (`search`, `add`, `remove`).
 *
 * Ce bloc ferme les quatre portes, avec une seule tolérance GÉOMÉTRIQUE
 * vérifiable : un `borderRadius` numérique n'est accepté que s'il vaut la
 * moitié d'une cote déclarée dans le MÊME bloc de style (cercle parfait,
 * poignée de feuille). Ce n'est pas une exception de confort : c'est une
 * relation qu'on peut recalculer, donc une règle et non une dérogation.
 */
describe('Design System — typographie, rayons, icônes (audit 27/10/2026)', () => {
  /**
   * Une graisse n'est pas un nombre : chaque graisse est une FAMILLE .ttf
   * embarquée (`FONTS.latin.semibold`, etc.). Un `fontWeight: '600'` est
   * ignoré en silence par Android et n'a aucun effet sur iOS avec des
   * fichiers séparés. Interdit hors du thème, qui pose `'normal'` exprès.
   */
  it('aucune graisse numérique : chaque graisse est une famille', () => {
    /**
     * `theme.tsx` est la DÉFINITION du texte : c'est lui qui pose
     * `fontWeight: 'normal'` pour neutraliser la graisse synthétique du
     * système (les vraies graisses sont des familles). Ce n'est pas une
     * infraction — c'est la règle elle-même, écrite une fois.
     */
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel) || rel === 'src/design/theme.tsx') continue;
      const text = code(rel);
      for (const match of text.matchAll(/fontWeight:/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, 'Utiliser `theme.text(variant, weight)` : la graisse choisit la famille (§3).').toEqual([]);
  });

  /** Toute taille de texte vient de `TYPE_SCALE` via `theme.text()` / `<AppText variant>`. */
  it('aucune taille de texte littérale', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/fontSize:\s*-?\d+(?:\.\d+)?/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Échelle admise : 12 caption · 14 label · 16 body · 18 lead · 28 title · 40 display. ' +
        'Passer par `<AppText variant>` (ou `theme.text(variant)`).',
    ).toEqual([]);
  });

  /**
   * Interligne : le ratio de l'identité, pas une valeur posée au cas par cas
   * (1.4 corps / 1.18 titre ; 1.55 / 1.42 en arabe). C'est le seul endroit où
   * une cote de maquette reste littérale : la carte « article » est comparée
   * à `shared/articleCard.ts` ET à la maquette CSS par
   * `article-card-contract.test.ts` — ses trois interlignes font partie du
   * contrat, on ne les rejoue pas ici.
   */
  it('aucun interligne littéral (hors carte article, figée par contrat)', () => {
    const PINNED = new Set(['src/features/shopping/LinkedProductCard.tsx']);
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel) || PINNED.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/lineHeight:\s*-?\d+(?:\.\d+)?/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(offenders, 'L’interligne vient de `theme.text()` : ratio 1.4 (corps) / 1.18 (titre) (§3).').toEqual([]);
  });

  /**
   * Interlettrage : `TYPOGRAPHY.letterSpacing` vaut `0em` dans l'identité.
   * Les quatre valeurs trouvées (1, 1, 2, -0.1) étaient des signatures
   * typographiques inventées écran par écran — le mot-symbole, lui, est une
   * IMAGE, il n'a pas besoin d'être « resserré ».
   */
  it('aucun interlettrage local : l’identité impose 0em', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(/letterSpacing:/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, '`TYPOGRAPHY.letterSpacing = 0em` : retirer l’interlettrage local.').toEqual([]);
  });

  /**
   * Rayon : soit un jeton (`theme.radius.*` / `RADIUS.*`), soit une relation
   * GÉOMÉTRIQUE recalculable — un cercle ou une poignée, c'est-à-dire un
   * rayon égal à la moitié d'une cote écrite dans le même bloc.
   */
  it('aucun rayon littéral hors cercle parfait / poignée', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      // Blocs `{ … }` équilibrés, avec leur étendue, pour retrouver le bloc
      // le PLUS PROCHE d'un `borderRadius` donné.
      const spans: Array<{ start: number; end: number }> = [];
      const stack: number[] = [];
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '{') stack.push(i);
        else if (text[i] === '}' && stack.length) {
          spans.push({ start: stack.pop() as number, end: i });
        }
      }
      for (const match of text.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?)/g)) {
        const radius = Number(match[1]);
        if (radius === 0) continue; // carte pleine largeur : aucun rayon, c'est voulu
        const index = match.index ?? 0;
        const enclosing = spans
          .filter((span) => span.start < index && span.end > index)
          .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        const body = enclosing ? text.slice(enclosing.start, enclosing.end) : '';
        const dims = [
          ...Array.from(body.matchAll(/(?:minWidth|width):\s*(\d+(?:\.\d+)?)/g), (m) => Number(m[1])),
          ...Array.from(body.matchAll(/height:\s*(\d+(?:\.\d+)?)/g), (m) => Number(m[1])),
        ];
        const isHalfOfADimension = dims.some((dim) => Math.abs(dim - radius * 2) <= 1);
        if (isHalfOfADimension) continue;
        const line = text.slice(0, index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Échelle admise : xs 4 · sm 8 · md 12 · lg 16 · xl 24 · full 999 (`theme.radius` / `RADIUS`). ' +
        'Un rayon numérique n’est toléré que s’il vaut la moitié d’une cote du même bloc.',
    ).toEqual([]);
  });

  /**
   * Taille d'icône : `theme.iconSize` / `ICON_SIZE`, jamais un nombre. Un seul
   * cran par rôle (14 dans le texte, 18 dans un contrôle, 24 pour l'action,
   * 32 pour un état vide, 40 à la place d'une image, 64 en giciel plein écran).
   */
  it('aucune taille d’icône littérale', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const tag of text.matchAll(/<Ionicons[\s\S]{0,500}?\/>/g)) {
        const match = /size=\{(\d+)\}|size="(\d+)"/.exec(tag[0]);
        if (!match) continue;
        const line = text.slice(0, tag.index).split('\n').length;
        offenders.push(`${rel}:${line} → size=${match[1] ?? match[2]}`);
      }
    }
    expect(offenders, 'Utiliser `size={theme.iconSize.<cran>}` (§10).').toEqual([]);
  });

  /**
   * Opacité : un état, une valeur. Le MÊME appui s'affichait avec sept valeurs
   * (0.55 → 0.92) et le même « désactivé » avec quatre (0.4 → 0.6) selon
   * l'écran. Les états vivent dans `OPACITY`, pas dans la feuille de style.
   */
  it('aucune opacité d’état littérale', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      // `opacity: 0` / `opacity: 1` restent libres : ce sont les bornes, pas un état.
      for (const match of text.matchAll(/opacity:\s*(?:[\w.[\]]+\s*\?\s*)?(\d*\.\d+)/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(
      offenders,
      'Utiliser `theme.opacity.disabled | subtle (appui) | dimmed (grande surface) | ' +
        'unavailable | favorite` — `OPACITY` dans tokens.mobile.ts.',
    ).toEqual([]);
  });

  /**
   * Famille de glyphes : Ionicons fournit une variante `-outline` pour chaque
   * icône de CONTENU, et une variante pleine pour les ÉTATS. Mélanger les deux
   * donne une interface dont certaines icônes pèsent deux fois plus que leurs
   * voisines — c'est ce qu'on voyait avec `search` (plein) à côté de
   * `camera-outline` (trait).
   *
   * Les glyphes de la liste ci-dessous n'ont PAS de variante de trait utile :
   * une coche, une croix, une étoile de note, un chevron directionnel, un
   * triangle de lecture, un cœur actif, une torche allumée sont des ÉTATS.
   */
  it('les icônes de contenu sont en variante -outline', () => {
    const STATE_GLYPHS = new Set([
      // Affordances sans variante de trait pertinente
      'close', 'close-circle',
      // États sélectionné / validé / coché
      'checkmark', 'checkmark-circle', 'checkbox', 'square-outline',
      // États de lecture / favori / torche
      'play', 'play-circle', 'heart', 'flash', 'flash-off',
      // Notes
      'star',
      // Glyphes directionnels : le dessin est identique quelle que soit la variante
      'chevron-up', 'chevron-down', 'chevron-back', 'chevron-forward',
      'arrow-back', 'arrow-forward',
    ]);
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const tag of text.matchAll(/<Ionicons[\s\S]{0,500}?\/>/g)) {
        const nameProp = /\bname=(\{[\s\S]*?\}|"[^"]*")/.exec(tag[0]);
        if (!nameProp) continue;
        /**
         * On ne devine pas ce qui est un nom d'icône : on le LIT dans la
         * palette de glyphes d'Ionicons. Sans cela, `locale === 'ar'` ou
         * `mode === 'link'` passeraient pour des icônes et le test crierait
         * sur du code parfaitement correct.
         */
        // Ce qui suit un `===` n'est pas une icône mais la valeur comparée
        // (`mode === 'link' ? 'link-outline' : …`).
        const expression = nameProp[1].replace(/[\w.[\]]+\s*[!=]==?\s*'[^']*'/g, '');
        const quoted = Array.from(expression.matchAll(/'([a-z0-9-]+)'|"([a-z0-9-]+)"/g), (m) => m[1] ?? m[2])
          .filter((name) => GLYPHS.has(name));
        for (const name of quoted) {
          if (name.endsWith('-outline') || STATE_GLYPHS.has(name)) continue;
          const line = text.slice(0, tag.index).split('\n').length;
          offenders.push(`${rel}:${line} → ${name}`);
        }
      }
    }
    expect(offenders, 'Une icône de contenu se dessine en trait : `name="<icône>-outline"` (§10).').toEqual([]);
  });
});

/**
 * Dernière exception, et la seule : la FICHE PRODUIT.
 *
 * Ses cotes typographiques viennent d'une maquette dessinée en 720 × 1600 px
 * (`fiche.ts`, tout est divisé par deux) et validée par le client le 25/10/2026.
 * On y trouve donc des corps qui n'existent pas dans `TYPE_SCALE` (15, 17, 19,
 * 20, 22) et des interlignes serrés (17 pour 15) — un choix de maquette, pas
 * une dérive d'écran.
 *
 * On ne les « corrige » pas : on les GÈLE. Le test ci-dessous transforme cette
 * exception en contrat — impossible d'ajouter une sixième taille à la fiche
 * sans passer par ici, et donc sans décider. Toute NOUVELLE cote, elle, est
 * refusée par les verrous ci-dessus.
 */
describe('Design System — les cotes de la fiche produit sont gelées', () => {
  const FICHE_SRC = fs.readFileSync(path.join(ROOT, 'src/features/product/fiche.ts'), 'utf8');
  const numeric = (key: string): number => {
    const match = new RegExp(`\\b${key}:\\s*(\\d+)`).exec(FICHE_SRC);
    if (!match) throw new Error(`Cote \`${key}\` introuvable dans fiche.ts`);
    return Number(match[1]);
  };

  it('les corps de texte de la fiche sont ceux de la maquette validée', () => {
    expect({
      nameSize: numeric('nameSize'),
      priceSize: numeric('priceSize'),
      descriptionSize: numeric('descriptionSize'),
      rowLabel: numeric('rowLabel'),
      tileLabel: numeric('tileLabel'),
      infoTitle: numeric('infoTitle'),
      infoBody: numeric('infoBody'),
      barPrice: numeric('barPrice'),
      sheetTitle: numeric('sheetTitle'),
      panelText: numeric('panelText'),
      columnHeader: numeric('columnHeader'),
      rowSize: numeric('rowSize'),
      rowState: numeric('rowState'),
      headerTitle: numeric('headerTitle'),
    }).toEqual({
      nameSize: 22,
      priceSize: 20,
      descriptionSize: 15,
      rowLabel: 18,
      tileLabel: 15,
      infoTitle: 16,
      infoBody: 15,
      barPrice: 15,
      sheetTitle: 17,
      panelText: 15,
      columnHeader: 12,
      rowSize: 22,
      rowState: 15,
      headerTitle: 19,
    });
  });

  it('les interlignes de la fiche sont ceux de la maquette validée', () => {
    expect({
      nameLine: numeric('nameLine'),
      descriptionLine: numeric('descriptionLine'),
      infoLine: numeric('infoLine'),
      sheetTitleLine: numeric('sheetTitleLine'),
    }).toEqual({ nameLine: 26, descriptionLine: 17, infoLine: 18, sheetTitleLine: 20 });
  });
});
