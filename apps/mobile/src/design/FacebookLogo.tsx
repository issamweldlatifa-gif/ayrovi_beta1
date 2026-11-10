/**
 * Marque « f » de Facebook (identité de marque d'un TIERS, imposée par ses
 * règles d'usage — à ne pas modifier). Dessin vectoriel : net à toutes les
 * tailles, sans image à charger. Les couleurs viennent de `FACEBOOK_BRAND`,
 * seule exception à la palette ZAYROVI avec `GOOGLE_BRAND`.
 */
import Svg, { Path } from 'react-native-svg';
import { FACEBOOK_BRAND } from '@/design/tokens.mobile';

export function FacebookLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      {/* Disque bleu. */}
      <Path
        fill={FACEBOOK_BRAND.blue}
        d="M24 0C10.75 0 0 10.75 0 24c0 11.98 8.78 21.91 20.25 23.7V30.94h-6.09V24h6.09v-5.28c0-6.02 3.58-9.34 9.07-9.34 2.63 0 5.37.47 5.37.47v5.9h-3.03c-2.98 0-3.91 1.85-3.91 3.75V24h6.66l-1.06 6.94h-5.6v16.76C39.22 45.91 48 35.98 48 24 48 10.75 37.25 0 24 0z"
      />
      {/* Le « f » blanc. */}
      <Path
        fill={FACEBOOK_BRAND.onBlue}
        d="M33.31 30.94 34.37 24h-6.66v-4.5c0-1.9.93-3.75 3.91-3.75h3.03v-5.9s-2.74-.47-5.37-.47c-5.49 0-9.07 3.32-9.07 9.34V24h-6.09v6.94h6.09v16.76a24.2 24.2 0 0 0 7.5 0V30.94h5.6z"
      />
    </Svg>
  );
}
