/**
 * Carte « article » d'un contenu (Reel, Publication, Story).
 *
 * ── Décision du 24/10/2026 ───────────────────────────────────────────────────
 * **La carte entière est pressable.** Il n'y a plus de bouton « Découvrir » :
 * dans un tiroir de 214 px de haut, un bouton à côté d'une photo de 118 px
 * volait la place du titre et promettait une action que la carte fait déjà.
 *
 * Cotes : `@/design/articleCard` (contrôlées par `tests/article-card-contract.test.ts`
 * contre `shared/articleCard.ts` et la maquette `docs/design/reel/assets/card.css`).
 *
 * ── Ce qui n'est jamais fabriqué ─────────────────────────────────────────────
 * • pas de photo → fond studio, pas d'image d'attente déguisée en produit ;
 * • photo en `contain` : on ne rogne pas le produit pour remplir un carré ;
 * • pas de prix → aucun montant (jamais « — » ni un prix recalculé ici) ;
 * • disponibilité : seul un `false` explicite s'écrit « indisponible ».
 *
 * La navigation reste interne : `/product/[id]`, jamais un site marchand.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { ARTICLE_CARD } from '@/design/articleCard';
import type { LinkedProduct } from '@/api/linkedProduct';

export interface LinkedProductCardProps {
  product: LinkedProduct;
  /** `overlay` = posée sur la vidéo d'un Reel (même cotes, pas d'ombre portée). */
  variant?: 'row' | 'overlay';
  onOpen?: (product: LinkedProduct) => void;
  /** Fourni seulement si l'écran sait gérer les favoris ; sinon aucun cœur. */
  onToggleFavorite?: (product: LinkedProduct) => void;
  favourite?: boolean;
  testID?: string;
}

export function LinkedProductCard({
  product, variant = 'row', onOpen, onToggleFavorite, favourite = false, testID,
}: LinkedProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const overlay = variant === 'overlay';
  const id = product.id;

  const open = () => {
    if (onOpen) onOpen(product);
    else router.push({ pathname: '/product/[id]', params: { id } });
  };

  const label = [product.name, `${product.price.toFixed(2)} ${product.currency}`].filter(Boolean).join(' — ');

  return (
    <Pressable
      testID={testID ?? `linked-product-${id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('shopping.discover')}
      onPress={open}
      style={({ pressed }) => [
        styles.card,
        overlay ? styles.overlay : null,
        {
          backgroundColor: theme.colors.canvas,
          borderColor: theme.colors.line,
          borderRadius: ARTICLE_CARD.radius,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.shot,
          { backgroundColor: theme.colors.shimmer, borderRadius: ARTICLE_CARD.thumbRadius },
        ]}
      >
        {product.image ? (
          <AppImage
            uri={mediaUrl(product.image)}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessibilityLabel={product.name}
            decorative={false}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <AppText variant="label" weight="bold" numberOfLines={ARTICLE_CARD.titleLines} style={styles.title}>
          {product.name}
        </AppText>
        <View style={styles.footer}>
          <AppText variant="caption" weight="bold" color={theme.colors.ink}>
            {`${product.price.toFixed(2)} ${product.currency}`}
          </AppText>
          {product.available === false ? (
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
              {t('shopping.unavailable')}
            </AppText>
          ) : null}
        </View>
      </View>

      {onToggleFavorite ? (
        <Pressable
          testID={`linked-product-fav-${id}`}
          accessibilityRole="button"
          accessibilityState={{ selected: favourite }}
          accessibilityLabel={favourite ? t('shopping.favouriteRemove') : t('shopping.favouriteAdd')}
          onPress={() => onToggleFavorite(product)}
          hitSlop={6}
          style={styles.fav}
        >
          <Ionicons
            name={favourite ? 'heart' : 'heart-outline'}
            size={20}
            color={favourite ? theme.colors.accentText : theme.colors.ink}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: ARTICLE_CARD.width,
    // Un écran de 320 px moins ses marges ne doit pas être dépassé : la carte se
    // rétrécit, elle ne pousse pas la page sur le côté.
    maxWidth: '100%',
    height: ARTICLE_CARD.height,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ARTICLE_CARD.gap,
    padding: ARTICLE_CARD.padding,
    borderWidth: StyleSheet.hairlineWidth,
  },
  overlay: { marginBottom: 0 },
  shot: {
    width: ARTICLE_CARD.thumb,
    height: ARTICLE_CARD.thumb,
    overflow: 'hidden',
    flexShrink: 0,
  },
  body: { flex: 1, alignSelf: 'stretch', paddingTop: 2, justifyContent: 'space-between' },
  title: { fontSize: ARTICLE_CARD.titleSize },
  footer: { gap: 2 },
  fav: {
    position: 'absolute',
    top: ARTICLE_CARD.padding,
    right: ARTICLE_CARD.padding,
    width: ARTICLE_CARD.favourite,
    height: ARTICLE_CARD.favourite,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
