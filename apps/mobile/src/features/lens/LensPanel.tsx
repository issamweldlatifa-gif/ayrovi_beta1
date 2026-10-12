/**
 * لوحة Lens الداخلية: تُفتح فوق شاشة Lens نفسها (بدون تنقّل إلى صفحة أخرى)،
 * وإغلاقها يعيد المستعمل إلى الكاميرا المفتوحة.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export interface LensPanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function LensPanel({ title, subtitle, onClose, children }: LensPanelProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lens.close')}
            onPress={onClose}
            style={[styles.back, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control }]}
          >
            <Ionicons name="close" size={22} color={theme.colors.ink} />
          </Pressable>
          <View style={styles.titles}>
            <AppText variant="lead" weight="bold">{title}</AppText>
            {subtitle ? <AppText variant="caption" color={theme.colors.muted}>{subtitle}</AppText> : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, gap: 2 },
  body: { padding: 16, gap: 12 },
});
