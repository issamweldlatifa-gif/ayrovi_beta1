/**
 * Jetons propres à React Native — écrits à la main, et c'est volontaire.
 *
 * ── Pourquoi un fichier séparé plutôt que `tokens.generated.ts` ─────────────
 * `tokens.generated.ts` est GÉNÉRÉ depuis `client/src/design/editorial/identity.json`,
 * qui est AUSSI la source du CSS du site en production. Deux conséquences :
 *
 *   1. L'éditer à la main serait une violation (il se fait écraser au build,
 *      et `tokens:check` échoue en CI).
 *   2. Ajouter des jetons dans `identity.json` changerait le SITE — or le site
 *      est servi en direct depuis `main`. Une décision de produit, pas un
 *      détail d'implémentation.
 *
 * Donc : ce que l'identité définit vit dans le fichier généré ; ce qui est
 * PROPRE au rendu natif (ombres, calques, courbes, hauteurs de chrome) vit ici.
 *
 * ── Règle de dérivation ─────────────────────────────────────────────────────
 * Les couleurs dérivées ne sont JAMAIS des valeurs arbitraires : elles sont
 * calculées depuis la palette générée (sinon on recrée une seconde palette à
 * garder en phase — exactement ce que le système interdit). Seules les valeurs
 * que React Native ne peut pas exprimer autrement (ombres, z-index, easing)
 * sont littérales, et elles sont documentées.
 */
import { Platform } from 'react-native';
import { GEOMETRY, MOTION, SPACE } from './tokens.generated';

/* ── Hauteurs de chrome (§4.2) ────────────────────────────────────────────── */

/**
 * Ces trois hauteurs manquaient aux jetons générés — d'où des écrans qui
 * « devinaient » leur marge haute chacun à leur façon.
 */
export const CHROME = {
  // Safe-area–externe Höhe: 12 top + 44 cible tactile + 8 bottom.
  header: 64,
  tabBar: 56,
  tabStrip: 40,
} as const;

/* ── Espacements manquants (§24.2) ────────────────────────────────────────── */

/**
 * `identity.json` définit [4, 8, 12, 16, 24, 32, 48, 64, 96]. L'échelle est
 * trop clairsemée pour les densités intermédiaires dont les écrans ont besoin,
 * et le mesurage le prouve : avant ce complément, **78 valeurs d'espacement
 * étaient hors échelle**, dont la très grande majorité en 6 et en 10.
 *
 * Ce n'est donc pas « les écrans ont tort » : c'est l'échelle qui a un trou.
 * On comble les marches manquantes MESURÉES :
 *   2 (séparateurs serrés) · 6 · 10 · 20 (entre 16 et 24) · 40 (entre 32 et 48)
 *
 * On COMPLÈTE l'échelle sans la remplacer : les index 0 à 8 restent ceux de
 * l'identité, pour ne rien casser dans les écrans existants. La valeur finale
 * est calculée, pas recopiée : ajouter une marche ici met à jour `SPACE_ALL`
 * et le test d'application des jetons en même temps.
 */
export const SPACE_EXTENDED = [2, 6, 10, 20, 40] as const;

/** Échelle complète : identité + compléments, triée. */
export const SPACE_ALL: readonly number[] = [...SPACE, ...SPACE_EXTENDED].sort((a, b) => a - b);

/* ── Ratios des médias (un seul endroit : pas de nombre en dur dans les écrans) ─ */

/**
 * Proportions largeur/hauteur des images de carte. La LARGEUR d'une image vient
 * toujours de la colonne (`AppScreen` : une seule marge d'écran) ; ce jeton ne
 * fixe que la hauteur. Ainsi « à la une » et les autres cartes suivent la même
 * règle sur tous les appareils.
 */
export const MEDIA_RATIO = {
  square: 1,
} as const;

/* ── Rayons (§2 — Radius Tokens) ──────────────────────────────────────────── */

/**
 * L'identité ne porte que `controlRadius`, `cardRadius`, `sheetRadius`,
 * `ctaRadius`. La documentation demande une échelle nommée XS → Full.
 * On la dérive des valeurs existantes là où c'est possible.
 */
