import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReduceMotion } from '@/design/motion';
import { AppText } from '@/design/ui';
import { useTheme, webDirection } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { RADIUS, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { articleCardSize } from '@/design/articleCard';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import type { LinkedProduct } from '@/api/linkedProduct';
import { REEL_TRAY, reelTrayDefaultOpen, reelTrayLabelKey, reelTrayProducts, type TraySource } from './reelTray';
import { ReelViewerGlyph, ReelViewerText, type ViewerGlyph } from './ReelViewerChrome';
import { ReelArticleCard } from './ReelArticleCard';
import { REEL_VIEWER as V, reelViewerAnchors, reelViewerCardSize } from './reelViewerStyle';

interface ReelTrayRail {
  muted: boolean;
  onToggleMute: () => void;
  onShare: () => void;
  onOptions: () => void;
}

interface ReelTrayFavourites {
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

interface ReelShopTrayProps {
  reel: TraySource<LinkedProduct> & { id: string };
  mode: 'overlay' | 'inline';
  surface: string;
  rail?: ReelTrayRail;
  favourites?: ReelTrayFavourites | null;
  viewportWidth?: number;
  children: (state: { open: boolean; bottom: number; lift?: Animated.AnimatedInterpolation<number> }) => React.ReactNode;
}

const SPRING = { damping: 26, stiffness: 320, mass: 0.9, overshootClamping: true, useNativeDriver: true } as const;
const mirror: ViewStyle = { transform: [{ scaleX: -1 }] };

export function ReelShopTray({ reel, mode, surface, rail, favourites, viewportWidth, children }: ReelShopTrayProps) {
  const theme = useTheme();
  const t = useT();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const products = reelTrayProducts(reel), hasProducts = products.length > 0;
  const overlay = mode === 'overlay';
  // The viewer begins on the video, not on the catalogue. Inline feed is unchanged.
  const [open, setOpen] = useState(() => !overlay && reelTrayDefaultOpen(reel));
  const expanded = hasProducts && open;
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    if (!overlay || reduced) { progress.setValue(expanded ? 1 : 0); return; }
    const animation = Animated.spring(progress, { toValue: expanded ? 1 : 0, ...SPRING });
    animation.start();
    return () => animation.stop();
  }, [expanded, reduced, overlay, progress]);
  const card = reelViewerCardSize(viewportWidth || width, fontScale);
  const closed = reelViewerAnchors(card.height, safeBottom, hasProducts, false, fontScale);
  const opened = reelViewerAnchors(card.height, safeBottom, hasProducts, true, fontScale);
  const distance = opened.pillBottom - closed.pillBottom;
  const lift = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }), [progress, distance]);
  const slide = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [closed.trayHeight, 0] }), [progress, closed.trayHeight]);
  const rtl = theme.isRTL;
  const nativeMirror = Platform.OS !== 'web' && rtl ? mirror : undefined;
  const direction = rowDirectionFor(rtl);
  const label = t(reelTrayLabelKey(expanded));
  const toggle = () => setOpen(value => !value);

  if (!overlay) {
    const inline = articleCardSize(width);
    return <View style={styles.inlineWrap}>
      {hasProducts ? <Pressable testID={`reel-tray-toggle-${reel.id}`} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ expanded }} aria-expanded={expanded} onPress={toggle} style={[styles.pill, styles.pillInline, { backgroundColor: theme.colors.ink }]}>
        <AppText variant="label" color={surface}>{label}</AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.sm} color={surface} accessibilityElementsHidden />
      </Pressable> : null}
      {expanded ? <View testID={`reel-tray-${reel.id}`} style={styles.inlineTray}>
        <ScrollView testID={`reel-tray-scroll-${reel.id}`} horizontal showsHorizontalScrollIndicator={false} snapToInterval={inline.width + REEL_TRAY.cardGap}
          decelerationRate="fast" contentContainerStyle={styles.inlineRow}>
          {products.map(product => <LinkedProductCard key={product.id} product={product} testID={`reel-product-${reel.id}-${product.id}`} />)}
        </ScrollView>
      </View> : null}
    </View>;
  }

  const actions: Array<{ key: 'options' | 'sound' | 'share'; glyph: ViewerGlyph; label: string; onPress: () => void }> = rail ? [
    { key: 'options', glyph: 'options', label: t('reel.viewerOptions'), onPress: rail.onOptions },
    { key: 'sound', glyph: rail.muted ? 'muted' : 'sound', label: rail.muted ? t('social.unmute') : t('social.mute'), onPress: rail.onToggleMute },
    { key: 'share', glyph: 'share', label: t('social.share'), onPress: rail.onShare },
  ] : [];
  const pillInk = expanded ? V.paper : V.ink;
  return <>
    <LinearGradient testID="reel-viewer-scrim" pointerEvents="none" colors={[veil(0), veil(0.42), veil(0.69)]}
      locations={[0, 0.62, 1]} style={styles.scrim} />
    {children({ open: expanded, bottom: closed.captionBottom, lift })}
    {hasProducts ? <Animated.View testID={`reel-tray-${reel.id}`} style={[styles.tray, { height: closed.trayHeight, paddingBottom: safeBottom, transform: [{ translateY: slide }] }]}
      pointerEvents={expanded ? 'auto' : 'none'} aria-hidden={!expanded} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
      <ScrollView testID={`reel-tray-scroll-${reel.id}`} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
        snapToInterval={card.width + V.cardGap} decelerationRate="fast" snapToAlignment="start" disableIntervalMomentum
        style={[webDirection(rtl), nativeMirror]} contentContainerStyle={styles.row}>
        {products.map(product => <ReelArticleCard key={product.id} product={product} size={card} mirror={nativeMirror} interactive={expanded} testID={`reel-product-${reel.id}-${product.id}`}
          onFavorite={favourites ? () => favourites.toggle(product.id) : undefined} favorite={favourites?.isFavorite(product.id) ?? false} />)}
      </ScrollView>
    </Animated.View> : null}
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
      {hasProducts ? <Pressable testID={`reel-tray-toggle-${reel.id}`} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ expanded }} aria-expanded={expanded} onPress={toggle} style={({ pressed }) => [styles.pill, styles.pillOnMedia, rtl ? styles.pillRight : styles.pillLeft, {
          flexDirection: direction, minHeight: closed.pillHeight, bottom: closed.pillBottom,
          backgroundColor: expanded ? V.ink : V.paper, opacity: pressed ? theme.opacity.dimmed : 1,
        }]}>
        <ReelViewerText tone="pill" weight="bold" color={pillInk} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</ReelViewerText>
        <ReelViewerGlyph name={expanded ? 'up' : 'down'} color={pillInk} size={V.pillGlyph} />
      </Pressable> : null}
      {actions.map((action, index) => <Pressable key={action.key} testID={`reel-rail-${action.key}-${reel.id}`} accessibilityRole="button" accessibilityLabel={action.label}
        onPress={action.onPress} style={({ pressed }) => [styles.railButton, rtl ? styles.railLeft : styles.railRight, {
          bottom: closed.railBottom + index * V.railStep, opacity: pressed ? theme.opacity.dimmed : 1,
        }]}>
        <ReelViewerGlyph name={action.glyph} size={V.railGlyph} color={V.paper} />
      </Pressable>)}
    </Animated.View>
  </>;
}

