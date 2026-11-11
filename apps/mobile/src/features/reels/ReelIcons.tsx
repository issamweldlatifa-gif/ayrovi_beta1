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

/** Pouce haut — main (la manchette est un `Rect` à part, comme sur la référence). */
const THUMB_HAND =
  'M8 10.2 L13 4.4 Q14.3 3.1 14.2 4.8 L13.5 9.6 H20.2 Q21.7 9.6 21.1 11 L17.8 19.8 Q17.5 20.6 16.7 20.6 H9 Q8 20.6 8 19.6 Z';
/** Manchette détachée à gauche de la main. */
const THUMB_CUFF = { x: 2.4, y: 10.4, width: 3, height: 10.2, rx: 1.5 };

/** Bulle carrée, queue en bas à gauche. */
const BUBBLE =
  'M6 4 H19 Q21 4 21 6 V15 Q21 17 19 17 H8.6 L4.9 20.3 Q4 21.1 4 19.9 V6 Q4 4 6 4 Z';

/** Flèche de partage courbe. */
const SHARE =
  'M14 4 L21.3 10.7 L14 17.5 V13.6 Q7.4 13.4 3 20 Q3.6 9.6 14 8 Z';

/** Cœur plein, pointe basse (gabarit de la référence : large et bombé). */
export const HEART_PATH =
  'M12 20.6 C11.6 20.6 2.4 14.8 2.4 8.7 C2.4 5.6 4.7 3.4 7.5 3.4 C9.4 3.4 11 4.5 12 6.2 C13 4.5 14.6 3.4 16.5 3.4 C19.3 3.4 21.6 5.6 21.6 8.7 C21.6 14.8 12.4 20.6 12 20.6 Z';

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
}

/** Un glyphe de la famille Reels — trait 1.8, grille 24. */
export function ReelGlyph({ name, size, color, filled = false, mirrored = false }: ReelGlyphProps) {
  const stroke = {
    stroke: color,
    strokeWidth: REEL_GLYPH_STROKE,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const fill = filled ? color : 'none';
  const flip = mirrored ? 'translate(24 0) scale(-1 1)' : undefined;

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
      body = <Path d={BUBBLE} fill={fill} {...stroke} />;
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

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <G transform={flip}>{body}</G>
    </Svg>
  );
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
