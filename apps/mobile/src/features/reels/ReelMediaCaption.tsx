import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { veil } from '@/design/tokens.mobile';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { ReelViewerText } from './ReelViewerChrome';
import { REEL_TYPE, REEL_VIEWER as V } from './reelViewerStyle';

/** A line by default; only an actual measured overflow reveals More, including Expo web. */
export function ReelMediaCaption({ text, maxExpandedHeight = 212 }: { text: string; maxExpandedHeight?: number }) {
  const { isRTL } = useTheme();
  const t = useT();
  const { fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [wraps, setWraps] = useState(false);
  const more = t('reel.captionMore'), less = t('reel.captionLess');
  if (!text) return null;

  return <View testID="reel-media-caption">
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.measure]}>
      <ReelViewerText tone="caption" testID="reel-measure-caption" onTextLayout={event => setWraps(event.nativeEvent.lines.length > 1)}
        onLayout={event => setWraps(event.nativeEvent.layout.height > REEL_TYPE.caption.lineHeight * fontScale * 1.5)}>{text}</ReelViewerText>
    </View>
    {expanded ? <>
      <LinearGradient pointerEvents="none" colors={[veil(0), veil(0.52), veil(0.52), veil(0)]}
        locations={[0, 0.16, 0.87, 1]} style={[styles.scrim, isRTL ? styles.scrimRTL : styles.scrimLTR]} />
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: maxExpandedHeight }}>
        <ReelViewerText tone="caption" color={V.paper}>{text}</ReelViewerText>
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel={less} accessibilityState={{ expanded: true }} aria-expanded onPress={() => setExpanded(false)}
        style={[styles.collapse, { alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
        <ReelViewerText tone="caption" color={V.paper}>{less}</ReelViewerText>
      </Pressable>
    </> : wraps ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${text} — ${more}`} accessibilityState={{ expanded: false }} aria-expanded={false}
        onPress={() => setExpanded(true)} hitSlop={{ top: 0, bottom: 12, left: 2, right: 2 }} style={[styles.expand, { flexDirection: rowDirectionFor(isRTL) }]}>
        <ReelViewerText tone="caption" color={V.paper} numberOfLines={1} style={styles.preview}>{text}</ReelViewerText>
        <ReelViewerText tone="caption" color={V.paper} numberOfLines={1} style={styles.more}>{more}</ReelViewerText>
      </Pressable>
    ) : <ReelViewerText tone="caption" color={V.paper} numberOfLines={1}>{text}</ReelViewerText>}
  </View>;
}

const styles = StyleSheet.create({
  measure: { bottom: 'auto', opacity: 0 },
  scrim: { ...StyleSheet.absoluteFill, top: -8, bottom: -12 },
  scrimLTR: { left: -V.inset, right: -V.railReserve },
  scrimRTL: { left: -V.railReserve, right: -V.inset },
  preview: { flexShrink: 1, minWidth: 0, flex: 1 },
  more: { maxWidth: '45%' },
  expand: { alignItems: 'center', gap: 8 },
  collapse: { minHeight: 44, justifyContent: 'center' },
});
