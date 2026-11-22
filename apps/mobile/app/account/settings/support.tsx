import { useLocalSearchParams } from 'expo-router';
import { AppText, Card } from '@/design/ui';
import { SupportContacts } from '@/features/orders/OrderLayout';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { useT } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AccountSupportScreen() {
  const t = useT();
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const data = topic === 'data';
  return <PersonalLayout title={t(data ? 'personal.exportContact' : 'settings.feedback')}
    fallback={data ? '/account/data' : '/account/settings'}>
    <Card>
      <AppText>{t(data ? 'personal.exportBody' : 'settings.feedbackHint')}</AppText>
      <SupportContacts />
    </Card>
  </PersonalLayout>;
}
