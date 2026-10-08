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
  header: 56,
  tabBar: 56,
  tabStrip: 40,
} as const;

/* ── Espacements manquants (§24.2) ────────────────────────────────────────── */

/**
 * `identity.json` définit [4, 8, 12, 16, 24, 32, 48, 64, 96]. Trois marches
 * manquent pour couvrir les cas mesurés : 2 (séparateurs serrés), 20 (entre
 * 16 et 24, utilisé par les cartes), 40 (entre 32 et 48, sections).
 * On COMPLÈTE l'échelle sans la remplacer : les index 0 à 8 restent ceux de
 * l'identité, pour ne pas casser les écrans existants.
 */
export const SPACE_EXTENDED = [2, 20, 40] as const;

/** Échelle complète : identité + compléments, triée. */
export const SPACE_ALL: readonly number[] = [...SPACE, ...SPACE_EXTENDED].sort((a, b) => a - b);

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
    /** Avertissement — dérivé de `accent` (même famille chaude), pas un jaune
     *  arbitraire : entre l'accent et le succès, à mi-chemin. */
    warning: mix(colors.accent, colors.success, 0.5),
    /** Fond d'un contrôle inactif : la surface, à peine éclaircie. */
    disabled: mix(colors.surface, colors.ink, 0.03),
    /** Texte inactif : `muted`, ramené vers la surface. */
    disabledText: mix(colors.muted, colors.surface, 0.45),
    /** Séparateur faible, distinct de `line` (bordure de contrôle). */
    divider: mix(colors.canvas, colors.ink, 0.08),
    /** Bordure mise en avant (focus, sélection). */
    focusRing: colors.accent,
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
