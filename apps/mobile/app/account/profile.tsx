import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { OrderSection } from '@/features/orders/OrderLayout';
import { AddressBook } from '@/features/personal/AddressBook';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function ProfileScreen() {
  const t = useT();
  const theme = useTheme();
  const { status, account, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const direction = rowDirectionFor(theme.isRTL);
  return <PersonalLayout title={t('profile.title')} fallback="/(tabs)/account">
    {status !== 'signedIn' || !account?.id ? <PersonalGuest loading={status === 'loading'} /> : <>
      <View style={styles.summary}>
        <View style={[styles.summaryRow, { flexDirection: direction }]}>
          {account.avatarUrl ? <AppImage uri={account.avatarUrl} style={styles.avatar} decorative contentFit="cover" /> : null}
          <AppText accessibilityRole="header" variant="h2" style={styles.name}>{account.displayName || t('profile.title')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={t('personal.edit')} style={[styles.edit, { borderColor: theme.colors.ink }]}
            onPress={() => router.push('/account/profile-edit' as Href)}>
            <Ionicons name="pencil-outline" size={theme.iconSize.md} color={theme.colors.ink} />
          </Pressable>
        </View>
        {account.email ? <AppText color={theme.colors.muted}>{account.email}</AppText> : null}
        {account.phone ? <AppText color={theme.colors.muted}>{account.phone}</AppText> : null}
        <Pressable accessibilityRole="link" style={styles.link} onPress={() => router.push('/account/password' as Href)}>
          <AppText variant="bodyStrong" style={styles.underline}>{t('security.change')}</AppText>
        </Pressable>
      </View>
      <OrderSection title={t('addresses.title')}><AddressBook key={account.id} owner={account.id} /></OrderSection>
      <OrderSection title={t('personal.dataTitle')}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/account/data' as Href)} style={[styles.dataLink, { flexDirection: direction }]}>
          <AppText style={styles.name}>{t('personal.dataLink')}</AppText>
          <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.md} color={theme.colors.ink} />
        </Pressable>
      </OrderSection>
      <Button label={t('account.signOut')} size="lg" block busy={busy} onPress={() => {
        setBusy(true);
        void signOut().finally(() => setBusy(false));
      }} />
    </>}
  </PersonalLayout>;
}

const styles = StyleSheet.create({
  summary: { gap: 8 }, summaryRow: { alignItems: 'center', gap: 12 }, name: { flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: RADIUS.full },
  edit: { width: 48, height: 48, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' }, underline: { textDecorationLine: 'underline' },
  dataLink: { alignItems: 'center', minHeight: 48, gap: 8 },
});
