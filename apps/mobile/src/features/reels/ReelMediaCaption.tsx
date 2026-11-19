import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

/** A single line over the video. Only text that wraps gets an expand action. */
export function ReelMediaCaption({ text }: { text: string }) {
  const theme = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [wraps, setWraps] = useState(false);
  const ink = theme.colors.onMedia;
  if (!text) return null;

  return (
    <View testID="reel-media-caption">
      {/* Measure at the actual width, independently of the visible More link. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.measure]}>
        <AppText testID="reel-measure-caption" variant="caption" onTextLayout={event => setWraps(event.nativeEvent.lines.length > 1)}>{text}</AppText>
      </View>
      {expanded ? (
        <>
          <ScrollView nestedScrollEnabled style={styles.expanded}>
            <AppText variant="caption" color={ink}>{text}</AppText>
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }} onPress={() => setExpanded(false)} style={styles.collapse}>
            <AppText variant="captionStrong" color={ink}>{t('reel.captionLess')}</AppText>
          </Pressable>
        </>
      ) : wraps ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${text} — ${t('reel.captionMore')}`}
          accessibilityState={{ expanded: false }} onPress={() => setExpanded(true)}
          style={[styles.expand, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <AppText variant="caption" color={ink} numberOfLines={1} style={styles.preview}>{text}</AppText>
          <AppText variant="captionStrong" color={ink} numberOfLines={1} style={styles.more}>{t('reel.captionMore')}</AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" color={ink} numberOfLines={1}>{text}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { bottom: 'auto', opacity: 0 },
  preview: { flexShrink: 1, minWidth: 0 },
  more: { maxWidth: '45%' },
  expand: { minHeight: 44, alignItems: 'center', gap: 6 },
  expanded: { maxHeight: 112 },
  collapse: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
});
