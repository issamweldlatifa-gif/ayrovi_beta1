/**
 * AYROVI — verrou d'application du Design System (mobile).
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
  'src/design/tokens.generated.ts', // généré depuis identity.json
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
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
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
      'src/features/sections/PromotionCard.tsx', // badge de réduction posé sur la vignette
      'src/features/social/ReelCard.tsx', // durée posée sur la vignette vidéo
      'src/features/social/StoryViewer.tsx', // zones de tape + pied, au-dessus du média
      'app/aywebs/browser.tsx', // voile de chargement au-dessus de la page capturée
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
   *   🔵 info    = information     🟢 success = succès
   *   🟠 accent  = MARQUE + action principale, jamais un statut
   *   ⬛ gris    = structure, ne signale rien
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

  const statusUsage = () => {
    let count = 0;
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      count += (code(rel).match(/theme\.status\.\w+\.\w+/g) ?? []).length;
    }
    return count;
  };

  /**
   * Budget d'orange. ⚠️ HONNÊTETÉ : c'est un PROXY, pas la vraie mesure.
   *
   * La consigne parle de 3 % de la SURFACE VISIBLE. Compter les références
   * dans le code n'est pas la même chose : le lettrage AYROVI du pied de page
   * (40 px) compte pour une référence et couvre à lui seul plus de surface que
   * dix icônes d'onglet. Mesurer une surface exige un rendu, qu'on n'a pas ici.
   *
   * Ce test fait donc ce qu'un test peut faire : il interdit la RÉGRESSION
   * (le plafond ne peut pas monter) et il documente la cible. La vérification
   * réelle des 3 % reste un contrôle visuel sur appareil (§19).
   */
  /**
   * 33 = mesuré après la première passe de recatégorisation (avant : 61).
   *
   * ⚠️ `onAccent` est VOLONTAIREMENT EXCLU du décompte : c'est la couleur du
   * texte posé SUR un fond orange (noir en sombre, blanc en clair). Ce n'est
   * pas de l'orange — le compter gonflerait le budget de 9 et interdirait
   * précisément les boutons que l'accent est censé porter.
   */
  const ORANGE_BUDGET = 33;

  it('le budget orange ne régresse pas (proxy — la vraie mesure est visuelle)', () => {
    const orange = usage('accent') + usage('accentText');
    expect(
      orange,
      `Budget orange dépassé : ${orange} > ${ORANGE_BUDGET}. Un signal doit ` +
        'utiliser `theme.status.*`, pas l’accent (§2.10.2).',
    ).toBeLessThanOrEqual(ORANGE_BUDGET);
  });

  /**
   * La règle la plus mécaniquement vérifiable du contrat : un élément annoncé
   * comme alerte au lecteur d’écran n’est JAMAIS de la marque. Trois messages
   * de succès étaient peints en orange avant ce test.
   */
  it('aucun élément `alert` peint en orange', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      if (TOKEN_FILES.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(
        /accessibilityRole="alert"[^>]{0,400}?theme\.colors\.accent\w*/g,
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
     * NULLE PART : l’interface ne savait dire que « orange » ou « rouge pâle ».
     * Ce test empêche de revenir à ce mono-langage.
     */
    expect(statusUsage(), 'Aucune couleur de statut utilisée — l’interface redevient muette.')
      .toBeGreaterThan(0);
  });

  it('les teintes pâles de l’identité ne servent plus de signal', () => {
    /**
     * `colors.danger` (#FFABAB), `colors.info` (#BDBDBD : un GRIS) et
     * `colors.success` (#90D6AF) sont dessinées pour le web. En signalétique
     * mobile elles sont illisibles. On les a remplacées par `theme.status.*`.
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
