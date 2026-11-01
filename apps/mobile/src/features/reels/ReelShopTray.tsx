/**
 * TIROIR « articles » d'un Reel — rendu (refonte du 24/10/2026).
 *
 * Planche de référence : `docs/design/reel/compare/mockup-v4-24-10.png`.
 *
 * ── Ce qui a changé, et pourquoi ────────────────────────────────────────────
 *  • **Plus de feuille blanche.** La carte affleure à 12 du bord et laisse voir
 *    9 de la suivante, avec 16 de vide sous elle : le Reel reste visible tout
 *    autour. Cotes mesurées sur le modèle (664×303 px sur un écran de 720).
 *  • **Plus de poignée de tiroir** ni de coins arrondis de feuille : il n'y a
 *    plus de feuille.
 *  • **Le rail d'actions est ici**, parce qu'il est accroché à la pastille :
 *    partage · son · commentaire (Ionicons, la famille du projet). Fermer les
 *    articles fait descendre la pastille **et les icônes avec elle**.
 *  • **La pastille suit l'état** : noire quand les articles sont sortis, blanche
 *    quand ils sont rangés — comme le modèle.
 *
 * La vidéo n'est jamais démontée : le tiroir est un frère dans l'arbre, pas un
 * autre écran. Ouvrir les articles ne met donc pas le Reel en pause et ne perd
 * pas la position de lecture.
 *
 * Un seul bouton : « Voir les articles » ⇄ « Masquer les articles » (voir
 * `reelTray.ts`). Aucun article ⇒ aucune pastille — mais le **rail d'actions**
 * (commentaire · son · partage · cœur) reste affiché : un Reel sans article est
 * toujours un Reel qu'on aime, qu'on commente et qu'on partage.
 */
import { RADIUS } from '@/design/tokens.mobile';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { articleCardSize } from '@/design/articleCard';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import type { LinkedProduct } from '@/api/linkedProduct';
import {
  REEL_TRAY,
  reelTrayContentBottom,
  reelTrayHeight,
  reelTrayDefaultOpen,
  reelTrayLabelKey,
  reelTrayOffset,
  reelTrayPillBottom,
  reelTrayProducts,
  reelTrayRailBottom,
  type TraySource,
} from './reelTray';

/** Actions du rail posé sur la vidéo (facultatives : la liste n'en a pas). */
export interface ReelTrayRail {
  muted: boolean;
  onToggleMute: () => void;
  onShare: () => void;
  onComment: () => void;
  /** Cœur du Reel — visible même sans article (avant le 24/10 il n'existait pas en plein écran). */
  liked: boolean;
  /** Faux pour un invité : le cœur reste affiché mais inerte (règle « l'aimé exige un compte »). */
  canLike: boolean;
  onLike: () => void;
}

/** Favoris : fournis seulement si l'écran sait les gérer ; sinon aucun cœur. */
export interface ReelTrayFavourites {
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

export interface ReelShopTrayProps {
  reel: TraySource<LinkedProduct> & { id: string };
  mode: 'overlay' | 'inline';
  /** Surface de l'écran (blanc en clair, sombre en sombre) — pastille fermée. */
  surface: string;
  /** Couleur du texte/icônes posés SUR la vidéo. */
  onMedia: string;
  rail?: ReelTrayRail | null;
  favourites?: ReelTrayFavourites | null;
  /** Le contenu qui vit au-dessus du tiroir en mode `overlay` (légende). */
  children: (state: { open: boolean; bottom: number }) => React.ReactNode;
}

export function ReelShopTray({
  reel, mode, surface, onMedia, rail = null, favourites = null, children,
}: ReelShopTrayProps) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const products = reelTrayProducts(reel);
  const [open, setOpen] = useState(() => reelTrayDefaultOpen(reel));
  // La carte prend la largeur de l'écran : le tiroir suit sa hauteur, pas une
  // constante. Sur 360 dp la carte fait 332×151 (cotes du modèle), sur 390 dp
  // 362×165 — la pastille et le rail se recalculent avec elle.
  const { width: viewport } = useWindowDimensions();
  const card = articleCardSize(viewport);

  const overlay = mode === 'overlay';
  const insetBottom = overlay ? insets.bottom : 0;
  const trayHeight = reelTrayHeight(card.height);
  const pillBottom = reelTrayPillBottom(open, insetBottom, trayHeight);
  const captionBottom = reelTrayContentBottom(open, 'caption', trayHeight, insetBottom);

