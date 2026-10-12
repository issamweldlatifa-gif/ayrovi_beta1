/**
 * إطار المسح فوق الكاميرا: أربع زوايا بيضاء، وشارة اختيارية فوق الإطار.
 * لا يتلقى اللمس، فالكاميرا تحته تبقى قابلة للتفاعل.
 */
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';

export interface LensScanFrameProps {
  /** نسبة العرض إلى الارتفاع للإطار (1 للمربّع، 1.25 للمستطيل المعروض في الماكيت). */
  ratio: number;
  /** نص الشارة فوق الإطار (مثلاً «Produit détecté»). لا شارة بلا نص. */
  label?: string;
}

const CORNER = 26;
const STROKE = 4;

export function LensScanFrame({ ratio, label }: LensScanFrameProps) {
  const theme = useTheme();
  const color = theme.colors.canvas;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={[styles.frame, { aspectRatio: ratio }]}>
        <View style={[styles.corner, styles.tl, { borderColor: color }]} />
        <View style={[styles.corner, styles.tr, { borderColor: color }]} />
        <View style={[styles.corner, styles.bl, { borderColor: color }]} />
        <View style={[styles.corner, styles.br, { borderColor: color }]} />
        {label ? (
          <View style={[styles.label, { backgroundColor: theme.colors.accent }]}>
            <AppText variant="caption" weight="bold" color={theme.colors.ink}>{label}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '72%' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 8 },
  label: { position: 'absolute', top: -40, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
});
