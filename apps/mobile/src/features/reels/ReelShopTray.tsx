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
import { LikeSparks, ReelGlyph, type ReelGlyphName } from './ReelIcons';

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

/** Une ligne du rail : glyphe, étiquette, compteur facultatif, état actif. */
interface RailAction {
  key: 'fullscreen' | 'sound' | 'heart' | 'share' | 'comment' | 'dislike' | 'like';
  glyph: ReelGlyphName;
  label: string;
  /** Compteur SOUS l'icône — seulement pouce haut et commentaire (référence). */
  count: string | null;
  disabled: boolean;
  onPress?: () => void;
  active: boolean;
  /** Teinte du glyphe PLEIN quand l'action est posée (vert, rouge, orange). */
  activeColor: string;
  /** Effet joué à l'ACTIVATION — relevé image par image sur la vidéo du 10/11. */
  effect: 'like' | 'dislike' | 'heart' | null;
}

/**
 * Chronologie des effets (vidéo de référence, 15–20 i/s) :
 *  • pouce haut  : apparaît vert, basculé en arrière (≈ −28°), se redresse avec
 *    un léger dépassement (~260 ms) ; trois éclats blancs naissent au-dessus de
 *    la pointe pendant le redressement et RESTENT tant que le j'aime est posé ;
 *  • pouce bas   : apparaît rouge, basculé (≈ +28°), revient droit en oscillant
 *    (~500 ms) — pas d'éclats ;
 *  • cœur        : se remplit d'orange un cran plus petit (0.88), tient ~260 ms,
 *    BONDIT (1.22) puis se pose (1.0) ; trois petits cœurs jaillissent au-dessus
 *    (gauche moyen, centre petit, droite grand), tiennent ~450 ms puis
 *    s'estompent (~1.3 s au total).
 * Le disque blanc translucide visible sur la vidéo à chaque toucher est
 * l'indicateur « Afficher les appuis » d'Android (il suit le doigt, y compris
 * dans la feuille) — ce n'est pas un effet de l'application : il n'est pas
 * reproduit.
 */
const TILT_DEG = 28;
const HEART_SETTLE_MS = 260;
const MINI_RISE_MS = 220;
const MINI_HOLD_MS = 450;
const MINI_FADE_MS = 350;
/** Les trois petits cœurs : position (depuis le centre du glyphe), taille, inclinaison. */
const MINI_HEARTS = [
  { x: -10, y: -19, size: 10, rotate: '-14deg' },
  { x: 0, y: -13, size: 6, rotate: '0deg' },
  { x: 10, y: -22, size: 12, rotate: '14deg' },
] as const;

