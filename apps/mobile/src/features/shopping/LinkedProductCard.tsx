/**
 * Carte « article » d'un contenu (Reel, Publication, Story).
 *
 * ── Refonte du 24/10/2026 — planche `docs/design/reel/compare/mockup-v4-24-10.png`
 * Réécrite **de zéro** d'après le modèle mesuré au pixel (663×303 px sur un écran
 * de 720 : photo en bande de 30 % pleine hauteur, marque au-dessus du titre, prix
 * juste dessous, cœur en haut à droite). Ce qui a changé :
 *   • **plus de bordure ni d'ombre** : la carte est un aplat blanc qui flotte ;
 *   • la photo n'est plus un carré en retrait mais une **bande rectangulaire
 *     collée aux bords**, seul le rayon extérieur arrondit les angles ;
 *   • **la marque est revenue** (elle manquait : le serveur public ne la
 *     transmettait pas) ;
 *   • les cotes ont été ramenées à 300×137 (rayon 10) pour rester « petite ».
 *
 * **La carte entière est pressable.** Il n'y a pas de bouton « Découvrir » : dans
 * une barre posée sur la vidéo, un bouton à côté d'une photo volait la place du
 * titre et promettait une action que la carte fait déjà.
 *
 * Cotes : `@/design/articleCard` (contrôlées par `tests/article-card-contract.test.ts`
 * contre `shared/articleCard.ts` et la maquette `docs/design/reel/assets/card.css`).
 *
 * ── Ce qui n'est jamais fabriqué ─────────────────────────────────────────────
 * • pas de photo → fond studio, pas d'image d'attente déguisée en produit ;
 * • photo en `contain` : on ne rogne pas le produit pour remplir la bande ;
 * • pas de prix → aucun montant (jamais « — » ni un prix recalculé ici) ;
 * • pas de marque → la ligne disparaît, le titre remonte (aucun trou) ;
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
  /** `overlay` = posée sur la vidéo d'un Reel (même cotes, aucun fond autour). */
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

  const price = `${product.price.toFixed(2)} ${product.currency}`;
  const brand = (product.brand || '').trim();
  const label = [brand, product.name, price].filter(Boolean).join(' — ');

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
          borderRadius: ARTICLE_CARD.radius,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Bande photo : rectangle franc, pleine hauteur, découpé par le rayon de la carte. */}
      <View style={[styles.shot, { backgroundColor: theme.colors.shimmer }]}>
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
        {brand ? (
          <AppText variant="label" weight="bold" numberOfLines={1} style={styles.brand}>
            {brand}
          </AppText>
        ) : null}
        <AppText variant="caption" numberOfLines={ARTICLE_CARD.titleLines} style={styles.title}>
          {product.name}
        </AppText>
        <AppText variant="caption" weight="bold" color={theme.colors.ink} style={styles.price}>
          {price}
        </AppText>
        {product.available === false ? (
          <AppText variant="caption" color={theme.colors.muted} numberOfLines={1} style={styles.note}>
            {t('shopping.unavailable')}
          </AppText>
        ) : null}
      </View>

      {onToggleFavorite ? (
        <Pressable
          testID={`linked-product-fav-${id}`}
          accessibilityRole="button"
          accessibilityState={{ selected: favourite }}
          accessibilityLabel={favourite ? t('shopping.favouriteRemove') : t('shopping.favouriteAdd')}
          onPress={() => onToggleFavorite(product)}
          hitSlop={8}
          style={styles.fav}
        >
          <Ionicons
            name={favourite ? 'heart' : 'heart-outline'}
            size={ARTICLE_CARD.favourite}
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
    alignItems: 'stretch',
    // `overflow:hidden` EST l'arrondi de la photo : aucun rembourrage, aucun trait.
    overflow: 'hidden',
  },
  overlay: { marginBottom: 0 },
  shot: {
    width: ARTICLE_CARD.thumb,
    alignSelf: 'stretch',
    overflow: 'hidden',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingTop: 16,
    paddingStart: ARTICLE_CARD.gap,
    paddingEnd: 32,
    gap: 6,
  },
  brand: { fontSize: ARTICLE_CARD.brandSize, letterSpacing: -0.1 },
  title: { fontSize: ARTICLE_CARD.titleSize },
  price: { fontSize: ARTICLE_CARD.priceSize, fontVariant: ['tabular-nums'] },
  note: { fontSize: ARTICLE_CARD.priceSize },
  fav: {
    position: 'absolute',
    top: 8,
    end: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
