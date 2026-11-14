/**
 * GLYPHES du rail Reels et de la feuille de commentaires — redessinés d'après
 * la référence du 11/11/2026 (capture du rail + vidéo `SVID_20261110_091310_1`).
 *
 * Pourquoi pas Ionicons : la référence a son propre dessin, que la famille
 * Ionicons ne reproduit pas —
 *   • pouce = MANCHETTE détachée (pilule verticale) + main anguleuse ;
 *   • bulle de commentaire carrée, queue en bas à gauche ;
 *   • flèche de partage courbe, pointe triangulaire ;
 *   • haut-parleur = pilule + pavillon trapézoïdal + petite croix.
 *
 * Tous les tracés vivent sur une grille 24×24, trait 1.8 à extrémités rondes,
 * relevés sur la capture agrandie (×3) puis arrondis au dixième. Chaque glyphe
 * a une variante PLEINE (état posé) et une variante TRAIT (disponible), comme
 * le reste du système d'icônes (voir `design-system.test.ts`).
 */
import { Platform } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

export type ReelGlyphName =
  | 'like'
  | 'dislike'
  | 'comment'
  | 'share'
  | 'heart'
  | 'muted'
  | 'sound'
  | 'fullscreen'
  | 'sort'
  | 'close'
  | 'back'
  | 'reply'
  | 'flag'
  | 'send';

/** Trait commun de la famille (relevé : ~6 px sur un glyphe de 75 px). */
export const REEL_GLYPH_STROKE = 1.8;

/*
 * ═══ Famille d'interaction v1 (refonte du 14/11/2026, concept approuvé) ═══
 * Pouce · cœur · partage · message : formes PLEINES aux angles adoucis (le
 * remplissage reçoit un trait rond de même couleur, `REEL_GLYPH_SOFT`), grille 24.
 * Variante TRAIT (au repos sur une carte claire) : mêmes contours, sans
 * remplissage. Sur vidéo (option A) : blanc plein, nu, ombre douce.
 */

/** Trait d'adoucissement des formes pleines (angles arrondis, concept v1). */
export const REEL_GLYPH_SOFT = 1.4;

/** Pouce haut — main (la manchette est un `Rect` à part). */
const THUMB_HAND =
  'M8.6 10.6 L12.9 5.2 Q13.9 4.1 14.8 5 Q15.3 5.6 15.1 6.4 L14.3 10 H19.4 Q20.9 10 20.4 11.6 L18.3 18.9 Q17.9 20 16.8 20 H9.9 Q8.6 20 8.6 18.7 Z';
/** Manchette détachée à gauche de la main. */
const THUMB_CUFF = { x: 2.7, y: 10.6, width: 2.8, height: 9.4, rx: 1.4 };

/** Bulle de message arrondie, queue en bas à gauche (concept v1, échelle 0,94). */
const BUBBLE =
  'M6.1 4.4 H17.9 Q20.6 4.4 20.6 7.1 V13.7 Q20.6 16.4 17.9 16.4 H11.2 L7.4 19.5 Q6.3 20.3 6.3 19 V16.4 Q3.4 16.2 3.4 13.5 V7.1 Q3.4 4.4 6.1 4.4 Z';
/** Les trois points de la bulle (centres, grille 24). */
export const BUBBLE_DOTS: readonly (readonly [number, number])[] = [[8.2, 10.4], [12, 10.4], [15.8, 10.4]];
const BUBBLE_DOT_R = 1.25;
/** Cercle en sous-tracé (pour percer la bulle pleine en `evenodd`). */
const ring = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
/**
 * Bulle PLEINE percée de trois points : le trait d'adoucissement mange
 * `REEL_GLYPH_SOFT / 2` du bord de chaque trou — on l'agrandit d'autant pour
 * que le point visible garde le rayon du concept.
 */
const BUBBLE_PIERCED = BUBBLE + ' ' + BUBBLE_DOTS.map(([cx, cy]) => ring(cx, cy, BUBBLE_DOT_R + REEL_GLYPH_SOFT / 2)).join(' ');

/** Flèche de partage courbe (concept v1, échelle 1,05). */
const SHARE =
  'M13.6 4.7 L20.6 11.1 L13.6 17.5 V13.9 Q7.5 13.7 4 19.3 Q4.6 10.4 13.6 8.8 Z';