export const RADIUS = {
  xs: 4,
  sm: 8,
  md: GEOMETRY.controlRadius, // 12 — valeur de l'identité
  lg: GEOMETRY.cardRadius, // 16 — valeur de l'identité
  xl: 24,
  full: GEOMETRY.ctaRadius, // 999 — pastille
} as const;

/* ── Ombres / élévation (§2 — Shadow Tokens) ──────────────────────────────── */

/**
 * ENTIÈREMENT ABSENT de l'identité (qui est pensée pour le web, où l'élévation
 * se fait en CSS). React Native n'a pas de `box-shadow` : iOS utilise
 * shadowOffset/Opacity/Radius, Android utilise `elevation`. On fournit les DEUX
 * jeux dans un même objet — c'est la seule façon d'avoir une ombre identique.
 *
 * `none` existe pour rendre l'absence d'ombre EXPLICITE, au lieu d'un objet de
 * style vide que rien ne distingue d'un oubli.
 */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Carte posée sur le fond — séparation douce. */
  low: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  /** Bouton flottant, barre d'action. */
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  /** Feuille modale, menu. */
  high: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export type ElevationName = keyof typeof elevation;

/* ── Calques (§2 — z-index absent) ────────────────────────────────────────── */

/**
 * Sans échelle nommée, chaque superposition se réglait en empilant les `View`
 * et en espérant que l'ordre du JSX suffise. fragile dès qu'un écran ajoute
 * une couche.
 */
export const Z_INDEX = {
  base: 0,
  /** Contenu qui dépasse (liste, carte sélectionnée). */
  raised: 1,
  /** Chrome : en-tête, barre d'onglets. */
  chrome: 10,
  /** Voile + contenu au-dessus de lui. */
  scrim: 100,
  modal: 101,
  /** Doit rester au-dessus de TOUT : erreur bloquante, chargement global. */
  toast: 200,
} as const;

/* ── Courbes d'animation (§8) ─────────────────────────────────────────────── */

/**
 * `MOTION` ne porte que des DURÉES. Une durée sans courbe produit un
 * mouvement mécanique ; on ajoute les courbes standards et les deux
 * ressorts utilisés par la documentation.
 */
