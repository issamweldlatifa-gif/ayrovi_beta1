import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOverview, saveNewsletterPreference, type AccountOverview } from '@/api/account';
import { userMessage } from '@/api/errors';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsSwitch } from '@/features/settings/SettingsRows';
import { useI18n, useT } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function NewsletterSettings() {
  const t = useT(); const { status, account } = useSession();
  return <PersonalLayout title={t('settings.newsletter')} fallback="/account/settings">
    {status === 'signedIn' && account?.id ? <Preference key={account.id} owner={account.id} /> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}

function Preference({ owner }: { owner: string }) {
  const { t, locale } = useI18n(); const theme = useTheme(); const client = useQueryClient();
  const key = ['account', 'overview', owner, locale];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchOverview({ signal, headers: { 'Accept-Language': locale } }) });
  const update = useMutation({ mutationFn: (value: boolean) => saveNewsletterPreference(value), onSuccess: account => {
    client.setQueryData<AccountOverview>(key, previous => previous ? { ...previous, account } : undefined);
    void client.invalidateQueries({ queryKey: ['account', 'overview', owner] });
  } });
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  return <>
    <SettingsSwitch title={t('settings.newsletterOptIn')} description={t('settings.newsletterHint')} value={query.data.account.marketingOptIn}
      disabled={update.isPending} onChange={value => update.mutate(value)} />
    {update.isSuccess ? <AppText accessibilityLiveRegion="polite">{t('settings.newsletterSaved')}</AppText> : null}
    {update.isError ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{userMessage(update.error)[locale]}</AppText> : null}
  </>;
}
