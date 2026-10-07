/**
 * Préférences de notification — ce que le compte accepte de recevoir.
 *
 * Volontairement SANS le thème : le thème de l'application est un réglage local
 * (`state/prefs`), le `dark_mode` du serveur pilote le site. Exposer les deux au
 * même endroit ferait croire à un seul réglage partagé.
 *
 * Chaque interrupteur envoie UN SEUL champ : le serveur complète les autres avec
 * la valeur déjà enregistrée, donc un envoi partiel ne remet rien à zéro.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Card, ToggleRow } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { fetchPreferences, savePreferences, type Preferences } from '@/api/account';
import { userMessage } from '@/api/errors';
import { AccountScreen } from '@/features/account/SubScreen';

const CHANNELS: Array<{ key: keyof Preferences; label: string }> = [
  { key: 'orderUpdates', label: 'preferences.order' },
  { key: 'paymentUpdates', label: 'preferences.payment' },
  { key: 'shippingUpdates', label: 'preferences.shipping' },
  { key: 'invoiceUpdates', label: 'preferences.invoice' },
];

export default function PreferencesScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState('');

  const preferences = useQuery({ queryKey: ['account', 'preferences'], queryFn: ({ signal }) => fetchPreferences({ signal }) });

  const update = useMutation({
    mutationFn: (patch: Partial<Preferences>) => savePreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account'] }),
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  return (
    <AccountScreen
      title={t('preferences.title')}
      subtitle={t('preferences.subtitle')}
      onRefresh={() => preferences.refetch()}
      refreshing={preferences.isRefetching}
    >
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.colors.danger}>{failure}</AppText>
      ) : null}
      {preferences.isLoading ? <LoadingBlock /> : null}
      {preferences.isError ? <ErrorBlock error={preferences.error} onRetry={() => preferences.refetch()} /> : null}

      {preferences.data ? (
        <Card title={t('preferences.channels')}>
          {CHANNELS.map((channel) => (
            <ToggleRow
              key={channel.key}
              label={t(channel.label as 'preferences.order')}
              value={preferences.data![channel.key]}
              disabled={update.isPending}
              onChange={(value) => {
                setFailure('');
                // Mise à jour optimiste : l'interrupteur doit suivre le doigt,
                // et l'écriture part immédiatement derrière.
                queryClient.setQueryData<Preferences>(['account', 'preferences'], {
                  ...preferences.data!,
                  [channel.key]: value,
                });
                update.mutate({ [channel.key]: value } as Partial<Preferences>);
              }}
            />
          ))}
          <AppText variant="caption" color={theme.colors.muted}>{t('preferences.note')}</AppText>
        </Card>
      ) : null}
    </AccountScreen>
  );
}
