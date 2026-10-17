/**
 * الظل الخلفي للدرج: يعتم الشاشة تحته، والنقر عليه يطلب الإغلاق (كالسهم).
 * شفافيته تأتي من موضع الدرج نفسه، فتخفت مع الحركة.
 */
import { Animated, Pressable, StyleSheet } from 'react-native';

import { useI18n } from '@/i18n';
import { veil } from '../tokens.mobile';

export interface SheetBackdropProps {
  opacity: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
}

export function SheetBackdrop({ opacity, onPress }: SheetBackdropProps) {
  const { t } = useI18n();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sheet.close')}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: veil(0.5) },
});