const railEdge = V.railCenter - V.railTarget / 2;
const styles = StyleSheet.create({
  pill: { minWidth: V.pillMinWidth, paddingHorizontal: V.pillPad, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'space-between', gap: V.pillGap },
  pillOnMedia: { position: 'absolute', maxWidth: '75%' },
  pillLeft: { left: V.inset }, pillRight: { right: V.inset },
  pillInline: { alignSelf: 'flex-start', flexDirection: 'row', minHeight: REEL_TRAY.pillHeight, minWidth: REEL_TRAY.pillMinWidth, marginHorizontal: 12, marginTop: 10 },
  inlineWrap: { paddingBottom: 4 }, inlineTray: { marginTop: 10 },
  inlineRow: { gap: REEL_TRAY.cardGap, paddingHorizontal: REEL_TRAY.padding, paddingBottom: REEL_TRAY.cardBottom },
  scrim: { position: 'absolute', top: '40%', start: 0, end: 0, bottom: 0 },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  row: { gap: V.cardGap, paddingHorizontal: V.inset, paddingBottom: V.cardBottom, alignItems: 'flex-end' },
  railButton: { position: 'absolute', width: V.railTarget, height: V.railTarget, alignItems: 'center', justifyContent: 'center' },
  railLeft: { left: railEdge }, railRight: { right: railEdge },
});
