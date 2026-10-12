/**
 * درج Lens: طبقة تنزل من الأسفل فوق الكاميرا، داخل شاشة Lens نفسها.
 *
 * ليس نافذة (`Modal`) ولا صفحة: لا يغيّر المسار ولا يوقف الكاميرا. الإغلاق
 * الوحيد يمرّ عبر `onClose` (السهم، الزر ✕، أو النقر على الخلفية أو زر الرجوع)،
 * فيعود المستعمل دائماً إلى ما تحته.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export interface LensDrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function LensDrawer({ title, subtitle, onClose, children }: LensDrawerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const reduced = theme.motion.reduced === 0;
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : theme.motion.standard,
      useNativeDriver: true,
    }).start();
  }, [progress, reduced, theme.motion.standard]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [480, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* الخلفية المعتمة: النقر عليها يغلق الدرج كما يغلقه السهم. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lens.close')}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.canvas,
            borderTopLeftRadius: theme.radius.card,
            borderTopRightRadius: theme.radius.card,
            shadowColor: theme.colors.ink,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.colors.line }]} />
        <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
          <View style={styles.titles}>
            <AppText variant="lead" weight="bold">{title}</AppText>
            {subtitle ? <AppText variant="caption" color={theme.colors.muted}>{subtitle}</AppText> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lens.close')}
            onPress={onClose}
            style={styles.close}
          >
            <Ionicons name="chevron-down" size={24} color={theme.colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '82%',
    paddingTop: 8, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginBottom: 6 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titles: { flex: 1, gap: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12 },
});
