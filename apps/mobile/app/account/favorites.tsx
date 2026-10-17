/**
 * Mes favoris — les produits mis de côté, tels que le serveur les connaît.
 *
 * Le même enregistrement sert le site et l'application : ajouter depuis le web
 * doit se voir ici, et inversement. On affiche le prix mémorisé en le marquant
 * comme tel — c'est un repère, pas le prix du jour.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n } from '@/i18n';
import { fetchFavorites, removeFavorite } from '@/api/account';
import { mediaUrl } from '@/api/client';
import { userMessage } from '@/api/errors';
import { SubScreen } from '@/design/subScreen';

export default function FavoritesScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState('');

  const favorites = useQuery({ queryKey: ['account', 'favorites'], queryFn: ({ signal }) => fetchFavorites({ signal }) });

  const remove = useMutation({
    mutationFn: (id: string) => removeFavorite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account'] }),
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  return (
    <SubScreen
      title={t('favorites.title')}
      subtitle={t('favorites.subtitle')}
      onRefresh={() => favorites.refetch()}
      refreshing={favorites.isRefetching}
    >
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.danger.fg}>{failure}</AppText>
      ) : null}
      {favorites.isLoading ? <LoadingBlock /> : null}
      {favorites.isError ? <ErrorBlock error={favorites.error} onRetry={() => favorites.refetch()} /> : null}
      {favorites.data && favorites.data.length === 0 ? (
        <EmptyBlock><AppText variant="body" align="center">{t('favorites.empty')}</AppText></EmptyBlock>
      ) : null}

      {favorites.data?.map((favorite) => (
        <Card key={favorite.id}>
          <View style={styles.row}>
            {favorite.imageUrl ? (
              <AppImage
                uri={mediaUrl(favorite.imageUrl)}
                style={[styles.thumb, { borderRadius: theme.radius.control, borderColor: theme.colors.line }]}
                contentFit="cover"
                accessibilityLabel={favorite.title}
              />
            ) : null}
            <View style={styles.text}>
              <AppText variant="label" weight="bold">{favorite.title}</AppText>
              {favorite.priceTnd !== null ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('favorites.price')} {favorite.priceTnd.toFixed(2)} DT
                </AppText>
              ) : null}
              {favorite.sourceUrl ? (
                <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{favorite.sourceUrl}</AppText>
              ) : null}
            </View>
          </View>
          <Button
            label={t('favorites.remove')}
            tone="quiet"
            onPress={() => { setFailure(''); remove.mutate(favorite.id); }}
            busy={remove.isPending}
          />
        </Card>
      ))}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  thumb: { width: 64, height: 64, borderWidth: StyleSheet.hairlineWidth },
});
