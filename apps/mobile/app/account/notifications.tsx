/**
 * Mes notifications — ce que le compte a reçu (compte, commandes, paiements).
 *
 * Le serveur en renvoie jusqu'à 100, les plus récentes d'abord. « Tout marquer
 * comme lu » est une écriture : elle exige le jeton CSRF, comme le reste.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { fetchNotifications, markNotificationsRead } from '@/api/account';
import { userMessage } from '@/api/errors';
import { SubScreen } from '@/design/subScreen';

export default function NotificationsScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState('');

  const notifications = useQuery({
    queryKey: ['account', 'notifications'],
    queryFn: ({ signal }) => fetchNotifications({ signal }),
  });

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account'] }),
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0;

  return (
    <SubScreen
      title={t('notifications.title')}
      subtitle={t('notifications.subtitle')}
      onRefresh={() => notifications.refetch()}
      refreshing={notifications.isRefetching}
    >
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.danger.fg}>{failure}</AppText>
      ) : null}
      {notifications.isLoading ? <LoadingBlock /> : null}
      {notifications.isError ? <ErrorBlock error={notifications.error} onRetry={() => notifications.refetch()} /> : null}
      {notifications.data && notifications.data.length === 0 ? (
        <EmptyBlock><AppText variant="body" align="center">{t('notifications.empty')}</AppText></EmptyBlock>
      ) : null}

      {unread > 0 ? (
        <Button label={t('notifications.markAll', { count: unread })} onPress={() => { setFailure(''); markAll.mutate(); }} busy={markAll.isPending} />
      ) : null}

      {notifications.data?.map((item) => (
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
        </Card>
      ))}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
