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
import { ReelGlyph, type ReelGlyphName } from './ReelIcons';
import { ReactionButton } from '@/design/reactions/ReactionButton';
import type { ContentReaction } from '@/design/reactions/reactionModel';
import { useReduceMotion } from '@/design/motion';

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
  /**
   * Z-Reactions (11/11) : UN bouton pour J'aime · J'adore · Je n'aime pas.
   * Toucher = J'aime / retirer ; appui long = sélecteur. Le compteur (J'aime +
   * J'adore) est posé SOUS l'icône.
   */
  reaction: ContentReaction | null;
  reactionsCount: number;
  onReactionTap: () => void;
  onReactionPick: (choice: ContentReaction) => void;
  /** Visiteur : le bouton reste VISIBLE (atténué) ; le toucher ouvre la connexion. */
  reactionEnabled: boolean;
  commentsCount: number;
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
  /**
   * Le contenu qui vit au-dessus du tiroir en mode `overlay` (légende).
   * `bottom` = position tiroir FERMÉ ; `lift` = translation animée vers le haut
   * quand les articles sortent (la légende glisse avec le tiroir, sans saut).
   */
  children: (state: { open: boolean; bottom: number; lift?: Animated.AnimatedInterpolation<number> }) => React.ReactNode;
}

/** Une ligne simple du rail (son, partage, commentaire) : glyphe + compteur facultatif. */
interface RailAction {
  key: 'sound' | 'share' | 'comment';
  glyph: ReelGlyphName;
  label: string;
  count: string | null;
  onPress: () => void;
}

function RailButton({ action, reelId, bottom, onMedia }: {
  action: RailAction;
  reelId: string;
  bottom: number;
  onMedia: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`reel-rail-${action.key}-${reelId}`}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.railButton,
        { bottom, opacity: pressed ? theme.opacity.subtle : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
      ]}
    >
      <ReelGlyph name={action.glyph} size={theme.iconSize.md} color={onMedia} />
      {action.count ? (
        <AppText variant="caption" color={onMedia}>
          {action.count}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/** Ressort du tiroir : court, sans rebond — le Reel ne « tremble » pas. */
const TRAY_SPRING = { damping: 26, stiffness: 320, mass: 0.9, overshootClamping: true, useNativeDriver: true } as const;


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
  // Tout ce qui est posé sur la vidéo est placé en position FERMÉE, puis
  // translaté par UN seul ressort natif (`progress` 0 → 1) : pastille, rail,
  // légende et cartes bougent ensemble, d'un geste fluide, au lieu de sauter.
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { progress.setValue(open ? 1 : 0); return; }
    const animation = Animated.spring(progress, { toValue: open ? 1 : 0, ...TRAY_SPRING });
    animation.start();
    return () => animation.stop();
  }, [open, reduce, progress]);
  const pillBottom = reelTrayPillBottom(false, insetBottom, trayHeight);
  const pillLift = Animated.multiply(progress, -(reelTrayPillBottom(true, insetBottom, trayHeight) - pillBottom));
  const captionBottom = reelTrayContentBottom(false, 'caption', trayHeight, insetBottom);
  const captionLift = Animated.multiply(progress, -(reelTrayContentBottom(true, 'caption', trayHeight, insetBottom) - captionBottom));
  const trayClosed = reelTrayOffset(false, trayHeight, insetBottom);

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
          // Ouvert : encre de la marque. Fermé : la surface de l'écran.
          ? { backgroundColor: open ? VIDEO_BACKDROP : onMedia }
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
  const pillView = pill && overlay ? (
    <Animated.View pointerEvents="box-none" style={[styles.pillOnMedia, { bottom: pillBottom, transform: [{ translateY: pillLift }] }]}>
      {pill}
    </Animated.View>
  ) : pill;

  /**
   * Rail d'actions — QUATRE boutons (révision du 11/11) ; de bas en haut :
   * son · partage · commentaire · RÉACTION (Z-Reactions, compteur dessous).
   * Le plein écran a été retiré (« زر تكبير نحيه ») ; pouce haut, cœur et pouce
   * bas sont fondus dans le bouton de réaction unique. Le rail est accroché à
   * la pastille et glisse AVEC elle (ressort natif, plus de saut).
   */
  const railLift = Animated.multiply(progress, -(reelTrayRailBottom(true, 0, insetBottom, trayHeight) - reelTrayRailBottom(false, 0, insetBottom, trayHeight)));
  const railView = overlay && rail ? (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: railLift }] }]}>
      {([
        {
          key: 'sound',
          glyph: rail.muted ? 'muted' : 'sound',
          label: t(rail.muted ? 'social.unmute' : 'social.mute'),
          count: null,
          onPress: rail.onToggleMute,
        },
        {
          key: 'share',
          glyph: 'share',
          label: t('social.share'),
          count: null,
          onPress: rail.onShare,
        },
        {
          key: 'comment',
          glyph: 'comment',
          label: t('social.comments'),
          count: formatRailCount(rail.commentsCount),
          onPress: rail.onComment,
        },
      ] as RailAction[]).map((action, index) => (
        <RailButton
          key={action.key}
          action={action}
          reelId={reel.id}
          bottom={reelTrayRailBottom(false, index, insetBottom, trayHeight)}
          onMedia={onMedia}
        />
      ))}
      <View style={[styles.railButton, styles.railReaction, { bottom: reelTrayRailBottom(false, 3, insetBottom, trayHeight) }]}>
        <ReactionButton
          testID={`reel-rail-reaction-${reel.id}`}
          variant="rail"
          reaction={rail.reaction}
          count={formatRailCount(rail.reactionsCount)}
          onTap={rail.onReactionTap}
          onPick={rail.onReactionPick}
          guest={!rail.reactionEnabled}
          ink={onMedia}
        />
      </View>
    </Animated.View>
  ) : null;

  // Animated.View OBLIGATOIRE : une interpolation posée sur une View simple ne
  // bouge jamais (régression du 11/11 — « Masquer » laissait la carte en place
  // et la pastille glissait DERRIÈRE elle).
  const TrayContainer = overlay ? Animated.View : View;
  const tray = products.length > 0 ? (
    <TrayContainer
      testID={`reel-tray-${reel.id}`}
      style={[
        overlay ? styles.trayOverlay : styles.trayInline,
        overlay
          ? {
              height: trayHeight + insetBottom,
              paddingBottom: insetBottom,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [trayClosed, 0] }) }],
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
    </TrayContainer>
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
      {children({ open, bottom: captionBottom, lift: captionLift })}
      {/* Les cartes d'abord, la pastille et le rail PAR-DESSUS : même en cours de
          glissement, le bouton reste visible et touchable. */}
      {tray}
      {pillView}
      {railView}
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
  // Le bouton de réaction gère lui-même sa cible 44 et son compteur.
  railReaction: { height: undefined, minHeight: REEL_TRAY.railHit },
  inlineWrap: { paddingBottom: 4 },
});
