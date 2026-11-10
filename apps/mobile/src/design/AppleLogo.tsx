/**
 * Marque d'Apple (le glyphe de la pomme ; identité de marque d'un TIERS,
 * imposée par ses règles d'usage — à ne pas modifier). Dessin vectoriel : net
 * à toutes les tailles, sans image à charger. La couleur vient de
 * `APPLE_BRAND`, seule exception à la palette ZAYROVI avec `GOOGLE_BRAND`.
 */
import Svg, { Path } from 'react-native-svg';
import { APPLE_BRAND } from '@/design/tokens.mobile';

export function AppleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      {/* La pomme : corps, feuille et creux, glyphe officiel simplifié. */}
      <Path
        fill={APPLE_BRAND.black}
        d="M33.24 25.42c.05 5.43 4.76 7.24 4.81 7.26-.04.13-.75 2.57-2.48 5.09-1.49 2.18-3.04 4.35-5.48 4.4-2.4.04-3.17-1.42-5.91-1.42-2.74 0-3.6 1.37-5.87 1.47-2.36.09-4.15-2.35-5.65-4.52-3.07-4.44-5.42-12.54-2.27-18.01 1.57-2.72 4.36-4.44 7.4-4.49 2.31-.04 4.49 1.55 5.91 1.55 1.41 0 4.07-1.92 6.86-1.64 1.17.05 4.45.47 6.55 3.56-.17.1-3.91 2.28-3.87 6.75zM28.66 12.36c1.25-1.51 2.09-3.61 1.86-5.7-1.8.07-3.98 1.2-5.27 2.71-1.16 1.34-2.17 3.48-1.9 5.53 2.01.16 4.06-1.02 5.31-2.54z"
      />
    </Svg>
  );
}
