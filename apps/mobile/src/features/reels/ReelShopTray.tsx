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
 *    partage · son · options (Ionicons, la famille du projet). Fermer les
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
 * (options · son · partage) reste affiché ; commentaires et cœur restent
 * disponibles dans les options, même sans article.
 */
import { RADIUS, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  formatRailCount,
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
  /** Le ⋮ reste dans ReelOptions : la référence (10/11) ne l'affiche pas dans le rail. */
  onOptions?: () => void;
  /** Pouce haut : compte affiché SOUS l'icône (compteur seulement ici et au commentaire). */
  liked: boolean;
  likesCount: number;
  onLike: () => void;
  /** Compte visiteur : le pouce reste VISIBLE mais désactivé (honnêteté à l'écran). */
  likeEnabled: boolean;
  /** Pouce bas : publie ET reels (référence 10/11) — aucun compteur affiché. */
  disliked: boolean;
  onDislike?: () => void;
  commentsCount: number;
  /** Cœur favori : rempli orange + rafale de trois cœurs à l'activation. */
  favourited: boolean;
  onFavourite?: () => void;
  /** Plein écran natif de la vidéo (VideoView.enterFullscreen). */
  onFullscreen?: () => void;
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

/** Une ligne du rail : icône, étiquette, compteur facultatif, état actif. */
interface RailAction {
  key: 'fullscreen' | 'sound' | 'heart' | 'share' | 'comment' | 'dislike' | 'like';
  icon: string;
  label: string;
  /** Compteur SOUS l'icône — seulement pouce haut et commentaire (référence). */
  count: string | null;
  disabled: boolean;
  onPress?: () => void;
  active: boolean;
  activeColor: string;
  /** Le cœur déclenche la rafale de trois cœurs à l'activation. */
  burst: boolean;
}

/** Durée du flash blanc à l'intérieur du glyphe (mesuré : 100–150 ms). */
const RAIL_FLASH_MS = 120;
/** Rafale de trois cœurs orange (mesuré : 8.0–8.8 s sur la vidéo). */
const BURST_DURATION_MS = 650;
const BURST_STAGGER_MS = 90;

/**
 * Un bouton du rail : cible 44 posée sur la vidéo, FLASH blanc à la pression
 * (voile rond derrière le glyphe ~120 ms), et pour le cœur une RAFALE de trois
 * cœurs orange qui montent et s'estompent quand il s'active. Compteur posé
 * sous l'icône quand l'action en porte un (pouce haut, commentaire).
 */
function RailButton({ action, index, reelId, open, insetBottom, trayHeight, onMedia }: {
  action: RailAction;
  index: number;
  reelId: string;
  open: boolean;
  insetBottom: number;
  trayHeight: number;
  onMedia: string;
}) {
  const theme = useTheme();
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Rafale : trois cœurs animés, déclenchés à l'ACTIVATION (pas à la pression).
  const hearts = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const wasActive = useRef(action.active);
  useEffect(() => {
    if (!action.burst || !action.active || wasActive.current) {
      wasActive.current = action.active;
      return;
    }
    wasActive.current = action.active;
    hearts.forEach((value, offset) => {
      value.setValue(0);
      Animated.timing(value, {
        toValue: 1,
        duration: BURST_DURATION_MS,
        delay: offset * BURST_STAGGER_MS,
        useNativeDriver: true,
      }).start();
    });
  }, [action.burst, action.active, hearts]);
  useEffect(() => () => hearts.forEach((value) => value.stopAnimation()), [hearts]);

  const press = () => {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), RAIL_FLASH_MS);
    action.onPress?.();
  };

  return (
    <Pressable
      testID={`reel-rail-${action.key}-${reelId}`}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled, checked: action.active || undefined }}
      disabled={action.disabled}
      onPress={press}
      hitSlop={4}
      style={[
        styles.railButton,
        { bottom: reelTrayRailBottom(open, index, insetBottom, trayHeight) },
      ]}
    >
      {/* Flash blanc : voile rond DERRIÈRE le glyphe, même blanc que l'encre média,
          à l'opacité d'appui du système (`theme.opacity.subtle`). */}
      {flash ? (
        <View
          style={[styles.railFlash, { backgroundColor: onMedia, opacity: theme.opacity.subtle }]}
          pointerEvents="none"
        />
      ) : null}
      <Ionicons
        name={action.icon as keyof typeof Ionicons.glyphMap}
        size={theme.iconSize.md}
        color={action.active ? action.activeColor : onMedia}
        accessibilityElementsHidden
      />
      {action.count ? (
        <AppText variant="caption" color={onMedia} style={styles.railCount}>
          {action.count}
        </AppText>
      ) : null}
      {action.burst && action.active
        ? hearts.map((value, offset) => (
            <Animated.View
              key={offset}
              pointerEvents="none"
              style={[
                styles.burstHeart,
                {
                  opacity: value,
                  transform: [
                    { translateX: (offset - 1) * 16 },
                    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -52] }) },
                    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) },
                  ],
                },
              ]}
            >
              <Ionicons name="heart" size={theme.iconSize.sm} color={theme.colors.reelAccent} accessibilityElementsHidden />
            </Animated.View>
          ))
        : null}
    </Pressable>
  );
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
              { bottom: pillBottom, backgroundColor: open ? VIDEO_BACKDROP : onMedia },
            ]
          : [styles.pillInline, { borderColor: theme.colors.line, backgroundColor: theme.colors.ink }],
        { opacity: pressed ? theme.opacity.dimmed : 1 },
      ]}
    >
      <AppText variant="label" color={!overlay ? surface : open ? onMedia : VIDEO_BACKDROP}>
        {t(reelTrayLabelKey(open))}
      </AppText>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={theme.iconSize.sm}
        color={!overlay ? surface : open ? onMedia : VIDEO_BACKDROP}
        accessibilityElementsHidden
      />
    </Pressable>
  ) : null;

  /**
   * Rail d'actions — SEPT boutons, ordre exact de la référence vidéo 10/11.
   * De bas en haut : plein écran · son · cœur · partage · commentaire · pouce
   * bas · pouce haut (la référence les montre de haut en bas dans l'ordre
   * inverse, pouce haut avec son compteur au sommet). Le compteur n'est posé
   * QUE sous le pouce haut et sous le commentaire — comme la référence. Le ⋮
   * reste dans ReelOptions : la référence ne l'affiche pas dans le rail.
   *
   * Chaque pression déclenche le FLASH blanc à l'intérieur du glyphe (~120 ms,
   * fenêtre mesurée 8.0–8.2 s sur la vidéo) ; l'activation du cœur déclenche
   * la rafale de trois cœurs orange (~700 ms, mesuré 8.0–8.8 s).
   */
  const railView = overlay && rail ? (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {([
        {
          key: 'fullscreen',
          icon: 'scan-outline',
          label: t('social.fullscreen'),
          count: null,
          disabled: !rail.onFullscreen,
          onPress: rail.onFullscreen,
          active: false,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
        {
          key: 'sound',
          icon: rail.muted ? 'volume-mute' : 'volume-high',
          label: t(rail.muted ? 'social.unmute' : 'social.mute'),
          count: null,
          disabled: false,
          onPress: rail.onToggleMute,
          active: false,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
        {
          key: 'heart',
          icon: rail.favourited ? 'heart' : 'heart-outline',
          label: t('social.like'),
          count: null,
          disabled: !rail.onFavourite,
          onPress: rail.onFavourite,
          active: rail.favourited,
          activeColor: theme.colors.reelAccent,
          burst: true,
        },
        {
          key: 'share',
          icon: 'share-social-outline',
          label: t('social.share'),
          count: null,
          disabled: false,
          onPress: rail.onShare,
          active: false,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
        {
          key: 'comment',
          icon: 'chatbubble-outline',
          label: t('social.comments'),
          count: formatRailCount(rail.commentsCount),
          disabled: false,
          onPress: rail.onComment,
          active: false,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
        {
          key: 'dislike',
          icon: rail.disliked ? 'thumbs-down' : 'thumbs-down-outline',
          label: rail.disliked ? t('social.disliked') : t('social.dislike'),
          count: null,
          disabled: !rail.onDislike,
          onPress: rail.onDislike,
          active: rail.disliked,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
        {
          key: 'like',
          icon: rail.liked ? 'thumbs-up' : 'thumbs-up-outline',
          label: rail.liked ? t('social.liked') : t('social.like'),
          count: formatRailCount(rail.likesCount),
          disabled: !rail.likeEnabled,
          onPress: rail.onLike,
          active: rail.liked,
          activeColor: theme.colors.onMedia,
          burst: false,
        },
      ] as RailAction[]).map((action, index) => (
        <RailButton
          key={action.key}
          action={action}
          index={index}
          reelId={reel.id}
          open={open}
          insetBottom={insetBottom}
          trayHeight={trayHeight}
          onMedia={onMedia}
        />
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
            reelPresentation={overlay}
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
  // Flash de pression : disque de 32 posé derrière le glyphe (22), rond.
  // L'opacité d'appui vient de `theme.opacity` — passée inline par RailButton.
  railFlash: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    top: 6,
  },
  // Compteur sous l'icône : la cible passe à 56 de hauteur utile.
  railCount: {},
  // Un cœur de la rafale : posé au centre du bouton, il monte en s'estompant.
  burstHeart: { position: 'absolute', top: 10 },
  inlineWrap: { paddingBottom: 4 },
});
