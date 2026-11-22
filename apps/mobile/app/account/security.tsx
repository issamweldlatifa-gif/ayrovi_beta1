/** Sécurité du compte : vérification du contact, sessions actives et accès au formulaire de mot de passe. */
import { useState } from 'react';
import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmEmailVerification, fetchDeviceSessions, fetchSecurity, logoutOtherDevices,
  requestEmailVerification, revokeDeviceSession,
} from '@/api/account';
import { relativeTimeLabel } from '@/format/relativeTime';
import { authMessage } from '@/api/authMessages';
import { SubScreen } from '@/design/subScreen';
import { router, type Href } from 'expo-router';
import { useSession } from '@/state/session';

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function SecurityScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const session = useSession();

  const security = useQuery({ queryKey: ['account', 'security'], queryFn: ({ signal }) => fetchSecurity({ signal }) });

  // Appareils connectés (12/11/2026) : la liste réelle du serveur, pas un compteur.
  const devices = useQuery({ queryKey: ['account', 'sessions'], queryFn: ({ signal }) => fetchDeviceSessions({ signal }) });
  const [deviceBusy, setDeviceBusy] = useState('');
  const [deviceMessage, setDeviceMessage] = useState('');
  const reportError = (error: unknown) => {
    const message = authMessage(error);
    return 'key' in message ? t(message.key) : message[locale];
  };
  const refreshDevices = async () => {
    await queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] });
    await queryClient.invalidateQueries({ queryKey: ['account', 'security'] });
  };
  const revoke = async (handle: string) => {
    setDeviceBusy(handle); setDeviceMessage('');
    try { await revokeDeviceSession(handle); await refreshDevices(); }
    catch (error) { setDeviceMessage(reportError(error)); }
    finally { setDeviceBusy(''); }
  };
  const revokeOthers = async () => {
    setDeviceBusy('all'); setDeviceMessage('');
    try {
      const count = await logoutOtherDevices();
      setDeviceMessage(t('security.devicesClosed', { count }));
      await refreshDevices();
    } catch (error) { setDeviceMessage(reportError(error)); }
    finally { setDeviceBusy(''); }
  };
  const otherDevices = (devices.data ?? []).filter((device) => !device.current).length;

  // Confirmation de l'adresse : code envoyé à l'adresse, saisi ICI (session du compte).
  const accountEmail = session.account?.email ?? '';
  const [challenge, setChallenge] = useState<{ id: string; masked: string } | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const sendEmailCode = async () => {
    setEmailBusy(true); setEmailMessage('');
    try {
      const sent = await requestEmailVerification(locale);
      if (sent.alreadyVerified) { await refreshDevices(); return; }
      setChallenge({ id: sent.challengeId, masked: sent.maskedEmail });
      setEmailCode(sent.developmentCode);
    } catch (error) { setEmailMessage(reportError(error)); }
    finally { setEmailBusy(false); }
  };
  const confirmEmail = async () => {
    if (!challenge) return;
    setEmailBusy(true); setEmailMessage('');
    try {
      await confirmEmailVerification(challenge.id, emailCode, locale);
      setChallenge(null); setEmailCode('');
      await queryClient.invalidateQueries({ queryKey: ['account'] });
      await session.refreshAccount();
    } catch (error) { setEmailMessage(reportError(error)); }
    finally { setEmailBusy(false); }
  };

  return (
    <SubScreen
      title={t('security.title')}
      subtitle={t('security.subtitle')}
      onRefresh={() => security.refetch()}
      refreshing={security.isRefetching}
    >
      {security.isLoading ? <LoadingBlock /> : null}
      {security.isError ? <ErrorBlock error={security.error} onRetry={() => security.refetch()} /> : null}

      {security.data ? (
        <Card title={t('security.status')}>
          <KeyValue label={t('security.phone')} value={security.data.phoneVerified ? t('security.verified') : t('security.unverified')} />
          <KeyValue label={t('security.email')} value={security.data.emailVerified ? t('security.verified') : t('security.unverified')} />
          <KeyValue label={t('security.password')} value={security.data.hasPassword ? t('security.passwordSet') : t('security.passwordNone')} />
          <KeyValue label={t('security.sessions')} value={String(security.data.activeSessions)} />
          {security.data.identities.length > 0 ? (
            <KeyValue
              label={t('security.providers')}
              value={security.data.identities.map((identity) => identity.provider).join(' · ')}
            />
          ) : null}
        </Card>
      ) : null}

      {security.data && !security.data.emailVerified && !security.data.phoneVerified ? (
        <Card title={t('security.verifyCard')} hint={t('security.verifyHint')}>
          <AppText variant="body" color={theme.colors.secondary}>{t('security.verifyHow')}</AppText>
          <Button label={t('security.verifyGo')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : null}

      {security.data && !security.data.emailVerified && accountEmail ? (
        <Card title={t('security.emailConfirmTitle')} hint={t('security.emailConfirmHint')}>
          {challenge ? (
            <>
              <AppText variant="body" color={theme.colors.secondary}>{t('security.emailCodeSent', { email: challenge.masked })}</AppText>
              <Field
                label={t('security.emailCode')}
                value={emailCode}
                onChangeText={setEmailCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                editable={!emailBusy}
                testID="security-email-code"
              />
              <Button label={t('security.emailConfirm')} onPress={confirmEmail} busy={emailBusy} disabled={emailCode.replace(/\D/g, '').length !== 6} testID="security-email-confirm" />
              <Button label={t('security.emailResend')} tone="quiet" onPress={sendEmailCode} disabled={emailBusy} />
            </>
          ) : (
            <Button label={t('security.emailSend')} onPress={sendEmailCode} busy={emailBusy} testID="security-email-send" />
          )}
          {emailMessage ? (
            <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>{emailMessage}</AppText>
          ) : null}
        </Card>
      ) : null}

      <Card title={t('security.devices')} hint={t('security.devicesHint')}>
        {devices.isLoading ? <LoadingBlock /> : null}
        {(devices.data ?? []).map((device) => (
          <KeyValue
            key={device.handle}
            label={[device.platform, device.client].filter(Boolean).join(' · ') + (device.current ? ` — ${t('security.thisDevice')}` : '')}
            value={[device.lastSeenAt ? relativeTimeLabel(device.lastSeenAt, locale) : '', device.ipMasked].filter(Boolean).join(' · ')}
          />
        ))}
        {(devices.data ?? []).filter((device) => !device.current).map((device) => (
          <Button
            key={`revoke-${device.handle}`}
            label={t('security.deviceRevoke', { device: [device.platform, device.client].filter(Boolean).join(' · ') })}
            tone="danger"
            onPress={() => revoke(device.handle)}
            busy={deviceBusy === device.handle}
            disabled={Boolean(deviceBusy)}
            testID={`security-revoke-${device.handle}`}
          />
        ))}
        {otherDevices > 0 ? (
          <Button label={t('security.devicesRevokeOthers')} tone="danger" onPress={revokeOthers} busy={deviceBusy === 'all'} disabled={Boolean(deviceBusy)} testID="security-logout-others" />
        ) : null}
        {deviceMessage ? <AppText accessibilityRole="alert" variant="label" color={theme.colors.secondary}>{deviceMessage}</AppText> : null}
      </Card>

      {security.data ? <Card title={t('security.change')}>
        {security.data.hasPassword ? <Button label={t('security.submit')} onPress={() => router.push('/account/password' as Href)} /> :
          <AppText variant="body" color={theme.colors.muted}>{t('security.noPassword')}</AppText>}
      </Card> : null}
    </SubScreen>
  );
}
