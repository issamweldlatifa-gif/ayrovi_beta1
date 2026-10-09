/**
 * مسلك الطلب — مؤشّر المراحل (Q5، 08/10/2026).
 *
 * الشكل **أصلي**: شريط أفقي بنقاط وخطوط تقدّم، بأيقونات التطبيق.
 *
 * لكن القاعدة المهمّة موش في الشكل: **الحالة تُقرا من الواقع، موش من عدّاد.**
 * المرحلة «الآن» تتحدّد **بموضع التمرير**، والمراحل المكتملة هي اللي المستعمل
 * **عناوينها صالحة فعلاً** (`completedSteps` تجي من تحقّق الشاشة). فما فمّاش
 * «مرحلة 2 من 4» على حاجة ما زالت ما تكملتش — وهذا بالضبط الفرق بين مؤشّر
 * يوثّق فيه المستعمل ومؤشّر يزوّق.
 *
 * واللمس على مرحلة ⇒ **ينقلّها** (scroll). المؤشّر أداة تنقّل، موش صورة.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';

export interface JourneyStep {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface JourneyProgressProps {
  steps: JourneyStep[];
  /** فهرس المرحلة الظاهرة الآن — **من التمرير**، موش من عدّاد. */
  activeIndex: number;
  /** المراحل اللي بياناتها صالحة فعلاً (تحقّق الشاشة، موش تفاؤل). */
  completed: boolean[];
  onStepPress: (index: number) => void;
  /** هل يمكن التنقّل؟ (النموذج ناقص ⇒ التنقّل يبقى متاحاً، والمرحلة تقول حالتها). */
  disabled?: boolean;
}

export function JourneyProgress({
  steps, activeIndex, completed, onStepPress, disabled = false,
}: JourneyProgressProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { flexDirection: rowDirectionFor(theme.isRTL) }]} accessibilityRole="tablist">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const done = completed[index] === true;
        const current = index === activeIndex;
        const tone = done ? theme.status.success.fg : current ? theme.status.info.fg : theme.colors.line;
        const labelColor = done || current ? theme.colors.ink : theme.colors.muted;

        return (
          <View key={step.id} style={[styles.stepWrap, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step.label}
              accessibilityState={{ selected: current }}
              onPress={() => onStepPress(index)}
              disabled={disabled}
              style={styles.hit}
            >
              <View style={[styles.dot, { borderColor: tone, backgroundColor: done ? tone : 'transparent' }]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={theme.colors.onAccent} />
                ) : (
                  <Ionicons name={step.icon} size={14} color={current ? theme.status.info.fg : theme.colors.muted} />
                )}
              </View>
              <AppText variant="caption" weight={current ? 'bold' : 'regular'} color={labelColor} numberOfLines={1}>
                {step.label}
              </AppText>
            </Pressable>

            {isLast ? null : (
              <View style={[styles.line, { backgroundColor: done ? theme.status.success.fg : theme.colors.line }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 0 },
  stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  hit: { alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { flex: 1, height: 2, marginBottom: 20 },
});
