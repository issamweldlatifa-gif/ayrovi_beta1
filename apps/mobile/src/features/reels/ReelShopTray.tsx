/**
 * TIROIR « articles » d'un Reel — rendu (refonte du 24/10/2026).
 *
 * Planche de référence : `docs/design/reel/compare/mockup-v4-24-10.png`.
 *
 * ── Ce qui a changé, et pourquoi ────────────────────────────────────────────
 *  • **Plus de feuille blanche.** Les cartes flottent sur la vidéo avec 13 de
 *    marge de chaque côté et 17 sous elles : le Reel reste visible tout autour,
 *    la carte ne touche ni le bord ni sa voisine (12 d'écart).
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
 * `reelTray.ts`). Aucun article ⇒ aucun bouton.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { ARTICLE_CARD } from '@/design/articleCard';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import type { LinkedProduct } from '@/api/linkedProduct';
import {
  REEL_TRAY,
  reelTrayContentBottom,
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

  const overlay = mode === 'overlay';
  const insetBottom = overlay ? insets.bottom : 0;
  const trayHeight = REEL_TRAY.height + insetBottom;
  const pillBottom = reelTrayPillBottom(open, insetBottom);
  const captionBottom = reelTrayContentBottom(open, 'caption', REEL_TRAY.height, insetBottom);

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
        { opacity: pressed ? 0.86 : 1 },
      ]}
    >
      <AppText variant="label" weight="bold" color={!overlay || open ? onMedia : theme.colors.ink}>
        {t(reelTrayLabelKey(open))}
      </AppText>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={19}
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
  const railView = overlay && rail && products.length > 0 ? (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {[
        { key: 'comment', icon: 'chatbubble-outline', label: t('social.comments'), onPress: rail.onComment },
        {
          key: 'sound',
          icon: rail.muted ? 'volume-mute' : 'volume-high',
          label: t(rail.muted ? 'social.unmute' : 'social.mute'),
          onPress: rail.onToggleMute,
        },
        { key: 'share', icon: 'share-social-outline', label: t('social.share'), onPress: rail.onShare },
      ].map((action, index) => (
        <Pressable
          key={action.key}
          testID={`reel-rail-${action.key}-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={4}
          style={({ pressed }) => [
            styles.railButton,
            { bottom: reelTrayRailBottom(open, index, insetBottom), opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons
            name={action.icon as keyof typeof Ionicons.glyphMap}
            size={23}
            color={onMedia}
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
              height: trayHeight,
              paddingBottom: insetBottom,
              transform: [{ translateY: reelTrayOffset(open, REEL_TRAY.height, insetBottom) }],
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
        snapToInterval={ARTICLE_CARD.width + REEL_TRAY.cardGap}
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
    borderRadius: 999,
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
