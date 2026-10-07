/**
 * Sécurité — état réel du compte, et changement de mot de passe.
 *
 * Le changement de mot de passe a une conséquence que l'utilisateur ne devine
 * pas : le serveur ferme TOUTES les sessions du compte (y compris celle-ci) et
 * en ouvre une seule, neuve. L'écran adopte ce nouveau jeton immédiatement —
 * sinon « ça a marché » se transformerait en « je suis déconnecté ».
 */
import { useState } from 'react';
import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changePassword, fetchSecurity } from '@/api/account';
import { authMessage } from '@/api/authMessages';
import { SubScreen } from '@/design/subScreen';
import { router } from 'expo-router';
import { useSession } from '@/state/session';

export default function SecurityScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const session = useSession();

  const security = useQuery({ queryKey: ['account', 'security'], queryFn: ({ signal }) => fetchSecurity({ signal }) });

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setFailure('');
    setDone(false);
    try {
      const issue = await changePassword(current, next);
      // Nouvelle session : on la garde AVANT tout autre appel.
      await session.adoptSession(issue);
      setCurrent('');
      setNext('');
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (error) {
      const message = authMessage(error);
      setFailure('key' in message ? t(message.key) : message[locale]);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = current.length > 0 && next.length >= 8 && next !== current;

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

      {/*
        * Точно là où le bouton « vérifier » de la caisse atterrit : sans e-mail ni
        * téléphone vérifié, la commande sera refusée par le serveur
        * (`CONTACT_VERIFICATION_REQUIRED`). L'écran doit dire POURQUOI et offrir
        * l'ACTION réelle (la connexion fournisseur / SMS) — un constat sans issue
        * serait une impasse déguisée en information.
        */}
      {security.data && !security.data.emailVerified && !security.data.phoneVerified ? (
        <Card title={t('security.verifyCard')} hint={t('security.verifyHint')}>
          <AppText variant="body" color={theme.colors.secondary}>{t('security.verifyHow')}</AppText>
          <Button label={t('security.verifyGo')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : null}

      {security.data?.hasPassword ? (
        <Card title={t('security.change')} hint={t('security.changeHint')}>
          <Field label={t('security.current')} value={current} onChangeText={setCurrent} secureTextEntry editable={!busy} />
          <Field label={t('security.next')} value={next} onChangeText={setNext} secureTextEntry editable={!busy} />
          {next.length > 0 && next.length < 8 ? (
            <AppText variant="caption" color={theme.colors.danger}>{t('security.tooShort')}</AppText>
          ) : null}
          {next.length > 0 && next === current ? (
            <AppText variant="caption" color={theme.colors.danger}>{t('security.same')}</AppText>
          ) : null}
          {failure ? (
            <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.colors.danger}>{failure}</AppText>
          ) : null}
          {done ? (
            <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.colors.accentText}>
              {t('security.changed')}
            </AppText>
          ) : null}
          <Button label={t('security.submit')} onPress={submit} busy={busy} disabled={!canSubmit} />
        </Card>
      ) : (
        <Card title={t('security.change')}>
          <AppText variant="body" color={theme.colors.muted}>{t('security.noPassword')}</AppText>
        </Card>
      )}
    </SubScreen>
  );
}
