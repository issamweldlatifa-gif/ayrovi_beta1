/**
 * Mes notifications — ce que le compte a reçu (compte, commandes, paiements).
 *
 * Le serveur en renvoie jusqu'à 100, les plus récentes d'abord. « Tout marquer
 * comme lu » est une écriture : elle exige le jeton CSRF, comme le reste.
 */
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { fetchNotifications, markNotificationsRead } from '@/api/account';
import { userMessage } from '@/api/errors';
import { useSession } from '@/state/session';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { NotificationsEmpty } from '@/features/personal/NotificationsEmpty';
import { rowDirectionFor } from '@/design/layoutLogic';
import { notificationDestination } from '@/features/account/notificationLink';

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function NotificationsScreen() {
  const { status, account } = useSession();
  const t = useI18n().t;
  if (status !== 'signedIn' || !account?.id) return <PersonalLayout title={t('notifications.title')} fallback="/(tabs)/account"><PersonalGuest loading={status === 'loading'} /></PersonalLayout>;
  return <Inbox key={account.id} owner={account.id} />;
}

function Inbox({ owner }: { owner: string }) {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState('');

  const notifications = useQuery({
    queryKey: ['account', 'notifications', owner, locale],
    queryFn: ({ signal }) => fetchNotifications({ signal, headers: { 'Accept-Language': locale } }),
  });

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['account', 'notifications', owner] }), queryClient.invalidateQueries({ queryKey: ['account', 'overview', owner] })]),
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationsRead(id),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['account', 'notifications', owner] }), queryClient.invalidateQueries({ queryKey: ['account', 'overview', owner] })]),
  });
  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0;

  return (
    <PersonalLayout
      title={t('notifications.title')}
      fallback="/(tabs)/account"
      refresh={() => void notifications.refetch()}
      refreshing={notifications.isRefetching}
    >
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>{failure}</AppText>
      ) : null}
      {notifications.isLoading ? <LoadingBlock /> : null}
      {notifications.isError ? <ErrorBlock error={notifications.error} onRetry={() => notifications.refetch()} /> : null}
      {!notifications.isError && notifications.data?.length === 0 ? (
        <NotificationsEmpty />
      ) : null}

      {unread > 0 ? (
        <Button label={t('notifications.markAll', { count: unread })} onPress={() => { setFailure(''); markAll.mutate(); }} busy={markAll.isPending} />
      ) : null}

      {notifications.data?.map((item) => {
        const storyId = item.id.startsWith('story_alert_') ? /^\/stories\?id=([a-zA-Z0-9_-]{1,150})$/.exec(item.actionUrl)?.[1] : undefined;
        // Le back office écrit des chemins web ; on les traduit en écrans réels.
        const destination = storyId ? null : notificationDestination(item.actionUrl);
        return (
          <Card key={item.id} title={item.title || item.type}>
            <View style={[styles.head, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
              <AppText variant="caption" color={item.readAt ? theme.colors.muted : theme.status.info.fg}>
                {item.readAt ? t('notifications.read') : t('notifications.unread')}
              </AppText>
              {item.createdAt ? (
                <AppText variant="caption" color={theme.colors.muted}>{item.createdAt.slice(0, 10)}</AppText>
              ) : null}
            </View>
            {item.message ? <AppText variant="body">{item.message}</AppText> : null}
            {storyId ? <Button label={t('storiesEditorial.openAlert')} onPress={() => {
              if (!item.readAt) markOne.mutate(item.id);
              router.push({ pathname: '/stories', params: { id: storyId } });
            }} /> : null}
            {destination ? <Button label={t('notifications.open')} onPress={() => {
              if (!item.readAt) markOne.mutate(item.id);
              router.push(destination as Href);
            }} testID={`notification-open-${item.id}`} /> : null}
          </Card>
        );
      })}
    </PersonalLayout>
  );
}

const styles = StyleSheet.create({
  head: { flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
});
