/**
 * Icône officielle AYROVI Lens (viseur + lentille + point orange signature).
 *
 * Tracée depuis `docs/ayrovi-icon-refs/traced-batch/04-commerce-ai__11__AYROVIX-Lens.svg`
 * (grille 24×24, trait 1.286). Généré : ne pas éditer les coordonnées à la main.
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/design/theme';

export type LensGlyphProps = {
  size?: number;
  /** Trait. Par défaut : `theme.colors.ink`. */
  color?: string;
  /** Point signature. Par défaut : `theme.colors.accent` (orange de l'identité). */
  accentColor?: string;
};

const PATHS = [
  'M3.158 7.177 L3.158 6.855 L3.158 6.534 L3.158 6.212 L3.158 5.891 L3.158 5.569 L3.158 5.248 L3.158 4.926 L3.158 4.605 L3.479 4.283 L3.801 3.962 L4.122 3.640 L4.444 3.640 L4.765 3.640 L5.087 3.640 L5.408 3.640 L5.730 3.962 L6.052 3.962 L6.373 3.962 L6.695 3.640',
  'M3.158 16.502 L3.158 16.823 L3.158 17.145 L3.158 17.466 L3.158 17.788 L3.158 18.109 L3.158 18.431 L3.158 18.752 L3.158 19.074 L3.158 19.395 L3.479 19.717 L3.801 20.038 L4.122 20.038 L4.444 20.038 L4.765 20.038 L5.087 20.038 L5.408 20.038 L5.730 20.038 L6.052 20.038 L6.373 20.038 L6.695 20.038',
  'M16.662 20.038 L16.984 20.038 L17.305 20.038 L17.627 20.038 L17.948 20.038 L18.270 20.038 L18.592 20.038 L18.913 20.038 L19.235 20.038 L19.556 20.038 L19.878 20.038 L20.199 19.717 L20.199 19.395 L20.521 19.074 L20.521 18.752 L20.521 18.431 L20.521 18.109 L20.521 17.788 L20.521 17.466 L20.521 17.145 L20.521 16.823'
];

const LENS_CIRCLE = { cx: 11.711, cy: 11.951, r: 5.159 };
const SIGNATURE_DOT = { cx: 18.138, cy: 4.283, r: 2.78 };

export default function LensGlyph({ size = 24, color, accentColor }: LensGlyphProps) {
  const theme = useTheme();
  const ink = color ?? theme.colors.ink;
  const accent = accentColor ?? theme.colors.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {PATHS.map((d, i) => (
        <Path key={i} d={d} stroke={ink} strokeWidth={1.286} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      <Circle cx={LENS_CIRCLE.cx} cy={LENS_CIRCLE.cy} r={LENS_CIRCLE.r} stroke={ink} strokeWidth={1.286} fill="none" />
      <Circle cx={SIGNATURE_DOT.cx} cy={SIGNATURE_DOT.cy} r={SIGNATURE_DOT.r} fill={accent} />
    </Svg>
  );
}
