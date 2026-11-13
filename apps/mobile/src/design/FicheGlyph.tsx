/**
 * Pictogrammes de la grande fiche — 14/11/2026.
 *
 * Relevés sur les planches Privé by Zalando du propriétaire (écrans
 * `Screenshot_20261113_0237*`) : chaque section porte l'objet qu'elle décrit,
 * pas une icône générique :
 *
 *   ruler      Taille · Dimensions          (réglet vertical, graduations à droite)
 *   yarn       Matière                      (pelote de laine et son fil)
 *   mannequin  Taille & coupe               (buste de couturière sur pied)
 *   truck      Livraison rapide             (camion et traits de vitesse)
 *   expand     Agrandir la photo            (quatre coins, en bas à droite de la galerie)
 *
 * Trait fin de 1,5 sur une grille de 24 — la même épaisseur que les icônes
 * « outline » d'Ionicons, qui restent utilisées pour le reste (palette,
 * étiquette, partage, puce…). Dessinés en SVG plutôt qu'en chargeant une police
 * d'icônes de plus : quelques octets au lieu d'un fichier de police dans l'APK.
 */
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Path } from 'react-native-svg';

export type FicheDrawnGlyph = 'ruler' | 'yarn' | 'mannequin' | 'truck' | 'expand';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type FicheGlyphName = FicheDrawnGlyph | IoniconName;

const DRAWN: ReadonlySet<string> = new Set<FicheDrawnGlyph>(['ruler', 'yarn', 'mannequin', 'truck', 'expand']);

export function isDrawnGlyph(name: string): name is FicheDrawnGlyph {
  return DRAWN.has(name);
}

/** Tracés (grille 24 × 24, trait 1,5, extrémités arrondies). */
export const FICHE_GLYPH_PATHS: Record<FicheDrawnGlyph, string> = {
  ruler: 'M7.5 2.75h9v18.5h-9z M16.5 6h-3.5 M16.5 9h-2 M16.5 12h-3.5 M16.5 15h-2 M16.5 18h-3.5',
  yarn: 'M4.6 7.8c3.8.2 9 4.7 10.3 10.6 M6.6 4.9c4.5.8 9.7 5.8 10.6 11.2 M9.6 3.3c3.9 1.1 8 5.3 8.6 9.6 M3.4 12.2c2.6.6 5.6 3.4 6.4 6.6 M16.2 18.3c1.3 1.2 2.9 1.6 4.6 1',
  mannequin: 'M9.5 2.75h5 M9.5 2.75c0 2.1-2.5 3.2-2.5 6.1 0 2.6 2 3.9 2 5.9h6c0-2 2-3.3 2-5.9 0-2.9-2.5-4-2.5-6.1 M12 14.75v6.5 M9 21.25h6',
  truck: 'M6.5 6.75h9v9.5h-9z M15.5 9.75h3.2l2.55 3.1v3.4h-5.75 M1.5 9.25h3 M2.5 12.25h2',
  expand: 'M4 9.5V4h5.5 M14.5 4H20v5.5 M20 14.5V20h-5.5 M9.5 20H4v-5.5',
};

export function FicheGlyph({
  name,
  size,
  color,
  testID,
}: {
  name: FicheGlyphName;
  size: number;
  color: string;
  testID?: string;
}) {
  if (!isDrawnGlyph(String(name))) {
    return <Ionicons name={name as IoniconName} size={size} color={color} accessibilityElementsHidden testID={testID} />;
  }
  const drawn = name as FicheDrawnGlyph;
  const yarnBall = drawn === 'yarn';
  const truck = drawn === 'truck';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden testID={testID ?? `fiche-glyph-${drawn}`}>
      {yarnBall ? <Circle cx={11} cy={11.5} r={8.25} stroke={color} strokeWidth={1.5} fill="none" /> : null}
      {truck ? (
        <>
          <Circle cx={9.5} cy={17.6} r={1.65} stroke={color} strokeWidth={1.5} fill="none" />
          <Circle cx={18} cy={17.6} r={1.65} stroke={color} strokeWidth={1.5} fill="none" />
        </>
      ) : null}
      <Path d={FICHE_GLYPH_PATHS[drawn]} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
