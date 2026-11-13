import { Platform, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from './theme';
import { NAVIGATION_ARROW_SIZE, OPACITY } from './tokens.mobile';

/**
 * Croix de fermeture d'un écran plein écran (visionneuse photo…) — RÈGLE du 13/11 :
 * elle vit EN HAUT, dans une rangée d'en-tête, à la place exacte d'une flèche
 * retour, et elle en a le dessin : même cible 44 × 44, même boîte de glyphe
 * (`NAVIGATION_ARROW_SIZE`), même trait fin de 1,7 aux extrémités arrondies,
 * même atténuation à l'appui. Une croix n'est jamais une icône d'une autre
 * famille, ni posée en bas ou flottante au milieu de l'image.
 */
export function CloseButton({
  onPress,
  label,
  color,
  testID,
}: {
  onPress: () => void;
  label: string;
  color?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const hidden = Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : { accessibilityElementsHidden: true };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? OPACITY.subtle : 1,
      })}
    >
      <Svg width={NAVIGATION_ARROW_SIZE} height={NAVIGATION_ARROW_SIZE} viewBox="0 0 32 32" {...hidden}>
        <Path
          d="M6 6l20 20M26 6 6 26"
          stroke={color || theme.colors.ink}
          strokeWidth={1.7}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
