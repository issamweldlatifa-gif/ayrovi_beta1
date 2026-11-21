import type { ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useFooterInfo } from '@/api/hooks';
import { BackButton } from '@/design/BackButton';
import { rowDirectionFor } from '@/design/layoutLogic';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { FOOTER_THEME, RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { returnsPaths } from '@/features/returns/paths';
import { useT } from '@/i18n';

export function OrderShell({ title, fallback, children }: { title: string; fallback: string; children: ReactNode }) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: theme.colors.canvas }]}>
    <View style={[styles.header, { borderBottomColor: theme.colors.line, flexDirection: rowDirectionFor(theme.isRTL) }]}>
      <BackButton onPress={() => goBack(fallback)} label={t('common.back')} />
      <AppText variant="subtitle" accessibilityRole="header" style={styles.label}>{title}</AppText>
    </View>
    {children}
  </View>;
}

export function OrderSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.section, { borderTopColor: theme.colors.line }]}>
    <AppText variant="h3" accessibilityRole="header">{title}</AppText>
    {children}
  </View>;
}

export function OrderFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><AppText variant="captionStrong">{label}</AppText><AppText>{value || '—'}</AppText></View>;
}

export function OrderHelp({ title, orderNumber, onClose, hint, context, showPolicy = true }: {
  title: string; orderNumber?: string; onClose: () => void; hint?: string; context?: ReactNode; showPolicy?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const footer = useFooterInfo();
  const [linkError, setLinkError] = useState(false);
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.scrim}>
      <View testID="order-help-dialog" style={[styles.dialog, { backgroundColor: theme.colors.canvas }]} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.dialogContent}>
          <AppText variant="h3" accessibilityRole="header">{title}</AppText>
          <AppText variant="bodySmall">{hint ?? t('orders.contactHint')}</AppText>
          {orderNumber ? <OrderFact label={t('orders.number')} value={orderNumber} /> : null}
          {context}
          {footer.isPending ? <LoadingBlock /> : footer.isError && !footer.data ? <ErrorBlock error={footer.error} onRetry={() => void footer.refetch()} /> : <>
            {footer.data?.channels.length ? footer.data.channels.map(channel => <Pressable key={channel.id} accessibilityRole="link" style={styles.contact}
              onPress={() => { setLinkError(false); void Linking.openURL(channel.href).catch(() => setLinkError(true)); }}>
              <AppText variant="bodyStrong">{channel.label}</AppText>
            </Pressable>) : <AppText>{t('footer.noContact')}</AppText>}
          </>}
          {linkError ? <AppText accessibilityRole="alert">{t('footer.linkError')}</AppText> : null}
          {showPolicy ? <Button label={t('orders.returnPolicy')} tone="quiet" onPress={() => { onClose(); router.push(returnsPaths.policy); }} /> : null}
          <Button label={t('common.close')} onPress={onClose} />
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 10, minHeight: 50, gap: 8, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, label: { flex: 1 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 12 }, fact: { flex: 1, minWidth: '40%', gap: 4 },
  scrim: { flex: 1, backgroundColor: FOOTER_THEME.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: RADIUS.lg }, dialogContent: { padding: 20, gap: 12 },
  contact: { minHeight: 44, justifyContent: 'center' },
});
