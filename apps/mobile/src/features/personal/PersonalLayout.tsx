import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LoadingBlock } from '@/design/states';
import { KeyboardAvoider } from '@/design/keyboard';
import { OrderShell } from '@/features/orders/OrderLayout';
import { useTheme } from '@/design/theme';
import { AppText, Button } from '@/design/ui';
import { useT } from '@/i18n';

export function PersonalLayout({ title, fallback = '/account/profile', children, footer, refresh, refreshing = false }: {
  title: string; fallback?: string; children: ReactNode; footer?: ReactNode; refresh?: () => void; refreshing?: boolean;
}) {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  return <KeyboardAvoider style={styles.fill}>
    <OrderShell title={title} fallback={fallback}>
      <ScrollView style={styles.fill} keyboardShouldPersistTaps="handled"
        refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}
        contentContainerStyle={[styles.body, { paddingBottom: footer ? 24 : bottom + 24 }]}>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderTopColor: theme.colors.line, paddingBottom: bottom + 12 }]}>
        <View style={styles.footerInner}>{footer}</View>
      </View> : null}
    </OrderShell>
  </KeyboardAvoider>;
}

export function PersonalGuest({ loading }: { loading: boolean }) {
  const t = useT();
  return loading ? <LoadingBlock /> : <>
    <AppText>{t('personal.signInHint')}</AppText>
    <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
  </>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 24 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingHorizontal: 20 },
  footerInner: { width: '100%', maxWidth: 580, alignSelf: 'center' },
});
