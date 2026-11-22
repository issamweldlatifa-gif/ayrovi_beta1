import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PurchasedItem } from '@/api/account';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';

export function PurchaseShelf({ items }: { items: PurchasedItem[] }) {
  const t = useT();
  const { colors, iconSize, isRTL, radius } = useTheme();
  const direction = rowDirectionFor(isRTL);
  return <View testID="account-purchases">
    <View style={[styles.heading, { backgroundColor: colors.canvas, flexDirection: direction }]}>
      <Ionicons name="bag-check-outline" size={iconSize.md} color={colors.ink} accessibilityElementsHidden />
      <AppText variant="subtitle" accessibilityRole="header">{t('account.hub.purchases')}</AppText>
    </View>
    <View style={[styles.cards, { flexDirection: direction }]}>
      {items.map(item => <Pressable key={item.id} testID={`purchase-${item.id}`} accessibilityRole="link" accessibilityLabel={item.name}
        onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.orderId } })}
        style={[styles.item, { borderColor: colors.line, borderRadius: radius.card }]}>
        <View style={[styles.photo, { backgroundColor: colors.canvas }]}>
          {item.imageUrl ? <AppImage uri={mediaUrl(item.imageUrl)} style={StyleSheet.absoluteFill} decorative contentFit="contain" />
            : <Ionicons name="bag-outline" size={iconSize.lg} color={colors.muted} accessibilityElementsHidden />}
        </View>
        <View style={[styles.caption, { flexDirection: direction }]}>
          <AppText variant="captionStrong" style={styles.name} numberOfLines={2}>{item.name}</AppText>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={iconSize.sm} color={colors.ink} accessibilityElementsHidden />
        </View>
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 20, paddingVertical: 10, gap: 8, alignItems: 'center' },
  cards: { padding: 16, flexWrap: 'wrap', gap: 8 },
  item: { width: '47%', flexGrow: 1, maxWidth: '50%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  photo: { aspectRatio: 1.4, alignItems: 'center', justifyContent: 'center' },
  caption: { padding: 8, gap: 6, alignItems: 'center' }, name: { flex: 1, minWidth: 0 },
});
