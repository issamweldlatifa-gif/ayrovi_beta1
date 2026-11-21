import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changePassword, fetchSecurity } from '@/api/account';
import { authMessage } from '@/api/authMessages';
import { rowDirectionFor } from '@/design/layoutLogic';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppText, Button, Field } from '@/design/ui';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function PasswordScreen() {
  const { t } = useI18n();
  const { status, account, adoptSession } = useSession();
  const owner = status === 'signedIn' ? account?.id : undefined;
  const latest = useRef(owner);
  latest.current = owner;
  const security = useQuery({ queryKey: ['account', 'security', owner], enabled: Boolean(owner), queryFn: ({ signal }) => fetchSecurity({ signal }) });
  return <PersonalLayout title={t('security.change')}>
    {!owner ? <PersonalGuest loading={status === 'loading'} /> : security.isPending ? <LoadingBlock /> :
      security.isError ? <ErrorBlock error={security.error} onRetry={() => void security.refetch()} /> : security.data.hasPassword ?
        <PasswordForm key={owner} apply={async issue => { if (latest.current === owner && issue.account.id === owner) await adoptSession(issue); }} /> :
        <AppText>{t('security.noPassword')}</AppText>}
  </PersonalLayout>;
}

function PasswordForm({ apply }: { apply: (issue: Awaited<ReturnType<typeof changePassword>>) => Promise<void> }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const client = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [version, setVersion] = useState(0);
  const ready = current.length > 0 && next.length >= 8 && next !== current && confirmation === next;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(''); setDone(false);
    try {
      await apply(await changePassword(current, next));
      setCurrent(''); setNext(''); setConfirmation(''); setVersion(value => value + 1); setDone(true);
      void client.invalidateQueries({ queryKey: ['account'] });
    } catch (reason) {
      const message = authMessage(reason);
      setError('key' in message ? t(message.key) : message[locale]);
    } finally { setBusy(false); }
  };
  return <>
    <AppText>{t('security.changeHint')}</AppText>
    <SecretField key={`current:${version}`} label={t('security.current')} value={current} onChange={setCurrent} busy={busy} />
    <SecretField key={`next:${version}`} label={t('security.next')} value={next} onChange={setNext} busy={busy} replacement />
    <SecretField key={`confirm:${version}`} label={t('personal.confirmPassword')} value={confirmation} onChange={setConfirmation} busy={busy} replacement />
    {next && next.length < 8 ? <AppText color={theme.status.danger.fg}>{t('security.tooShort')}</AppText> : null}
    {next && next === current ? <AppText color={theme.status.danger.fg}>{t('security.same')}</AppText> : null}
    {confirmation && confirmation !== next ? <AppText color={theme.status.danger.fg}>{t('personal.passwordMismatch')}</AppText> : null}
    {error ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{error}</AppText> : null}
    {done ? <AppText accessibilityRole="alert" color={theme.status.success.fg}>{t('security.changed')}</AppText> : null}
    <Button label={t('security.submit')} onPress={() => void save()} busy={busy} disabled={!ready} block size="lg" />
  </>;
}

function SecretField({ label, value, onChange, busy, replacement = false }: {
  label: string; value: string; onChange: (value: string) => void; busy: boolean; replacement?: boolean;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return <View style={[styles.fieldRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <View style={styles.input}>
      <Field label={label} value={value} onChangeText={text => { if (!text) setVisible(false); onChange(text); }} secureTextEntry={!visible || !value} editable={!busy}
        autoCapitalize="none" autoCorrect={false} autoComplete={replacement ? 'new-password' : 'current-password'} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t(visible ? 'personal.hidePassword' : 'personal.showPassword')} · ${label}`}
      disabled={busy || !value} style={styles.eye} onPress={() => setVisible(prev => !prev)}>
      <Ionicons name={visible && value ? 'eye-off-outline' : 'eye-outline'} size={theme.iconSize.md} color={theme.colors.ink} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  fieldRow: { alignItems: 'flex-end', gap: 8 }, input: { flex: 1 },
  eye: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
