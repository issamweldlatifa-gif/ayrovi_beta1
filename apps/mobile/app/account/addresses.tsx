import { AddressBook } from '@/features/personal/AddressBook';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AddressesScreen() {
  const t = useT();
  const { status, account } = useSession();
  return <PersonalLayout title={t('addresses.title')} fallback="/(tabs)/account">
    {status === 'signedIn' && account?.id ? <AddressBook key={account.id} owner={account.id} /> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}