/** Cœur, pointe basse (concept v1, échelle 0,96). */
export const HEART_PATH =
  'M12 20.1 C11.6 20.1 3.1 14.6 3.1 8.9 C3.1 6 5.2 4.1 7.8 4.1 C9.6 4.1 11.1 5.1 12 6.7 C12.9 5.1 14.4 4.1 16.2 4.1 C18.8 4.1 20.9 6 20.9 8.9 C20.9 14.6 12.4 20.1 12 20.1 Z';

/** Échelle optique de chaque forme (concept v1) : même poids visuel côte à côte. */
const OPTICAL: Partial<Record<ReelGlyphName, number>> = { heart: 0.96, share: 1.05, comment: 0.94 };
const optical = (name: ReelGlyphName) => {
  const k = OPTICAL[name];
  return k ? `translate(12 12) scale(${k}) translate(-12 -12)` : undefined;
};

/** Haut-parleur : pilule + pavillon trapézoïdal. */
const SPEAKER_CUFF = { x: 2.4, y: 8.2, width: 3, height: 7.6, rx: 1.5 };
const SPEAKER_HORN = 'M8.2 8 L13.6 3.6 Q14.8 2.8 14.8 4.2 V19.8 Q14.8 21.2 13.6 20.4 L8.2 16 Z';

const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };

export interface ReelGlyphProps {
  name: ReelGlyphName;
  size: number;
  color: string;
  /** Variante pleine : état posé (pouce, cœur). Ignorée par les glyphes au trait seul. */
  filled?: boolean;
  /** Miroir horizontal pour l'arabe (flèches, retour). */
  mirrored?: boolean;
  /**
   * Ombre douce sous le glyphe (option A sur vidéo : icône blanche nue).
   * Couleur fournie par l'appelant (jeton `veil`) — jamais une teinte en dur ici.
   */
  shadow?: string;
}

/** Un glyphe de la famille Reels — trait 1.8, grille 24. */
export function ReelGlyph({ name, size, color, filled = false, mirrored = false, shadow }: ReelGlyphProps) {
  const flip = mirrored ? 'translate(24 0) scale(-1 1)' : undefined;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      {shadow ? (
        // Ombre douce : la même forme, décalée d'un rien vers le bas et
        // épaissie — lisible sur une vidéo claire sans pastille (option A).
        <>
          <G opacity={0.35} transform="translate(0 0.6)">
            <G transform={flip}>{glyphBody(name, shadow, filled, 2.2)}</G>
          </G>
          <G opacity={0.7} transform="translate(0 0.4)">
            <G transform={flip}>{glyphBody(name, shadow, filled, 0.8)}</G>
          </G>
        </>
      ) : null}
      <G transform={flip}>{glyphBody(name, color, filled, 0)}</G>
    </Svg>
  );
}

