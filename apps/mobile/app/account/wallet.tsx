import { AppText } from '@/design/ui';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { WALLET_PREVIEW_BALANCE } from '@/features/wallet/WalletCard';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function WalletScreen() {
  const t = useT();
  const { status } = useSession();
  return <PersonalLayout title={t('wallet.title')} fallback="/(tabs)/account">
    {status === 'signedIn' ? <>
      <AppText variant="bodyStrong">{t('wallet.balance')}</AppText>
      <AppText variant="h2">{WALLET_PREVIEW_BALANCE}</AppText>
      <AppText variant="body">{t('wallet.description')}</AppText>
    </> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}
