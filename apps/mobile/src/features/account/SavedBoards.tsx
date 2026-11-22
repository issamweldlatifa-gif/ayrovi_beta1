/**
 * « Ma sélection » — deux tableaux, comme la référence marchande validée :
 *   • **Favoris** : ce que l'utilisateur a mis de côté (cœur jaune de la marque).
 *   • **Articles achetés** : visible UNIQUEMENT après un achat réel (payé ou
 *     livré). Aucun tableau vide inventé, aucun compteur faux.
 *
 * Chaque tableau ouvre la vraie liste : les favoris serveur, ou l'historique
 * de commandes. Le compteur vient de la synthèse du compte (source unique).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';

type Board = { id: string; title: string; count: number; icon: keyof typeof Ionicons.glyphMap; field: string; onPress: () => void };

export function SavedBoards({ favorites, purchases, onFavorites, onOrders }: {
  favorites: number;
  purchases: number;
  onFavorites: () => void;
  onOrders: () => void;
}) {
  const t = useT();
  const { colors, iconSize, isRTL, radius, opacity } = useTheme();
  const boards: Board[] = [
    { id: 'favorites', title: t('favorites.title'), count: favorites, icon: 'heart', field: BRAND.yellow, onPress: onFavorites },
    ...(purchases > 0
      ? [{ id: 'purchases', title: t('account.hub.purchases'), count: purchases, icon: 'bag-handle' as const, field: colors.canvas, onPress: onOrders }]
      : []),
  ];
  return (
    <View testID="account-saved-boards" style={[styles.row, { flexDirection: rowDirectionFor(isRTL) }]}>
      {boards.map((board) => (
        <Pressable
          key={board.id}
          testID={`account-board-${board.id}`}
          accessibilityRole="link"
          accessibilityLabel={`${board.title} · ${t('favorites.count', { count: board.count })}`}
          onPress={board.onPress}
          style={({ pressed }) => [styles.board, { borderColor: colors.line, borderRadius: radius.card }, pressed && { opacity: opacity.subtle }]}
        >
          <View style={[styles.field, { backgroundColor: board.field, borderColor: colors.line }]}>
            <Ionicons name={board.icon} size={iconSize.lg} color={board.id === 'favorites' ? BRAND.black : colors.muted} accessibilityElementsHidden />
          </View>
          <View style={styles.caption}>
            <AppText variant="label" numberOfLines={1}>{board.title}</AppText>
            <AppText variant="caption" color={colors.muted}>{t('favorites.count', { count: board.count })}</AppText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  board: { flex: 1, minWidth: 0, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, backgroundColor: BRAND.white },
  field: { aspectRatio: 1.5, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  caption: { padding: 10, gap: 2 },
});