  const pill = products.length > 0 ? (
    <Pressable
      testID={`reel-tray-toggle-${reel.id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={t(reelTrayLabelKey(open))}
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [
        styles.pill,
        overlay
          ? [
              styles.pillOnMedia,
              // Ouvert : encre de la marque. Fermé : la surface de l'écran.
              { bottom: pillBottom, backgroundColor: open ? theme.colors.ink : surface },
            ]
          : [styles.pillInline, { borderColor: theme.colors.line }],
        { opacity: pressed ? theme.opacity.dimmed : 1 },
      ]}
    >
      <AppText variant="label" weight="bold" color={!overlay || open ? onMedia : theme.colors.ink}>
        {t(reelTrayLabelKey(open))}
      </AppText>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={theme.iconSize.sm}
        color={!overlay || open ? onMedia : theme.colors.ink}
        accessibilityElementsHidden
      />
    </Pressable>
  ) : null;

  /**
   * Rail d'actions : commentaire (aligné sur le centre de la pastille), son,
   * partage — de bas en haut, comme le modèle. Chaque icône est accrochée à la
   * pastille : elle descend avec elle quand on range les articles.
   */
  const railView = overlay && rail ? (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {[
        { key: 'comment', icon: 'chatbubble-outline', label: t('social.comments'), onPress: rail.onComment, dim: false },
        {
          key: 'sound',
          icon: rail.muted ? 'volume-mute' : 'volume-high',
          label: t(rail.muted ? 'social.unmute' : 'social.mute'),
          onPress: rail.onToggleMute,
          dim: false,
        },
        { key: 'share', icon: 'share-social-outline', label: t('social.share'), onPress: rail.onShare, dim: false },
        {
          key: 'like',
          icon: rail.liked ? 'heart' : 'heart-outline',
          label: rail.liked ? t('social.liked') : t('social.like'),
          onPress: rail.onLike,
          dim: !rail.canLike,
        },
      ].map((action, index) => (
        <Pressable
          key={action.key}
          testID={`reel-rail-${action.key}-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.dim, selected: action.key === 'like' ? rail.liked : undefined }}
          disabled={action.dim}
          onPress={action.onPress}
          hitSlop={4}
          style={({ pressed }) => [
            styles.railButton,
            {
              bottom: reelTrayRailBottom(open, index, insetBottom, trayHeight),
              opacity: action.dim ? theme.opacity.disabled : pressed ? theme.opacity.subtle : 1,
            },
          ]}
        >
          <Ionicons
            name={action.icon as keyof typeof Ionicons.glyphMap}
            size={theme.iconSize.md}
            color={action.key === 'like' && rail.liked ? theme.colors.accentOnMedia : onMedia}
            accessibilityElementsHidden
          />
        </Pressable>
      ))}
    </View>
  ) : null;

  const tray = products.length > 0 ? (
    <View
      testID={`reel-tray-${reel.id}`}
      style={[
        overlay ? styles.trayOverlay : styles.trayInline,
        overlay
          ? {
              height: trayHeight + insetBottom,
              paddingBottom: insetBottom,
              transform: [{ translateY: reelTrayOffset(open, trayHeight, insetBottom) }],
            }
          : null,
      ]}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <ScrollView
        testID={`reel-tray-scroll-${reel.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={card.width + REEL_TRAY.cardGap}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
      >
        {products.map((product) => (
          <LinkedProductCard
            key={product.id}
            product={product}
            variant={overlay ? 'overlay' : 'row'}
            testID={`reel-product-${reel.id}-${product.id}`}
            onToggleFavorite={favourites ? () => favourites.toggle(product.id) : undefined}
            favourite={favourites ? favourites.isFavorite(product.id) : false}
          />
        ))}
      </ScrollView>
    </View>
  ) : null;

  if (!overlay) {
    // Dans le flux, pas d'animation : fermé = pas de tiroir du tout (rien de caché
    // qui resterait lisible par un lecteur d'écran).
    return (
      <View style={styles.inlineWrap}>
        {pill}
        {open ? tray : null}
      </View>
    );
  }

  return (
    <>
      {children({ open, bottom: captionBottom })}
      {pill}
      {railView}
      {tray}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: REEL_TRAY.pillHeight,
    minWidth: REEL_TRAY.pillMinWidth,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Habillage posé SUR la vidéo : la géométrie seule, la couleur vient de l'état.
  pillOnMedia: { position: 'absolute', start: REEL_TRAY.padding },
  pillInline: {
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  trayInline: { marginTop: 10 },
  row: {
    gap: REEL_TRAY.cardGap,
    paddingHorizontal: REEL_TRAY.padding,
    // Les cartes reposent sur le vide de `cardBottom` : le Reel reste visible dessous.
    paddingBottom: REEL_TRAY.cardBottom,
    alignItems: 'flex-end',
  },
  railButton: {
    position: 'absolute',
    end: REEL_TRAY.railInset - REEL_TRAY.railHit / 2,
    width: REEL_TRAY.railHit,
    height: REEL_TRAY.railHit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineWrap: { paddingBottom: 4 },
});
