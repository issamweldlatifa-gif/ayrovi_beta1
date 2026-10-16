/**
 * Jetons propres à React Native — écrits à la main, et c'est volontaire.
 *
 * ── Pourquoi un fichier séparé plutôt que `tokens.generated.ts` ─────────────
 * `tokens.generated.ts` est GÉNÉRÉ (voir `scripts/gen-tokens.mjs`) :
 *   • ses COULEURS viennent de `src/design/brand.json` — l'identité couleur
 *     officielle de l'application (noir #0A0A0A, blanc #FFFFFF, violet
 *     électrique #571EF6, gris clair #F2F2F2) ;
 *   • sa STRUCTURE (espaces, typo, géométrie, durées) vient de
 *     `client/src/design/editorial/identity.json`, partagé avec le site.
 * L'éditer à la main serait une violation (écrasé au build, `tokens:check`
 * échoue en CI).
 *
 * Donc : ce que l'identité définit vit dans le fichier généré ; ce qui est
 * PROPRE au rendu natif (ombres, calques, courbes, hauteurs de chrome, voiles)
 * vit ici.
 *
 * ── Règle de dérivation ─────────────────────────────────────────────────────
 * Les couleurs dérivées ne sont JAMAIS des valeurs arbitraires : elles sont
 * calculées depuis `BRAND` (mélange ou opacité), sinon on recrée une seconde
 * palette à garder en phase — exactement ce que le système interdit. Seules
 * les couleurs FONCTIONNELLES (statuts mesurés au ratio WCAG, prix soldé) et
 * celles qu'une marque tierce impose (logo Google) sont littérales, et elles
 * sont documentées.
 *
 * ── Plus d'orange ───────────────────────────────────────────────────────────
 * L'orange (#FF7900 et ses dérivés) a quitté l'application le 15/10/2026 : ni
 * marque, ni action, ni statut. `tests/brand-colors.test.ts` l'interdit.
 */
import { Platform } from 'react-native';
import { BRAND, COLORS, GEOMETRY, MOTION, NEUTRALS, SPACE } from './tokens.generated';

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
  /** Reels verticaux : 9:16 (comme la vidéo plein écran). */
  reel: 9 / 16,
} as const;

/**
 * Vignettes Reels de l'accueil : `widthFraction` de la colonne utile ; le reste
 * laisse dépasser la vignette suivante (indice de défilement horizontal).
 */
/** Fond derrière une vidéo plein écran (la vidéo ne couvre pas toujours l'écran entier). */
export const VIDEO_BACKDROP = BRAND.black;

/**
 * Rouge des prix soldés : le MÊME rouge que `STATUS.danger.light.fg` (5,57:1
 * sur blanc). Une seule teinte rouge dans l'application, et c'est une couleur
 * FONCTIONNELLE (une baisse de prix), pas une couleur de marque.
 */
const PRICE_DROP_RED = '#CF1322';

/**
 * Palette commerciale fermée de Lens. Les cartes résultats et la galerie
 * restent blanches dans les deux modes : ces valeurs ne suivent donc PAS le
 * thème. Tout vient de `BRAND`/`NEUTRALS`, sauf le rouge de prix soldé.
 *
 *   • rouge  = baisse de prix (fonctionnel)
 *   • violet = élément ACTIF : favori coché ; violet clair = mode caméra choisi
 *   • noir   = texte, icônes, étoiles de note (plus de jaune orangé)
 *   • gris   = squelette, fond média, texte secondaire, filets
 */
export const LENS_COLORS = {
  sale: PRICE_DROP_RED,
  /** Élément actif d'une surface Lens blanche (favori coché). */
  active: BRAND.violet,
  /** Fond d'un choix actif (mode caméra choisi) : violet clair, libellé noir (10,4:1). */
  activeSoft: BRAND.violetLight,
  star: BRAND.black,
  /** Squelette : le gris clair officiel (§ « Skeleton Loading » de l'identité). */
  skeleton: BRAND.lightGray,
  /** Neutres fixes des cartes résultats, dont la zone texte reste blanche. */
  resultMuted: NEUTRALS.textSecondary,
  resultLine: NEUTRALS.border,
  resultMedia: BRAND.lightGray,
  cameraScrim: veil(0.48),
  cameraControl: veil(0.68),
  white: BRAND.white,
  black: BRAND.black,
} as const;

