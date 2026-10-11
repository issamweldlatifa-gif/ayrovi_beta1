/**
 * Carte « produit lié » d'un contenu (Reel, Publication, Story).
 *
 * • variante `row`     : bandeau horizontal (publications, stories) ;
 * • variante `overlay` : bloc posé sur la vidéo (Reels plein écran).
 *
 * « Découvrir » ouvre la page produit DE L'APPLICATION (`/product/[id]`), jamais un site.
 * Un produit indisponible reste cliquable : la page produit affiche son état réel.
 */
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { AppImage } from '@/design/appImage';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';

export interface LinkedProductCardProps {
  product: LinkedProduct;
  variant?: 'row' | 'overlay';
  onOpen?: (product: LinkedProduct) => void;
  testID?: string;
}

export function LinkedProductCard({ product, variant = 'row', onOpen, testID }: LinkedProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const overlay = variant === 'overlay';

  const open = () => {
    if (onOpen) onOpen(product);
    else router.push({ pathname: '/product/[id]', params: { id: product.id } });
  };

  return (
    <View
      testID={testID ?? `linked-product-${product.id}`}
      style={[
        styles.card,
        overlay ? styles.overlay : null,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderColor: theme.colors.line },
      ]}
    >
      <AppImage
        uri={product.image ? mediaUrl(product.image) : null}
        style={[styles.thumb, { borderRadius: theme.radius.control }]}
        contentFit="cover"
        accessibilityLabel={product.name}
        decorative={!product.name}
      />
      <View style={styles.body}>
        <AppText variant="label" weight="bold" numberOfLines={2}>{product.name}</AppText>
        <AppText variant="caption" color={theme.colors.secondary}>
          {`${product.price.toFixed(2)} ${product.currency}`}
        </AppText>
        {!product.available ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('shopping.unavailable')}</AppText>
        ) : null}
      </View>
      <Button label={t('shopping.discover')} onPress={open} testID={`linked-product-cta-${product.id}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  overlay: { marginBottom: 12 },
  thumb: { width: 56, height: 56 },
  body: { flex: 1, gap: 2 },
});
