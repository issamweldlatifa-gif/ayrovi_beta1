/** Explicit Clean-only palette and reference composer glyphs. Commerce theme is unchanged. */
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/design/ui';
import { FONTS } from '@/design/tokens.generated';
import palette from '../../../../../shared/cleanAppearance.json';
export const CLEAN = palette;
export function CleanWordmark() {
  return <View style={styles.wordmark} accessible accessibilityLabel={'clean'}>
    <AppText variant="h2" style={{ fontFamily: FONTS.latin.regular, color: CLEAN.ink }}>clean</AppText>
    <View style={styles.star}><Svg width={10} height={10} viewBox="0 0 20 20"><Path fill={CLEAN.text} d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0Z" /></Svg></View>
  </View>;
}
export function CleanActionGlyph({ state }: { state: 'wave' | 'send' | 'busy' | 'recording' }) {
  return <Svg width={44} height={44} viewBox="0 0 24 24">
    <Path fill={CLEAN.orange} d="M3 22V11A9 9 0 1 1 7.2 18.6Z" />
    {state === 'wave' ? <Path d="M7 10V13M9.5 8V15M12 6V17M14.5 8V15M17 10V13" fill="none" stroke={CLEAN.paper} strokeWidth={1.3} strokeLinecap="round" /> : state === 'send' ? <Path d="M12 17V7M8 11L12 7L16 11" stroke={CLEAN.paper} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : state === 'busy' ? <Circle cx={12} cy={11} r={2.7} fill={CLEAN.paper} /> : <Rect x={8} y={7} width={8} height={8} fill={CLEAN.paper} />}
  </Svg>;
}
const styles = StyleSheet.create({ wordmark: { width: 88, height: 42, alignItems: 'center', justifyContent: 'center' }, star: { position: 'absolute', right: 14, top: 1 } });
