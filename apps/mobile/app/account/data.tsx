import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { deleteCustomerAccount } from '@/api/account';
import { userMessage } from '@/api/errors';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText, Button, ToggleRow } from '@/design/ui';
import { OrderHelp } from '@/features/orders/OrderLayout';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';
const tabs = ['export', 'delete'] as const;

export default function DataScreen() {
  const { t } = useI18n();
  const { status, account, signOut } = useSession();
  const owner = status === 'signedIn' ? account?.id : undefined;
  const latest = useRef(owner);
  latest.current = owner;
  return <PersonalLayout title={t('personal.dataTitle')}>
    {owner ? <DataControls key={owner} finish={async () => {
      if (latest.current !== owner) return;
      await signOut();
      router.replace('/(tabs)/account');
    }} /> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}

function DataControls({ finish }: { finish: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<typeof tabs[number]>('export');
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const remove = async () => {
    if (!confirm || !checked || busy) return;
    setBusy(true); setFailure('');
    try {
      await deleteCustomerAccount();
      await finish();
      queryClient.removeQueries({ queryKey: ['account'], type: 'inactive' });
    } catch (error) { setFailure(userMessage(error)[locale]); }
    finally { setBusy(false); }
  };
  return <>
    <AppText variant="h2" accessibilityRole="header">{t('personal.dataLink')}</AppText>
    <AppText>{t('personal.dataIntro')}</AppText>
    <Pressable accessibilityRole="link" style={styles.link} onPress={() => router.push('/legal/privacy')}>
      <AppText variant="bodyStrong" style={styles.underline}>{t('auth.legal.privacy')}</AppText>
    </Pressable>
    <View accessibilityRole="tablist" style={[styles.tabs, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      {tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item, disabled: busy }} disabled={busy}
        onPress={() => { setTab(item); setConfirm(false); setChecked(false); setFailure(''); }}
        style={[styles.tab, { borderBottomColor: tab === item ? theme.colors.ink : theme.colors.line }]}>
        <AppText align="center" variant={item === tab ? 'bodyStrong' : 'bodySmall'}>{t(`personal.tab.${item}`)}</AppText>
      </Pressable>)}
    </View>
    {tab === 'export' ? <>
      <AppText>{t('personal.exportBody')}</AppText>
      <Button label={t('personal.exportContact')} block size="lg" onPress={() => setHelp(true)} />
    </> : <>
      <View style={styles.icon}><Ionicons name="trash-outline" size={theme.iconSize.xl} color={theme.colors.ink} /></View>
      <AppText variant="subtitle">{t('personal.deleteHeading')}</AppText>
      <AppText>{t('personal.deleteBody')}</AppText>
      <AppText>{t('personal.deleteKeep')}</AppText>
      {confirm ? <>
        <ToggleRow label={t('personal.deleteAcknowledgement')} value={checked} disabled={busy} onChange={setChecked} />
        <Button label={t('personal.deleteConfirm')} tone="danger" block busy={busy} disabled={!checked} onPress={() => void remove()} />
        <Button label={t('common.cancel')} tone="quiet" block disabled={busy} onPress={() => { setConfirm(false); setChecked(false); setFailure(''); }} />
      </> : <Button label={t('personal.deleteStart')} tone="danger" block size="lg" onPress={() => setConfirm(true)} />}
      {failure ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{failure}</AppText> : null}
    </>}
    {help ? <OrderHelp title={t('personal.exportContact')} hint={t('personal.exportBody')} onClose={() => setHelp(false)} showPolicy={false} /> : null}
  </>;
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' }, underline: { textDecorationLine: 'underline' },
  tabs: { gap: 8 }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 2 }, icon: { alignItems: 'center' },
});
