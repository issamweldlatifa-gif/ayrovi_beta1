import { Platform, Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { AppText, type AppTextProps } from '@/design/ui';
import { veil } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { REEL_TYPE, REEL_VIEWER as V } from './reelViewerStyle';

const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };

export type ViewerGlyph = 'back' | 'info' | 'play' | 'share' | 'sound' | 'muted' | 'options' | 'down' | 'up' | 'heart';

/** Optical siblings exclusive to the viewer; other screens keep their icons. */
export function ReelViewerGlyph({ name, size, color, rtl = false, selected = false }: {
  name: ViewerGlyph; size: number; color: string; rtl?: boolean; selected?: boolean;
}) {
  const line = { stroke: color, strokeWidth: 1.45, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const speaker = 'M3.5 9H6L10.7 5.6Q11.7 4.9 11.7 6.1V17.9Q11.7 19.1 10.7 18.4L6 15H3.5Q2.7 15 2.7 14.2V9.8Q2.7 9 3.5 9Z';
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
    {name === 'back' ? <Path d={rtl ? 'M8.5 3.5 16 12l-7.5 8.5' : 'M15.5 3.5 8 12l7.5 8.5'} fill="none" {...line} /> : null}
    {name === 'info' ? <><Circle cx="12" cy="12" r="10" fill="none" {...line} /><Path d="M12 10v7" {...line} /><Circle cx="12" cy="7" r="0.9" fill={color} /></> : null}
    {name === 'play' ? <Path d="M7 4.5Q7 3.3 8.1 4l12.3 7.1q1.4.9 0 1.8L8.1 20Q7 20.7 7 19.5Z" fill={color} /> : null}
    {name === 'share' ? <><Path d="m8.1 10.5 8-4.2m-8 7.2 8 4.2" {...line} /><Circle cx="5" cy="12" r="3.4" fill="none" {...line} /><Circle cx="19" cy="5" r="3.4" fill="none" {...line} /><Circle cx="19" cy="19" r="3.4" fill="none" {...line} /></> : null}
    {name === 'sound' || name === 'muted' ? <><Path d={speaker} fill={color} />{name === 'muted' ? <Path d="m15 9 6 6m0-6-6 6" {...line} /> : <Path d="M15.5 8.5a5 5 0 0 1 0 7m3-9.6a8.5 8.5 0 0 1 0 12.2" fill="none" {...line} />}</> : null}
    {name === 'options' ? [5, 12, 19].map(cx => <Circle key={cx} cx={cx} cy="12" r="1.75" fill={color} />) : null}
    {name === 'up' || name === 'down' ? <Path d={name === 'up' ? 'M3 15.5 12 7l9 8.5' : 'M3 8.5 12 17l9-8.5'} fill="none" {...line} /> : null}
    {name === 'heart' ? <Path d="M12 22C10 20 2 14 1.5 8.1 1 2.1 8.7.1 12 5c3.3-4.9 11-2.9 10.5 3.1C22 14 14 20 12 22Z" fill={selected ? color : 'none'} {...line} /> : null}
  </Svg>;
}

export function ReelViewerText({ tone, weight = 'regular', style, ...props }: Omit<AppTextProps, 'style'> & {
  tone: keyof typeof REEL_TYPE; weight?: 'regular' | 'bold'; style?: StyleProp<TextStyle>;
}) {
  const { locale } = useI18n();
  const localized = typeof props.children !== 'string' || /\p{Script=Arabic}/u.test(props.children);
  const fontFamily = locale === 'ar' && localized
    ? (weight === 'bold' ? 'NotoSansArabic-Bold' : 'NotoSansArabic-Regular')
    : (weight === 'bold' ? 'ZayroviExtracted-Bold' : 'ZayroviExtracted-Regular');
  return <AppText {...props} style={[REEL_TYPE[tone], { fontFamily }, (tone === 'caption' || tone === 'publisher') && styles.mediaText, style]} />;
}

export function ReelViewerHeaderButton({ kind, label, onPress }: { kind: 'back' | 'info'; label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable testID={`reel-viewer-${kind}`} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.target, { opacity: pressed ? theme.opacity.subtle : 1 }]}>
    <View style={[styles.disc, kind === 'back' ? styles.back : styles.info]}>
      <ReelViewerGlyph name={kind} size={kind === 'back' ? V.backGlyph : V.infoGlyph} color={V.paper} rtl={theme.isRTL} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  mediaText: { textShadowColor: veil(0.88), textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
  target: { width: V.headerTarget, height: V.headerTarget, alignItems: 'center', justifyContent: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: veil(0.57) },
  back: { width: V.backDisc, height: V.backDisc, borderRadius: V.backDisc / 2 },
  info: { width: V.infoDisc, height: V.infoDisc, borderRadius: V.infoDisc / 2 },
});