/** Le dessin d'un glyphe dans une couleur ; `spread` épaissit le trait (ombre). */
function glyphBody(name: ReelGlyphName, color: string, filled: boolean, spread: number): React.ReactNode {
  const interaction = name === 'like' || name === 'dislike' || name === 'heart' || name === 'comment' || name === 'share';
  const stroke = {
    stroke: color,
    // Forme pleine de la famille v1 : trait d'adoucissement ; sinon trait 1.8.
    strokeWidth: (filled && interaction ? REEL_GLYPH_SOFT : REEL_GLYPH_STROKE) + spread,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const fill = filled ? color : 'none';

  let body: React.ReactNode;
  switch (name) {
    case 'like':
    case 'dislike':
      // Le pouce bas est le pouce haut tourné d'un demi-tour (manchette à droite,
      // pointe en bas) — exactement comme la référence.
      body = (
        <G transform={name === 'dislike' ? 'rotate(180 12 12)' : undefined}>
          <Rect {...THUMB_CUFF} fill={fill} {...stroke} />
          <Path d={THUMB_HAND} fill={fill} {...stroke} />
        </G>
      );
      break;
    case 'comment':
      body = filled ? (
        <Path d={BUBBLE_PIERCED} fill={fill} fillRule="evenodd" {...stroke} />
      ) : (
        <>
          <Path d={BUBBLE} fill="none" {...stroke} />
          {BUBBLE_DOTS.map(([cx, cy]) => (
            <Circle key={cx} cx={cx} cy={cy} r={BUBBLE_DOT_R} fill={color} />
          ))}
        </>
      );
      break;
    case 'share':
      body = <Path d={SHARE} fill={fill} {...stroke} />;
      break;
    case 'heart':
      body = <Path d={HEART_PATH} fill={fill} {...stroke} />;
      break;
    case 'muted':
    case 'sound':
      body = (
        <>
          <Rect {...SPEAKER_CUFF} fill="none" {...stroke} />
          <Path d={SPEAKER_HORN} fill="none" {...stroke} />
          {name === 'muted' ? (
            <Path d="M17.6 10.2 L21 13.6 M21 10.2 L17.6 13.6" fill="none" {...stroke} />
          ) : (
            <Path d="M17.6 9 Q19.4 12 17.6 15 M19.6 6.8 Q23.2 12 19.6 17.2" fill="none" {...stroke} />
          )}
        </>
      );
      break;
    case 'fullscreen':
      body = (
        <Path
          d="M4 9 V5.5 Q4 4 5.5 4 H9 M15 4 H18.5 Q20 4 20 5.5 V9 M20 15 V18.5 Q20 20 18.5 20 H15 M9 20 H5.5 Q4 20 4 18.5 V15"
          fill="none"
          {...stroke}
        />
      );
      break;
    case 'sort':
      // Trois filets dégressifs, alignés à gauche (en-tête de la feuille).
      body = <Path d="M3.5 6 H20.5 M3.5 12 H15.5 M3.5 18 H10.5" fill="none" {...stroke} strokeWidth={2.2} />;
      break;
    case 'close':
      body = <Path d="M5 5 L19 19 M19 5 L5 19" fill="none" {...stroke} strokeWidth={2} />;
      break;
    case 'back':
      body = <Path d="M15 4.5 L7.5 12 L15 19.5" fill="none" {...stroke} strokeWidth={2} />;
      break;
    case 'reply':
      // Deux bulles carrées superposées (bouton « Répondre »).
      body = (
        <>
          <Path d="M8 7 V5.5 Q8 4 9.5 4 H19.5 Q21 4 21 5.5 V12.5 Q21 14 19.5 14 H18" fill="none" {...stroke} />
          <Path d="M4.5 8 H14.5 Q16 8 16 9.5 V16.5 Q16 18 14.5 18 H7.6 L4.6 20.4 Q3 21.6 3 19.8 V9.5 Q3 8 4.5 8 Z" fill="none" {...stroke} />
        </>
      );
      break;
    case 'flag':
      body = <Path d="M5 21 V3.8 H18.5 L15.8 8.2 L18.5 12.6 H5" fill="none" {...stroke} />;
      break;
    case 'send':
      body = <Path d="M3.5 11.6 L20.5 4 L14.6 20.4 L11.3 13 Z M11.3 13 L20.5 4" fill={fill} {...stroke} />;
      break;
    default:
      body = null;
  }
  const k = optical(name);
  return k ? <G transform={k}>{body}</G> : body;
}

/**
 * Les TROIS ÉCLATS blancs posés au-dessus du pouce vert quand on aime
 * (référence : ils apparaissent pendant que le pouce se redresse, puis
 * restent tant que le j'aime est posé). Grille 24 au-dessus de la pointe.
 */
export function LikeSparks({ size, color }: { size: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const };
  return (
    <Svg width={size} height={size / 2} viewBox="0 0 24 12" {...hidden}>
      <Path d="M7 5 L9.4 8.6" {...stroke} />
      <Path d="M12.4 2.6 V7.4" {...stroke} />
      <Path d="M18 4.4 L15.2 7.6" {...stroke} />
    </Svg>
  );
}

/** Pastille « vérifié » de la feuille : disque bleu, coche blanche. */
export function VerifiedBadge({ size, color, mark }: { size: number; color: string; mark: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Circle cx={12} cy={12} r={11} fill={color} />
      <Path d="M7 12.4 L10.4 15.6 L17 8.8" fill="none" stroke={mark} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
