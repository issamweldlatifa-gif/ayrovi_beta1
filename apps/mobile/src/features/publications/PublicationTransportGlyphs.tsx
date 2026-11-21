import Svg, { G, Path } from 'react-native-svg';
import { PUBLICATION_PALETTE as P, PUBLICATION_OVERLAY_TEXT } from './publicationTokens';
import { PublicationText } from './publicationDesign';
import { StyleSheet, View } from 'react-native';

const SKIP_ARC = 'M6.8 8.2a13 13 0 1 1-3 11.1M5 3.5v6.2h6.4';
const PAUSE_BARS = 'M8.5 6v16M19.5 6v16';

export function PublicationSkipGlyph({ forward }: { forward: boolean }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skip}>
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <G transform={forward ? 'translate(32 0) scale(-1 1)' : undefined}>
        <Path d={SKIP_ARC} fill="none" stroke={P.backdrop} strokeWidth={3.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={SKIP_ARC} fill="none" stroke={P.paper}
          strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
    <View style={[StyleSheet.absoluteFill, styles.number]}>
      <PublicationText color={P.paper} variant="caption" style={PUBLICATION_OVERLAY_TEXT}>10</PublicationText>
    </View>
  </View>;
}

export function PublicationPauseGlyph() {
  return <Svg width={28} height={28} viewBox="0 0 28 28" accessibilityElementsHidden>
    <Path d={PAUSE_BARS} stroke={P.backdrop} strokeWidth={6} strokeLinecap="round" />
    <Path d={PAUSE_BARS} stroke={P.paper} strokeWidth={4.5} strokeLinecap="round" />
  </Svg>;
}

const styles = StyleSheet.create({
  skip: { width: 32, height: 32 },
  number: { justifyContent: 'center', alignItems: 'center' },
});
