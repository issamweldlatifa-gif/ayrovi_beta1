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