/**
 * Signal d'attente (cinq barres) : une seule famille VIOLETTE, dérivée du
 * violet de marque par mélange vers le noir ou le blanc — aucune teinte
 * écrite à la main, aucune couleur chaude.
 */
export const WAITING_GRADIENTS = [
  [mix(BRAND.violet, BRAND.black, 0.4), BRAND.violet],
  [mix(BRAND.violet, BRAND.black, 0.25), mix(BRAND.violet, BRAND.white, 0.1)],
  [mix(BRAND.violet, BRAND.black, 0.1), mix(BRAND.violet, BRAND.white, 0.2)],
  [mix(BRAND.violet, BRAND.black, 0.3), mix(BRAND.violet, BRAND.white, 0.3)],
  [mix(BRAND.violet, BRAND.black, 0.2), BRAND.violet],
] as const;

/**
 * Voile NEUTRE (noir de marque + opacité) : fonds de contrôle posés sur une
 * photo ou la caméra, ombres de texte, fondus. Remplace les `rgba(0,0,0,x)`
 * qui étaient éparpillés dans les écrans : l'opacité reste un choix local,
 * la couleur vient toujours de `BRAND`.
 */
export function veil(opacity: number): string {
  return alpha(BRAND.black, opacity);
}

/** Voile CLAIR (blanc de marque + opacité) : boutons « givrés » posés sur une image. */
export function frost(opacity: number): string {
  return alpha(BRAND.white, opacity);
}

