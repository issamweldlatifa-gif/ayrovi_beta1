/**
 * Skeleton / Shimmer — **قرار المالك (26/11 عصراً)**: لا انتظار صامت ولا دُوّامة
 * عامة. مكان كل بطاقة منتج يظهر قالبها الرمادي المتحرك فوراً، وكل معلومة توصل
 * تعمّر مكانها (تعمير تدريجي: نداء لكل متجر، وما يجي يُعرض).
 *
 * الحركة: نبض شفافية بسيط (JS-driven — يعمل في الاختبارات كما على الجهاز)،
 * والألوان من الثيم الرسمي — ما فماش لون خارج الهوية.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';

function usePulse(): Animated.Value {
  const value = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 650, useNativeDriver: false }),
      Animated.timing(value, { toValue: 0.45, duration: 650, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

/** صفّ قالب بطاقة: مربّع صورة + سطر عنوان عريض + سطر سعر + سطر قصير. */
export function SkeletonRow({ testID }: { testID?: string }) {
  const theme = useTheme();
  const opacity = usePulse();
  const bone = { backgroundColor: theme.colors.lineControl };
  return <Animated.View
    testID={testID ?? 'sbase-skeleton-row'}
    accessible={false}
    style={[styles.row, { opacity }]}>
    <View style={[styles.image, bone]} />
    <View style={styles.grow}>
      <View style={[styles.line, bone, { width: '82%' }]} />
      <View style={[styles.line, bone, { width: '58%' }]} />
      <View style={[styles.lineShort, bone, { width: '38%' }]} />
    </View>
  </Animated.View>;
}

/** مجموعة قوالب لمتجر في الانتظار — 5 قوالب (حدّ النتائج المطبَّق في الخادم). */
export function SkeletonGroup({ sourceId, count = 5 }: { sourceId: string; count?: number }) {
  return <View testID={`sbase-skeleton-${sourceId}`} accessible={false}>
    {Array.from({ length: count }, (_, index) => (
      <SkeletonRow key={index} testID={`sbase-skeleton-${sourceId}-${index}`} />
    ))}
  </View>;
}

/** قالب فيش المنتج كاملة: معرض + عنوان + أسطر + شرائح خيارات. */
export function SkeletonFiche() {
  const theme = useTheme();
  const opacity = usePulse();
  const bone = { backgroundColor: theme.colors.lineControl };
  return <Animated.View testID="sbase-skeleton-fiche" accessible={false} style={[styles.fiche, { opacity }]}>
    <View style={[styles.gallery, bone]} />
    <View style={[styles.line, bone, { width: '90%' }]} />
    <View style={[styles.line, bone, { width: '45%' }]} />
    <View style={[styles.lineShort, bone, { width: '70%' }]} />
    <View style={styles.chipsRow}>
      <View style={[styles.chipBone, bone]} />
      <View style={[styles.chipBone, bone]} />
      <View style={[styles.chipBone, bone]} />
    </View>
    <View style={[styles.line, bone, { width: '60%' }]} />
    <View style={[styles.line, bone, { width: '75%' }]} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 10 },
  row: {
    flexDirection: 'row', gap: 12, padding: 10, marginBottom: 10,
    alignItems: 'center',
  },
  image: { width: 88, height: 88, borderRadius: RADIUS.md },
  line: { height: 14, borderRadius: RADIUS.sm },
  lineShort: { height: 12, borderRadius: RADIUS.sm },
  fiche: { gap: 16, paddingVertical: 12 },
  gallery: { width: '100%', aspectRatio: 1.4, borderRadius: RADIUS.md },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chipBone: { width: 64, height: 26, borderRadius: RADIUS.xl },
});
