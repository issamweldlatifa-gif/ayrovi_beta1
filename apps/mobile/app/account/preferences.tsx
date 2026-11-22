import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { savePreferences, type Preferences } from '@/api/account';
import { userMessage } from '@/api/errors';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsGroup, SettingsSwitch } from '@/features/settings/SettingsRows';
import { notificationChannels, notificationKey, useNotificationSettings } from '@/features/settings/notificationSettings';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function PreferencesScreen() {
  const { t } = useI18n();
  const { status, account } = useSession();
  return <PersonalLayout title={t('preferences.title')} fallback="/account/settings">
    {status === 'signedIn' && account?.id ? <NotificationSettings key={account.id} owner={account.id} /> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}

function NotificationSettings({ owner }: { owner: string }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const client = useQueryClient();
  const preferences = useNotificationSettings(owner);
  const update = useMutation({
    mutationFn: (patch: Partial<Preferences>) => savePreferences(patch),
    onSuccess: (_result, patch) => {
      client.setQueryData<Preferences>(notificationKey(owner), previous => previous ? { ...previous, ...patch } : undefined);
      void client.invalidateQueries({ queryKey: notificationKey(owner) });
    },
  });
  if (preferences.isPending) return <LoadingBlock />;
  if (preferences.isError) return <ErrorBlock error={preferences.error} onRetry={() => void preferences.refetch()} />;
  return <>
    <AppText>{t('preferences.subtitle')}</AppText>
    <SettingsGroup title={t('preferences.channels')}>
      {notificationChannels.map((channel, index) => <SettingsSwitch key={channel.key} title={t(channel.label)} icon={channel.icon}
        divided={index !== notificationChannels.length - 1} value={preferences.data[channel.key]} disabled={update.isPending}
        onChange={value => update.mutate({ [channel.key]: value })} />)}
    </SettingsGroup>
    {update.isError ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{userMessage(update.error)[locale]}</AppText> : null}
  </>;
}