export const REEL_TILE = {
  widthFraction: 0.66,
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
    shadowColor: BRAND.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  /** Bouton flottant, barre d'action. */
  medium: {
    shadowColor: BRAND.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  /** Feuille modale, menu. */
  high: {
    shadowColor: BRAND.black,
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
 * ── Pourquoi une palette de STATUT à part ───────────────────────────────────
 * La marque dit QUI nous sommes (noir, blanc, violet, gris clair). Un statut
 * dit CE QUI SE PASSE. Mélanger les deux rend l'un et l'autre illisibles :
 * un bouton violet ne doit jamais être confondu avec une erreur, et une erreur
 * ne doit jamais ressembler à la marque.
 *
 * ── Le contrat sémantique : la fonction EXACTE de chaque couleur ─────────────
 *
 *   🟡 JAUNE  warning  = AVERTISSEMENT. Demande l'attention, n'est PAS une
 *                        erreur. L'utilisateur peut continuer.
 *                        « التوفّر غير مؤكّد » · « السعر تقديري » · « هاتفك غير متصل »
 *                        Jaune franc (teinte 50°) — plus de brun orangé.
 *
 *   🔴 ROUGE  danger   = ERREUR ou DANGER. Quelque chose a échoué, ou une
 *                        action est destructrice.
 *                        « فشل الدفع » · « المنتوج محظور » · « حذف نهائي »
 *
 *   🟣 VIOLET info     = INFORMATION / ÉTAT ACTIF. Le violet de marque, dans sa
 *                        version lisible en texte : étape en cours, élément non
 *                        lu, adresse par défaut, catégorie éditoriale.
 *                        « قيد المعالجة » · « الشحن خلال 48 ساعة »
 *
 *   🟢 VERT   success  = SUCCÈS ou CONFIRMATION : aboutissement positif.
 *                        « تمّ الطلب » · « متوفّر » · « السعر مؤكّد »
 *
 *   ⬛⬜ NOIR/BLANC/GRIS = STRUCTURE : textes, bordures, surfaces. Ne signale
 *                        JAMAIS un état.
 *
 * Règle qui tranche la plupart des hésitations : « est-ce que je SIGNALE un
 * succès, une erreur ou un avertissement ? » — oui ⇒ palette de statut ; non ⇒
 * structure (noir/gris) ou marque (violet). Un bouton « Ajouter au panier »
 * n'est pas un statut : il est violet. « التوفّر غير مؤكّد » est un statut : jaune.
 *
 * ── Valeurs MESURÉES, pas choisies au goût ───────────────────────────────────
 * Chaque `fg` a été vérifié au ratio WCAG sur les deux fonds qu'il rencontre
 * réellement (`canvas` et `surface`), dans les deux modes. Exigence : ≥ 4,5:1
 * (re-vérifié par `tests/brand-colors.test.ts`).
 *
 *   danger   #FF4D4F  6,06 sur #0A0A0A · 5,49 sur #171717   (sombre)
 *            #CF1322  5,57 sur blanc   · 5,0  sur #F2F2F2   (clair)
 *   warning  #FFD60A 14,02 sur #0A0A0A · 12,70 sur #171717
 *            #6B5A00  6,80 sur blanc   · 6,08 sur #F2F2F2
 *   info     #926DF9  5,45 sur #0A0A0A · 4,93 sur #171717   (violet éclairci)
 *            #571EF6  7,19 sur blanc   · 6,42 sur #F2F2F2   (violet de marque)
 *   success  #52C41A  8,74 sur #0A0A0A · 7,91 sur #171717
 *            #237804  5,59 sur blanc   · 4,99 sur #F2F2F2
 *
 * `soft` et `border` sont dérivés par opacité, jamais écrits à la main. Seule
 * exception documentée : le fond `soft` de l'avertissement clair part du jaune
 * franc (#FFD60A) — dérivé du texte olive, il donnerait un kaki terne.
 */
const WARNING_YELLOW = '#FFD60A';
const WARNING_TEXT_ON_LIGHT = '#6B5A00';
/** Violet lisible en texte : celui de la palette sémantique (`accentText`), mode par mode. */
const VIOLET_ON_DARK = COLORS.dark.accentText;
const VIOLET_ON_LIGHT = COLORS.light.accentText;

export const STATUS = {
  danger: {
    dark: { fg: '#FF4D4F', soft: alpha('#FF4D4F', 0.16), border: alpha('#FF4D4F', 0.4) },
    light: { fg: '#CF1322', soft: alpha('#CF1322', 0.12), border: alpha('#CF1322', 0.35) },
  },
  warning: {
    dark: { fg: WARNING_YELLOW, soft: alpha(WARNING_YELLOW, 0.16), border: alpha(WARNING_YELLOW, 0.4) },
    light: { fg: WARNING_TEXT_ON_LIGHT, soft: alpha(WARNING_YELLOW, 0.22), border: alpha(WARNING_TEXT_ON_LIGHT, 0.35) },
  },
  info: {
    dark: { fg: VIOLET_ON_DARK, soft: alpha(VIOLET_ON_DARK, 0.16), border: alpha(VIOLET_ON_DARK, 0.4) },
    light: { fg: VIOLET_ON_LIGHT, soft: alpha(VIOLET_ON_LIGHT, 0.08), border: alpha(VIOLET_ON_LIGHT, 0.3) },
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
 * (les littéraux diffèrent : `#926DF9` contre `#571EF6`) — l'union des deux
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
  focus: string;
}

/**
 * Les jetons de couleur demandés par §2 mais absents de l'identité.
 *
 * ⚠️ DÉCISION PRODUIT EN ATTENTE (§25.1) : `elevatedSurface` est calculé à
 * 5,5 % vers `ink`. Si le produit préfère une valeur littérale, elle se change
 * ICI — une seule ligne, aucun écran à toucher.
 *
 * `onAccent` n'est plus ici : il vit dans la palette générée (`brand.json`),
 * blanc sur le violet dans les deux modes (7,19:1).
 */
export function derivedColors(colors: DerivablePalette) {
  return {
    /** Surface posée sur une surface : carte dans une carte, menu. */
    elevatedSurface: mix(colors.surface, colors.ink, 0.055),
    /** Voile d'arrière-plan d'une feuille/modale. */
    overlay: veil(0.56),
    /** Voile plus dense : modale bloquante, permission. */
    scrim: veil(0.72),
    /**
     * ⚠️ `warning` n'est PAS défini ici : il appartient à `STATUS`. Deux
     * définitions du même jeton seraient une duplication (§22).
     */
    /** Fond d'un contrôle inactif : la surface, à peine éclaircie. */
    disabled: mix(colors.surface, colors.ink, 0.03),
    /** Texte inactif : `muted`, ramené vers la surface. */
    disabledText: mix(colors.muted, colors.surface, 0.45),
    /** Séparateur faible, distinct de `line` (bordure de contrôle). */
    divider: mix(colors.canvas, colors.ink, 0.08),
    /** Bordure mise en avant (focus, sélection) : le violet lisible du mode. */
    focusRing: colors.focus,
    /** Surlignage d'un texte sélectionné dans un champ (Android) : violet translucide. */
    selection: alpha(colors.focus, 0.3),
    /**
     * Squelette de chargement : le GRIS CLAIR de l'identité (`surface` =
     * #F2F2F2 en clair). Un seul gris de chargement pour tout le shell.
     */
    skeleton: colors.surface,
    /**
     * Texte posé sur un MÉDIA (photo, vignette vidéo) : blanc dans les DEUX
     * modes, et c'est volontairement une des rares couleurs qui ne suivent pas
     * le thème.
     *
     * Pourquoi pas `ink` ? Parce qu'un média est sombre quel que soit le
     * réglage de l'utilisateur. `ink` vaut `#FFFFFF` en sombre mais `#0A0A0A`
     * en clair : un titre blanc sur photo deviendrait noir illisible en mode
     * clair. C'est exactement le piège que « une seule palette » peut créer si
     * on l'applique sans distinguer le SUPPORT du THÈME.
     */
    onMedia: BRAND.white,
    /**
     * Violet posé sur un MÉDIA (story, reel plein écran) : la version éclaircie
     * du violet, celle du mode sombre, dans les DEUX modes — un média est sombre
     * quel que soit le thème (même raisonnement que `onMedia`).
     */
    accentOnMedia: COLORS.dark.accentText,
    /** Voile sous ce texte, pour garantir le contraste sur une photo claire. */
    mediaScrim: veil(0.4),
    /**
     * Texte posé sur un fond ADAPTATIF CLAIR (pastel extrait de l'image par le
     * serveur, ou override manuel clair) : noir dans les DEUX modes.
     *
     * Pourquoi pas `ink` ? Parce qu'un fond adaptatif clair reste clair quel
     * que soit le thème : `ink` vaut `#FFFFFF` en sombre — un titre blanc sur
     * pastel clair serait illisible. C'est le même raisonnement que `onMedia`,
     * appliqué au carrousel Hero (§5.3 : contraste garanti sur fond adaptatif).
     */
    onAdaptiveLight: BRAND.black,
    /**
     * Texte posé sur un fond ADAPTATIF SOMBRE (override manuel Admin foncé) :
     * blanc dans les DEUX modes — le pendant de `onAdaptiveLight`.
     */
    onAdaptiveDark: BRAND.white,
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
 * Ce sont des couleurs de CONTENU (tirées des photos), pas de la marque : elles
 * ne servent qu'aux cartes de démonstration hors ligne.
 */
export const HERO_DEMO_BACKGROUND = {
  tech: '#252B2D',
  modeHomme: '#A09C96',
  modeFemme: '#997B68',
  sport: '#A78F7A',
} as const;

/**
 * Couleurs officielles du logo « G » de Google (identité de marque d'un TIERS,
 * imposée par ses règles d'usage — à ne pas modifier). Seule exception à la
 * palette ZAYROVI, et uniquement dans `GoogleLogo.tsx`.
 */
export const GOOGLE_BRAND = {
  red: '#EA4335',
  blue: '#4285F4',
  yellow: '#FBBC05',
  green: '#34A853',
} as const;