/**
 * Un bouton du rail : cible 44 posée sur la vidéo, glyphe de la référence
 * (trait blanc ⇄ plein coloré) et l'effet propre à l'action à son activation.
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
  // Bascule (pouces) et échelle (cœur) du glyphe principal.
  const tilt = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  // Éclats du pouce : apparaissent pendant le redressement, restent ensuite.
  const sparks = useRef(new Animated.Value(action.effect === 'like' && action.active ? 1 : 0)).current;
  // Petits cœurs : 0 → 1 (jaillissement), puis opacité 1 → 0 (estompe).
  const minis = useRef(new Animated.Value(0)).current;
  const miniFade = useRef(new Animated.Value(0)).current;

  const wasActive = useRef(action.active);
  useEffect(() => {
    const activated = action.active && !wasActive.current;
    wasActive.current = action.active;
    if (action.effect === 'like') {
      if (!action.active) { sparks.setValue(0); tilt.setValue(0); return; }
      if (!activated) return;
      tilt.setValue(-TILT_DEG);
      sparks.setValue(0);
      Animated.parallel([
        Animated.spring(tilt, { toValue: 0, friction: 5, tension: 160, useNativeDriver: true }),
        Animated.timing(sparks, { toValue: 1, duration: 160, delay: 110, useNativeDriver: true }),
      ]).start();
    } else if (action.effect === 'dislike') {
      if (!activated) { if (!action.active) tilt.setValue(0); return; }
      tilt.setValue(TILT_DEG);
      Animated.spring(tilt, { toValue: 0, friction: 3.5, tension: 120, useNativeDriver: true }).start();
    } else if (action.effect === 'heart') {
      if (!activated) {
        if (!action.active) { scale.setValue(1); minis.setValue(0); miniFade.setValue(0); }
        return;
      }
      scale.setValue(0.88);
      minis.setValue(0);
      miniFade.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.delay(HEART_SETTLE_MS),
          Animated.timing(scale, { toValue: 1.22, duration: 100, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(HEART_SETTLE_MS + 20),
          Animated.timing(minis, { toValue: 1, duration: MINI_RISE_MS, useNativeDriver: true }),
          Animated.delay(MINI_HOLD_MS),
          Animated.timing(miniFade, { toValue: 0, duration: MINI_FADE_MS, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [action.effect, action.active, tilt, scale, sparks, minis, miniFade]);
  useEffect(
    () => () => [tilt, scale, sparks, minis, miniFade].forEach((value) => value.stopAnimation()),
    [tilt, scale, sparks, minis, miniFade],
  );

  const filled = action.active && action.effect !== null;
  const color = filled ? action.activeColor : onMedia;

  return (
    <Pressable
      testID={`reel-rail-${action.key}-${reelId}`}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled, checked: action.active || undefined }}
      disabled={action.disabled}
      onPress={action.onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.railButton,
        { bottom: reelTrayRailBottom(open, index, insetBottom, trayHeight) },
        { opacity: action.disabled ? theme.opacity.disabled : pressed ? theme.opacity.subtle : 1 },
      ]}
    >
      <Animated.View
        style={[
          styles.railGlyph,
          {
            transform: [
              { rotate: tilt.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) },
              { scale },
            ],
          },
        ]}
      >
        <ReelGlyph name={action.glyph} size={theme.iconSize.md} color={color} filled={filled} />
      </Animated.View>
      {action.effect === 'like' && action.active ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.likeSparks, { opacity: sparks, transform: [{ scale: sparks }] }]}
        >
          <LikeSparks size={theme.iconSize.md} color={onMedia} />
        </Animated.View>
      ) : null}
      {action.count ? (
        <AppText variant="caption" color={onMedia} style={styles.railCount}>
          {action.count}
        </AppText>
      ) : null}
      {action.effect === 'heart' && action.active
        ? MINI_HEARTS.map((mini, offset) => (
            <Animated.View
              key={offset}
              pointerEvents="none"
              style={[
                styles.miniHeart,
                {
                  opacity: Animated.multiply(minis, miniFade),
                  transform: [
                    { translateX: minis.interpolate({ inputRange: [0, 1], outputRange: [0, mini.x] }) },
                    { translateY: minis.interpolate({ inputRange: [0, 1], outputRange: [0, mini.y] }) },
                    { scale: minis.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    { rotate: mini.rotate },
                  ],
                },
              ]}
            >
              <ReelGlyph name="heart" size={mini.size} color={action.activeColor} filled />
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
   * Glyphes : ceux de la référence (`ReelIcons.tsx`), pas Ionicons. Effets à
   * l'activation (voir `RailButton`) : pouce vert redressé + trois éclats,
   * pouce rouge qui oscille, cœur orange qui bondit + trois petits cœurs.
   */
  const railView = overlay && rail ? (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {([
        {
          key: 'fullscreen',
          glyph: 'fullscreen',
          label: t('social.fullscreen'),
          count: null,
          disabled: !rail.onFullscreen,
          onPress: rail.onFullscreen,
          active: false,
          activeColor: theme.colors.onMedia,
          effect: null,
        },
        {
          key: 'sound',
          glyph: rail.muted ? 'muted' : 'sound',
          label: t(rail.muted ? 'social.unmute' : 'social.mute'),
          count: null,
          disabled: false,
          onPress: rail.onToggleMute,
          active: false,
          activeColor: theme.colors.onMedia,
          effect: null,
        },
        {
          key: 'heart',
          glyph: 'heart',
          label: t('social.like'),
          count: null,
          disabled: !rail.onFavourite,
          onPress: rail.onFavourite,
          active: rail.favourited,
          activeColor: theme.colors.reelAccent,
          effect: 'heart',
        },
        {
          key: 'share',
          glyph: 'share',
          label: t('social.share'),
          count: null,
          disabled: false,
          onPress: rail.onShare,
          active: false,
          activeColor: theme.colors.onMedia,
          effect: null,
        },
        {
          key: 'comment',
          glyph: 'comment',
          label: t('social.comments'),
          count: formatRailCount(rail.commentsCount),
          disabled: false,
          onPress: rail.onComment,
          active: false,
          activeColor: theme.colors.onMedia,
          effect: null,
        },
        {
          key: 'dislike',
          glyph: 'dislike',
          label: rail.disliked ? t('social.disliked') : t('social.dislike'),
          count: null,
          disabled: !rail.onDislike,
          onPress: rail.onDislike,
          active: rail.disliked,
          activeColor: theme.colors.commentDislike,
          effect: 'dislike',
        },
        {
          key: 'like',
          glyph: 'like',
          label: rail.liked ? t('social.liked') : t('social.like'),
          count: formatRailCount(rail.likesCount),
          disabled: !rail.likeEnabled,
          onPress: rail.onLike,
          active: rail.liked,
          activeColor: theme.colors.reelLike,
          effect: 'like',
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
  // Le glyphe tourne autour de son centre (bascule des pouces, bond du cœur).
  railGlyph: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  // Trois éclats du pouce vert : posés au-dessus de la pointe (décalée à droite).
  likeSparks: { position: 'absolute', top: -6, start: 12 },
  // Compteur sous l'icône : la cible passe à 56 de hauteur utile.
  railCount: {},
  // Un petit cœur : part du centre du glyphe principal et jaillit vers le haut.
  miniHeart: { position: 'absolute', top: 14 },
  inlineWrap: { paddingBottom: 4 },
});