export const EASING = {
  /** Sortie rapide, arrivée douce — le défaut pour apparaître. */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Pour sortir : on accélère, l'élément « s'en va ». */
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  /** Pour entrer : départ franc, freinage net. */
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

export const SPRING = {
  /** Ressort ferme : boutons, bascules — pas de dépassement. */
  firm: { damping: 20, stiffness: 300, mass: 0.6 },
  /** Ressort souple : feuilles, glissements — léger dépassement accepté. */
  soft: { damping: 16, stiffness: 180, mass: 0.8 },
} as const;

/** Durées réunies : identité + lecture réduite. */
export const duration = {
  fast: MOTION.fast, // 120
  standard: MOTION.standard, // 180
  /** Une seule valeur manquante à MOTION : la sortie, plus longue que 180. */
  exit: 240,
  reduced: MOTION.reduced, // 0 — accessibilité
} as const;

/* ── Palette FONCTIONNELLE (statuts) ──────────────────────────────────────── */

/**
 * ── Pourquoi une palette à part, et pourquoi c'est justifié ─────────────────
 * Consigne produit : « l'orange ne doit pas dépasser 3 %, il faut du rouge
 * vrai, du bleu, du jaune — pas tout en orange ».
 *
 * Les couleurs de l'identité ont été dessinées pour une charte monochrome
 * premium : `danger` y est un rose pâle (`#FFABAB`), `info` un GRIS
 * (`#BDBDBD`), `success` un vert désaturé (`#90D6AF`). Sur le web, ces teintes
 * posées sur de grandes surfaces passent. En signalétique mobile — une pastille
 * de 12 px, une icône de 18 px, un liseré de 1 px — elles sont illisibles, et
 * surtout elles ne se DISTINGUENT pas entre elles : trois gris teintés.
 *
 * On ajoute donc une palette de STATUT, distincte de la palette de MARQUE.
 * Ce n'est pas une seconde charte : la marque reste monochrome + orange. Ce
 * sont les ÉTATS qui ont des couleurs, et c'est précisément ce qui permet de
 * garder l'orange sous 3 % : un signal n'a plus besoin d'être orange pour
 * exister.
 *
 * ── Le contrat sémantique : la fonction EXACTE de chaque couleur ─────────────
 *
 *   🟡 JAUNE  warning  = AVERTISSEMENT. Demande l'attention, n'est PAS une
 *                        erreur. L'utilisateur peut continuer.
 *                        « التوفّر غير مؤكّد » · « السعر تقديري » ·
 *                        « المهلة قربت تنتهي »
 *
 *   🔴 ROUGE  danger   = ERREUR ou DANGER. Quelque chose a échoué, ou une
 *                        action est destructrice.
 *                        « فشل الدفع » · « المنتوج محظور » · « حذف نهائي »
 *
 *   🔵 BLEU   info     = INFORMATION NEUTRE. Ni bien ni mal : un état, une
 *                        note, une précision.
 *                        « قيد المعالجة » · « الشحن خلال 48 ساعة »
 *
 *   🟢 VERT   success  = SUCCÈS ou CONFIRMATION : aboutissement positif.
 *                        « تمّ الطلب » · « متوفّر » · « السعر مؤكّد »
 *
 *   🟠 ORANGE accent   = MARQUE + ACTION PRINCIPALE. Uniquement. Jamais un
 *                        statut — sinon il n'est plus une marque et dépasse
 *                        les 3 % de surface qui lui sont alloués.
 *
 *   ⬛⬜ GRIS  ink/line/ = STRUCTURE : textes, bordures, surfaces.
 *             surface     Ne porte AUCUN sens, ne signale JAMAIS un état.
 *                         Ces valeurs viennent de l'identité et ne bougent pas.
 *
 * Règle qui découle de ce contrat et qui tranche la plupart des hésitations :
 * « est-ce que je SIGNALE un état ? » — oui ⇒ palette de statut ; non ⇒
 * structure ou marque. Un bouton « Ajouter au panier » n'est pas un statut :
 * il reste orange. Une pastille « التوفّر غير مؤكّد » est un statut : jaune.
 *
 * ── Valeurs MESURÉES, pas choisies au goût ───────────────────────────────────
 * Chaque `fg` a été vérifié au ratio WCAG sur les deux fonds qu'il rencontre
 * réellement (`canvas` et `surface`), dans les deux modes. Exigence : ≥ 4,5:1.
 *
 *   danger   #FF4D4F  6,43 sur noir · 5,49 sur #171717   (sombre)
 *            #CF1322  5,57 sur blanc · 5,11 sur #F5F5F5  (clair)
 *   warning  #FFC53D 13,31 sur noir · 11,36 sur #171717
 *            #9C5700  5,56 sur blanc · 5,10 sur #F5F5F5  ← #AD6800 échouait (4,41)
 *   info     #40A9FF  8,34 sur noir · 7,12 sur #171717
 *            #0958D9  6,16 sur blanc · 5,65 sur #F5F5F5
 *   success  #52C41A  9,27 sur noir · 7,91 sur #171717
 *            #237804  5,59 sur blanc · 5,12 sur #F5F5F5
 *
 * `soft` et `border` sont dérivés par opacité, jamais écrits à la main.
 */
export const STATUS = {
  danger: {
    dark: { fg: '#FF4D4F', soft: alpha('#FF4D4F', 0.16), border: alpha('#FF4D4F', 0.4) },
    light: { fg: '#CF1322', soft: alpha('#CF1322', 0.12), border: alpha('#CF1322', 0.35) },
  },
  warning: {
    dark: { fg: '#FFC53D', soft: alpha('#FFC53D', 0.16), border: alpha('#FFC53D', 0.4) },
    light: { fg: '#9C5700', soft: alpha('#9C5700', 0.12), border: alpha('#9C5700', 0.35) },
  },
  info: {
    dark: { fg: '#40A9FF', soft: alpha('#40A9FF', 0.16), border: alpha('#40A9FF', 0.4) },
    light: { fg: '#0958D9', soft: alpha('#0958D9', 0.12), border: alpha('#0958D9', 0.35) },
  },
  success: {
    dark: { fg: '#52C41A', soft: alpha('#52C41A', 0.16), border: alpha('#52C41A', 0.4) },
    light: { fg: '#237804', soft: alpha('#237804', 0.12), border: alpha('#237804', 0.35) },
  },
} as const;

export type StatusName = keyof typeof STATUS;
export type StatusTone = { fg: string; soft: string; border: string };

/** Les statuts d'un mode donné — c'est ce que le thème expose. */
export type StatusSet = Record<StatusName, StatusTone>;

export const statusFor = (mode: 'dark' | 'light'): StatusSet => ({
  danger: STATUS.danger[mode],
  warning: STATUS.warning[mode],
  info: STATUS.info[mode],
  success: STATUS.success[mode],
});

/* ── Couleurs dérivées (§2 — Color Tokens manquants) ──────────────────────── */

/**
 * DÉRIVÉES, jamais arbitraires. Le principe : une couleur « manquante » est
 * soit un MÉLANGE de deux couleurs existantes, soit une couleur existante
 * avec une opacité. Écrire `#1C1C1C` ici reviendrait à créer une seconde
 * palette — interdit par §17.
 */

/** Mélange deux couleurs hexadécimales, `ratio` = part de la seconde. */
function mix(from: string, to: string, ratio: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(channel(r1, r2))}${hex(channel(g1, g2))}${hex(channel(b1, b2))}`;
}

/** Applique une opacité à une couleur hexadécimale. */
function alpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return `#${full}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Seules les clés RÉELLEMENT nécessaires au calcul. Typer ce paramètre avec
 * la palette entière du mode clair la rendait inutilisable avec le mode sombre
 * (les littéraux diffèrent : `#FFAE69` contre `#A74700`) — l'union des deux
 * palettes n'est pas assignable à l'une d'elles.
 *
 * Décrire le BESOIN plutôt que la SOURCE rend la fonction utilisable par les
 * deux modes, et par toute palette future.
 */
export interface DerivablePalette {
  surface: string;
  canvas: string;
  ink: string;
  muted: string;
  accent: string;
  success: string;
}

/**
 * Les jetons de couleur demandés par §2 mais absents de l'identité.
 *
 * ⚠️ DÉCISION PRODUIT EN ATTENTE (§25.1) : `elevatedSurface` est calculé à
 * 55 % vers `ink`. Si le produit préfère une valeur littérale (#262626
 * proposé), elle se change ICI — une seule ligne, aucun écran à toucher.
 */
export function derivedColors(colors: DerivablePalette) {
  return {
    /** Surface posée sur une surface : carte dans une carte, menu. */
    elevatedSurface: mix(colors.surface, colors.ink, 0.055),
    /** Voile d'arrière-plan d'une feuille/modale. */
    overlay: alpha('#000000', 0.56),
    /** Voile plus dense : modale bloquante, permission. */
    scrim: alpha('#000000', 0.72),
    /**
     * ⚠️ `warning` n'est PLUS défini ici : il appartient à `STATUS`.
     * L'ancienne valeur était un MÉLANGE d'accent et de succès — un vert
     * olive qui n'était ni un jaune ni un signal lisible. Deux définitions
     * du même jeton seraient une duplication (§22).
     */
    /** Fond d'un contrôle inactif : la surface, à peine éclaircie. */
    disabled: mix(colors.surface, colors.ink, 0.03),
    /** Texte inactif : `muted`, ramené vers la surface. */
    disabledText: mix(colors.muted, colors.surface, 0.45),
    /** Séparateur faible, distinct de `line` (bordure de contrôle). */
    divider: mix(colors.canvas, colors.ink, 0.08),
    /** Bordure mise en avant (focus, sélection). */
    focusRing: colors.accent,
    /**
     * Texte posé sur l'ACCENT (`#FF7900`). Noir, et ce n'est pas un goût :
     * c'est MESURÉ. Le noir sur cet orange donne ≈ 7:1, le blanc ≈ 2,9:1 —
     * or WCAG AA demande 4,5:1 en texte courant. Le blanc échoue.
     *
     * Pourquoi pas `onAction` ? Parce que `onAction` suit le THÈME (noir en
     * sombre, blanc en clair) alors que l'accent, lui, ne change JAMAIS :
     * `#FF7900` dans les deux modes. Utiliser `onAction` rendrait le texte
     * blanc sur orange en mode clair — c'est-à-dire illisible, exactement le
     * défaut que deux composants avaient déjà (BrandMark, SonimMark).
     *
     * Le contraste se mesure sur le SUPPORT réel, pas sur le thème.
     */
    onAccent: '#000000',
    /**
     * Texte posé sur un MÉDIA (photo, vignette vidéo) : blanc dans les DEUX
     * modes, et c'est volontairement une des rares couleurs non dérivées.
     *
     * Pourquoi pas `ink` ? Parce qu'un média est sombre quel que soit le
     * réglage de l'utilisateur. `ink` vaut `#FFFFFF` en sombre mais `#000000`
     * en clair : un titre blanc sur photo deviendrait noir illisible en mode
     * clair. C'est exactement le piège que « une seule palette » peut créer si
     * on l'applique sans distinguer le SUPPORT du THÈME.
     */
    onMedia: '#FFFFFF',
    /** Voile sous ce texte, pour garantir le contraste sur une photo claire. */
    mediaScrim: alpha('#000000', 0.4),
    /**
     * Texte posé sur un fond ADAPTATIF CLAIR (pastel extrait de l'image par le
     * serveur, ou override manuel clair) : noir dans les DEUX modes.
     *
     * Pourquoi pas `ink` ? Parce qu'un fond adaptatif clair reste clair quel
     * que soit le thème : `ink` vaut `#FFFFFF` en sombre — un titre blanc sur
     * pastel clair serait illisible. C'est le même raisonnement que `onMedia`,
     * appliqué au carrousel Hero (§5.3 : contraste garanti sur fond adaptatif).
     */
    onAdaptiveLight: '#000000',
    /**
     * Texte posé sur un fond ADAPTATIF SOMBRE (override manuel Admin foncé) :
     * blanc dans les DEUX modes — le pendant de `onAdaptiveLight`.
     */
    onAdaptiveDark: '#FFFFFF',
  } as const;
}

export type DerivedColors = ReturnType<typeof derivedColors>;

/* ── Tailles d'icônes (§10) ───────────────────────────────────────────────── */

/**
 * `GEOMETRY.iconGrid` (24) est la grille de dessin, pas la taille de rendu.
 * Une échelle de rendu nommée évite les `size={17}` qu'on retrouve éparpillés.
 */
export const ICON_SIZE = {
  xs: 14,
  sm: 18,
  md: GEOMETRY.iconGrid, // 24
  lg: 32,
  xl: 40,
} as const;

/* ── Opacité (§2) ─────────────────────────────────────────────────────────── */

export const OPACITY = {
  /** Élément désactivé. */
  disabled: 0.4,
  /** Texte secondaire sur fond contrasté. */
  subtle: 0.64,
  /** Squelette de chargement. */
  skeleton: 0.12,
  /** Voile sur image (légende, dégradé). */
  imageScrim: 0.32,
} as const;

/* ── Utilitaire plateforme ────────────────────────────────────────────────── */

/** Les ombres iOS/Android n'ont pas la même échelle ; Android ignore nos
 *  réglages fins et n'utilise que `elevation`. On ne tente donc pas de
 *  bricoler : on rend l'objet tel quel sur les deux, la plateforme choisit. */
export const shadowFor = (level: ElevationName) => elevation[level];

export const isAndroid = Platform.OS === 'android';

/* ── Carrousel Hero — palette de la démo embarquée ─────────────────────────── */

/**
 * Couleur de fond de chaque carte de démo : moyenne du bas du visuel (là où
 * le fondu se dissout). En production, le serveur extrait cette palette lui-même.
 */
export const HERO_DEMO_BACKGROUND = {
  tech: '#252B2D',
  modeHomme: '#A09C96',
  modeFemme: '#997B68',
  sport: '#A78F7A',
} as const;

/**
 * Bleu des liens légaux (écran de connexion). La palette de la marque est
 * monochrome + orange : ce bleu est donc un choix explicite, réservé aux liens
 * « Conditions » et « Confidentialité », lisible sur fond clair et sombre.
 */
export const LINK_BLUE = { light: '#1A56DB', dark: '#8AB4FF' } as const;

/** Couleurs officielles du logo « G » de Google (identité de marque, à ne pas modifier). */
export const GOOGLE_BRAND = {
  red: '#EA4335',
  blue: '#4285F4',
  yellow: '#FBBC05',
  green: '#34A853',
} as const;
