/** Explicit Clean-only palette and reference composer glyphs. Commerce theme is unchanged. */
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { useI18n } from '@/i18n';
import { AppText } from '@/design/ui';
import palette from '../../../../../shared/cleanAppearance.json';
import { CLEAN_COMPOSER } from '@/design/tokens.mobile';
export const CLEAN = palette;
// Mobile-only contrast and action sizing approved from the owner's phone reference.
export const CLEAN_CANVAS = CLEAN_COMPOSER.canvas;
export const CLEAN_ACTION_SIZE = CLEAN_COMPOSER.actionSize;
export const CLEAN_COMPOSER_RADIUS = CLEAN_COMPOSER.radius;
// Approved local system-sans exception; never changes commerce typography.
export const CLEAN_TYPE = { fontFamily: Platform.OS === 'ios' ? 'Arial' : 'sans-serif', fontWeight: '400' as const };
export function CleanSpeakerIcon({ role }: { role: 'user' | 'assistant' }) {
  return <Image source={role === 'user' ? require('../../../../../assets/brand/clean/customer-speaker.png') : require('../../../../../assets/brand/clean/assistant-speaker.png')} style={{ width: 30, height: 30 }} resizeMode="contain" accessible={false} />;
}
export function CleanWordmark() {
  const { t } = useI18n();
  return <View style={styles.wordmark} accessible accessibilityLabel={t('tabs.sonim')}>
    <AppText variant="h2" style={{ ...CLEAN_TYPE, color: CLEAN.ink }}>clea</AppText>
    <View><AppText variant="h2" style={{ ...CLEAN_TYPE, color: CLEAN.ink }}>n</AppText>
      <View style={styles.star}><Svg width={9} height={9} viewBox="0 0 20 20"><Path fill={CLEAN.star} d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0Z" /></Svg></View>
    </View>
  </View>;
}

export function CleanActionGlyph({ state }: { state: 'wave' | 'send' | 'busy' | 'recording' }) {
  return <Svg testID="clean-action-glyph" width={CLEAN_ACTION_SIZE} height={CLEAN_ACTION_SIZE} viewBox="2 2 20 20">
    <Path fill={CLEAN.orange} d={CLEAN.actionShape} />
    {state === 'wave' ? <Path d="M7 10.5V13.5M9.5 8.5V15.5M12 6.5V17.5M14.5 8.5V15.5M17 10.5V13.5" fill="none" stroke={CLEAN.paper} strokeWidth={1.3} strokeLinecap="round" /> : state === 'send' ? <Path d="M12 17V7M8 11L12 7L16 11" stroke={CLEAN.paper} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : state === 'busy' ? <Circle cx={12} cy={12} r={2.7} fill={CLEAN.paper} /> : <Rect x={8} y={8} width={8} height={8} fill={CLEAN.paper} />}
  </Svg>;
}
const styles = StyleSheet.create({ wordmark: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, star: { position: 'absolute', right: -4, top: 4 } });

export function CleanMenuGlyph() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M4 8h16M4 16h10" stroke={CLEAN.ink} strokeWidth={1.5} strokeLinecap="round" /></Svg>;
}
