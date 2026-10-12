/**
 * الظل الخلفي للدرج: يعتم الشاشة تحته، والنقر عليه يطلب الإغلاق (كالسهم).
 * شفافيته تُحسب على خيط الواجهة من موضع الدرج، فيخفت مع الحركة نفسها.
 */
import { Pressable, StyleSheet } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';

export interface SheetBackdropProps {
  animatedStyle: AnimatedStyle<ViewStyle>;
  onPress: () => void;
}

export function SheetBackdrop({ animatedStyle, onPress }: SheetBackdropProps) {
  const { t } = useI18n();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lens.close')}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.5)' },
});
