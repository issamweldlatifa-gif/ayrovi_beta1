/**
 * Illustrations des états vides (panier, favoris) — dessinées, pas importées.
 *
 * Pourquoi dessiner plutôt qu'une photo : l'état vide est vu par CHAQUE nouvel
 * utilisateur, y compris hors-ligne et en mode sombre. Un SVG aux couleurs de
 * la marque pèse quelques centaines d'octets, se redimensionne sans flou et
 * suit le thème (encre / jaune), au lieu d'une image figée à télécharger.
 *
 * Forme reprise de la référence marchande validée : une étoile crénelée, une
 * flèche, un sac, des pastilles et des filets. Les couleurs restent les nôtres :
 * encre noire, jaune d'action, gris de filet.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';

/** Étoile crénelée : points alternés (extérieur / intérieur) sur un cercle. */
function starburst(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  return Array.from({ length: spikes * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / spikes) * index - Math.PI / 2;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ');
}

/** Panier vide : « rien à acheter » + une invitation à regarder les sélections. */
export function EmptyBagArt() {
  const theme = useTheme();
  const ink = theme.colors.ink;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 240, height: 150 }}>
      <Svg width="100%" height="100%" viewBox="0 0 240 150">
        <Polygon points={starburst(62, 52, 34, 24, 11)} fill="none" stroke={ink} strokeWidth={4} strokeLinejoin="round" />
        <Path d="M112 52h34" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <Path d="M134 40l12 12-12 12" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M186 44v-6a10 10 0 0 1 20 0v6" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <Rect x={172} y={44} width={48} height={56} rx={6} fill={ink} />
        <Circle cx={52} cy={112} r={7} fill={BRAND.yellow} />
        <Circle cx={72} cy={112} r={7} fill={BRAND.yellow} />
        <Circle cx={92} cy={112} r={7} fill={BRAND.yellow} />
        <Rect x={108} y={99} width={54} height={26} rx={2} fill={BRAND.yellow} />
        <Path d="M172 104h40M172 114h40" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** Favoris vides : un cœur, la même grammaire que le bouton qui le remplit. */
export function EmptyHeartArt() {
  const theme = useTheme();
  const ink = theme.colors.ink;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 200, height: 160 }}>
      <Svg width="100%" height="100%" viewBox="0 0 200 160">
        <Path
          d="M100 132C66 106 40 84 40 60c0-20 20-31 36-21 9 6 16 14 24 25 8-11 15-19 24-25 16-10 36 1 36 21 0 24-26 46-60 72Z"
          fill={BRAND.yellow}
          stroke={ink}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Path d="M36 24h16M44 16v16M156 36h12M162 30v12M160 122h14M167 115v14" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
