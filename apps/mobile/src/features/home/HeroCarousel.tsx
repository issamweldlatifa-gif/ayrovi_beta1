/**
 * Carrousel Hero de l'accueil — piloté par l'Admin (`hero_slides`), servi par
 * `/api/public/hero-slides`, fond adaptatif extrait côté serveur (§5).
 *
 * Contrat d'affichage :
 *  • chargement ⇒ squelette de la forme attendue, JAMAIS un trou blanc ;
 *  • module désactivé / erreur API / aucune carte ⇒ rien (il n'existe plus d'ancien hero) ;
 *  • carte = titre + photo carrée (collection locale), visuel 5:8 pour CMS ; toute la carte ouvre sa destination ;
 *  • le fond de la section reprend la palette de la photo active puis se fond
 *    progressivement dans le fond de page, en fondu enchaîné ;
 *  • impression/clic tracés en fire-and-forget — mesurer ne casse jamais rien.
 *
 * Les couches de fond (une par carte, empilées) et le voile du titre sont les
 * seules superpositions `absolute` de ce fichier.
 */
import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  AccessibilityInfo, Animated, AppState, Easing, FlatList, Linking, Pressable, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import type { UseQueryResult } from '@tanstack/react-query';

import { AppText } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { HeroCarouselSkeleton } from '@/design/skeleton';
import { useTheme } from '@/design/theme';
import { useResponsive } from '@/design/layout';
import { useI18n, useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import {
  parseHeroCarouselSettings, trackHeroEvent,
  type HeroCarouselSettings, type HeroSlide,
} from '@/api/public';
import { heroBackdropColors, mixHex, pickHeroText, withAlpha } from './heroPalette';
import { isDemoSlide } from './heroDemo';
import { HERO_COPY } from '@/design/tokens.mobile';
import {
  carouselSnapOffsets, backdropLayerRange, CARD_ASPECT, CARD_GAP, carouselGeometry, indexForOffset, isStillAfterDrag, nextIndex,
  scrollOffsetForIndex, shouldAutoplayAdvance,
} from './heroCarouselLogic';

/** Zone de fondu sous les cartes : relie le fond du héros au fond blanc de la page. */
const SECTION_BOTTOM_GAP = 12;
/** Marge au-dessus du bas de l'image pour les pastilles (posées SUR la photo). */

/* ── États du composant parent ───────────────────────────────────────────── */

interface HeroCarouselProps {
  settings: UseQueryResult<HeroCarouselSettings>;
  slides: UseQueryResult<HeroSlide[]>;
  /** Repli : l'ancien hero éditorial (module désactivé / erreur / vide). */
  /** Fond de la carte active (ou `null` hors carrousel) — le header le reprend. */
  onActiveBackgroundChange?: (color: string | null) => void;
}

export function HeroCarousel({ settings, slides, onActiveBackgroundChange }: HeroCarouselProps) {
  // 1. Chargement ⇒ squelette, jamais un indicateur indéfini ni un trou blanc.
  if (settings.isPending || slides.isPending) return <HeroCarouselSkeleton />;
  // 2. Erreur de réglages ⇒ défauts sûrs (module actif, sobre, sans autoplay).
  const config = settings.data ?? parseHeroCarouselSettings(null);
  const cards = slides.data ?? [];
  // 3. Désactivé / erreur slides / aucune carte ⇒ repli sur l'ancien hero.
  if (slides.isPending) return <HeroCarouselSkeleton />;
  if (!config.enabled || slides.isError || cards.length === 0) return null;
  return (
    <HeroCarouselView
      settings={config}
      slides={cards}
      onActiveBackgroundChange={onActiveBackgroundChange}
    />
  );
}

/* ── Le carrousel ─────────────────────────────────────────────────────────── */

function HeroCarouselView({
  settings, slides, onActiveBackgroundChange,
}: {
  settings: HeroCarouselSettings;
  slides: HeroSlide[];
  onActiveBackgroundChange?: (color: string | null) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const { gutter, width } = useResponsive();
  const isFocused = useIsFocused();
  // Largeur RÉELLE de la section (mesurée) : la géométrie du carrousel en dépend,
  // pas de la largeur de fenêtre — sinon la carte active sort du centre.
  const [viewportWidth, setViewportWidth] = useState(width);
  const onSectionLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0) setViewportWidth(measured);
  }, []);

  const [activeIndex, setActiveIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const listRef = useRef<FlatList<HeroSlide>>(null);
  const bgAnim = useRef(new Animated.Value(0)).current;

  // Mouvement réduit (préférence système) : transitions instantanées, pas d'autoplay.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  // Application en arrière-plan ⇒ l'autoplay s'arrête (pas de scroll fantôme).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  // sideInset is the centering correction, not leading content padding.
  const { cardWidth, stride, sideInset } = carouselGeometry(viewportWidth, gutter);

  // Fond extérieur dérivé et éclairci, distinct de la peinture de la carte ;
  // en mode sombre, toile sombre unifiée pour éviter toute rupture chromatique.
  const edges = useMemo(
    () => slides.map((card) => (
      theme.mode === 'dark'
        ? { top: theme.colors.canvas, bottom: theme.colors.canvas }
        : heroBackdropColors(card, theme.colors.surface)
    )),
    [slides, theme.colors.canvas, theme.colors.surface, theme.mode],
  );

  // Le header reprend la teinte extérieure éclaircie ; le fond du titre reste intact.
  const activeTop = theme.mode === 'dark' ? null : (edges[activeIndex]?.top ?? null);
  useEffect(() => {
    onActiveBackgroundChange?.(activeTop);
  }, [activeTop, onActiveBackgroundChange]);
  useEffect(() => () => onActiveBackgroundChange?.(null), [onActiveBackgroundChange]);

  // Transition du fond de section vers la carte active : seule l'opacité des
  // couches bouge (fil natif), aucune couleur recalculée image par image.
  useEffect(() => {
    Animated.timing(bgAnim, {
      toValue: activeIndex,
      duration: reduceMotion ? 0 : settings.transitionMs,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [bgAnim, activeIndex, reduceMotion, settings.transitionMs]);

  // Impression : une seule fois par carte réellement affichée.
  const trackedRef = useRef(-1);
  useEffect(() => {
    if (trackedRef.current === activeIndex) return;
    trackedRef.current = activeIndex;
    const card = slides[activeIndex];
    if (card && !isDemoSlide(card.id)) trackHeroEvent(card.id, 'impression', card.destinationType, locale);
  }, [activeIndex, slides, locale]);

  // Autoplay : en pause au toucher, hors foyer, ou application en arrière-plan.
  const paused = interacting || !isFocused || !appActive;
  // Lecture de l'index courant depuis une ref : le minuteur ne se recrée pas à chaque carte.
  const indexRef = useRef(activeIndex);
  useEffect(() => { indexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => {
    if (!settings.autoplay || reduceMotion || slides.length < 2 || paused) return;
    const timer = setInterval(() => {
      const current = indexRef.current;
      // Dernière carte atteinte : on s'arrête, sans retour brusque au début.
      if (!shouldAutoplayAdvance(current, slides.length)) return;
      const next = nextIndex(current, slides.length);
      indexRef.current = next; // sans attendre le rendu : deux ticks successifs restent cohérents
      // Décalage exact (un pas = une carte) avec le padding de centrage symétrique.
      listRef.current?.scrollToOffset({ offset: scrollOffsetForIndex(next, stride, theme.isRTL, sideInset), animated: true });
      setActiveIndex(next);
    }, settings.autoplayIntervalMs);
    return () => clearInterval(timer);
  }, [settings.autoplay, settings.autoplayIntervalMs, slides.length, paused, reduceMotion, stride, sideInset, theme.isRTL]);

  const onScrollBeginDrag = useCallback(() => setInteracting(true), []);
  // Glissement relâché SANS élan : RN ne déclenche pas `onMomentumScrollEnd`,
  // donc la pause de l'autoplay resterait bloquée. On la libère ici.
  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isStillAfterDrag(event.nativeEvent.velocity?.x)) setInteracting(false);
  }, []);
  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setInteracting(false);
    setActiveIndex(indexForOffset(event.nativeEvent.contentOffset.x, stride, slides.length, sideInset));
  }, [slides.length, stride, sideInset]);

  const onPressCard = useCallback((card: HeroSlide) => {
    if (!isDemoSlide(card.id)) trackHeroEvent(card.id, 'click', card.destinationType, locale);
    if (!card.href) return;
    if (card.href.startsWith('/')) router.push(card.href as never);
    else Linking.openURL(card.href).catch(() => {});
  }, [locale]);

  return (
    <View
      testID="hero-carousel"
      onLayout={onSectionLayout}
      style={[styles.section, { marginHorizontal: -gutter, backgroundColor: edges[0]?.top ?? theme.colors.canvas }]}
    >
      {/* Fond = la photo : une couche par carte, du bord haut au bord bas de SA photo.
          Couches empilées dans l'ordre : la carte i apparaît par-dessus la précédente
          (fondu enchaîné sans trou), celles d'après restent transparentes. */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="hero-carousel-backdrop"
      >
        {edges.map((edge, index) => {
          const range = backdropLayerRange(index);
          return (
          <Animated.View
            key={slides[index]?.id ?? index}
            style={[
              StyleSheet.absoluteFill,
              range ? { opacity: bgAnim.interpolate({ ...range, extrapolate: 'clamp' }) } : null,
            ]}
          >
            <LinearGradient
              // Plusieurs étapes et un fondu long : la teinte de la photo
              // s'éclaircit progressivement, sans bande colorée avant le blanc.
              colors={[
                edge.top,
                edge.top,
                mixHex(edge.bottom, theme.colors.canvas, 0.32),
                mixHex(edge.bottom, theme.colors.canvas, 0.74),
                theme.colors.canvas,
              ]}
              locations={EDGE_LOCATIONS}
              style={StyleSheet.absoluteFill}
              testID={`hero-carousel-backdrop-${index}`}
            />
          </Animated.View>
          );
        })}
      </View>
      <FlatList
        ref={listRef}
        testID="hero-carousel-list"
        accessibilityLabel={t('home.hero.slideOf', { current: activeIndex + 1, total: slides.length })}
        accessibilityHint={t('home.hero.swipeHint')}
        data={slides}
        keyExtractor={(card) => card.id}
        horizontal
        inverted={theme.isRTL}
        showsHorizontalScrollIndicator={false}
        snapToOffsets={carouselSnapOffsets(slides.length, stride, sideInset)}
        // Snap 0 starts flush; subsequent explicit offsets center each card.
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingStart: 0, paddingEnd: sideInset, gap: CARD_GAP }}
        // Physical item positions have no leading padding. Autoplay uses snap offsets.
        getItemLayout={(_, index) => ({ length: stride, offset: stride * index, index })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        onMomentumScrollEnd={onScrollEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        renderItem={({ item }) => (
          <HeroCard
            card={item}
            width={cardWidth}
            onPress={onPressCard}
          />
        )}
      />
    </View>
  );
}

/* ── Carte ────────────────────────────────────────────────────────────────── */

interface HeroCardProps {
  card: HeroSlide;
  width: number;
  onPress: (card: HeroSlide) => void;
}

/**
 * Carte « façon Amazon » : le titre et le sous-titre sont POSÉS SUR le visuel,
 * sur un voile sombre en haut. Le visuel occupe toute la largeur de la carte.
 */
const HeroCard = memo(function HeroCard({ card, width, onPress }: HeroCardProps) {
  const theme = useTheme();
  const { locale } = useI18n();
  const isArabic = locale === 'ar';
  const title = pickHeroText(card.title, card.titleAr, isArabic);
  const subtitle = pickHeroText(card.subtitle, card.subtitleAr, isArabic);
  // Local photos remain untouched: native text sits above them on the sampled background.
  const ownedArtwork = card.localImage != null && isDemoSlide(card.id);
  const darkCopy = ownedArtwork && card.copyTone !== 'light';
  const copyColor = ownedArtwork ? (darkCopy ? HERO_COPY.black : HERO_COPY.white) : theme.colors.onMedia;
  // La carte entière est le lien : aucun bouton CTA séparé sous le visuel.
  const label = [title, subtitle].filter(Boolean).join(' · ');

  const copy = title || subtitle ? (
    <View
      testID={`hero-card-${card.id}-copy`}
      style={ownedArtwork ? [styles.ownedCopy, { minHeight: Math.max(HERO_COPY.minHeight, width * (1 / CARD_ASPECT - 1)) }] : styles.cardCopy}
      pointerEvents="none"
    >
      {title ? (
        <AppText variant="h2" color={copyColor} numberOfLines={2} style={{ fontFamily: theme.font('bold') }}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText variant="bodySmall" color={copyColor} numberOfLines={2} style={styles.cardSubtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  ) : null;

  return (
    <Pressable
      testID={`hero-card-${card.id}`}
      style={[styles.card, { width }]}
      onPress={() => onPress(card)}
      accessibilityRole="link"
      accessibilityLabel={label || undefined}
    >
      <View style={[styles.cardMedia, { borderRadius: theme.radius.lg }, ownedArtwork ? { backgroundColor: card.edgeTop || card.background } : null]}>
        {ownedArtwork ? copy : null}
        <AppImage
          testID={`hero-card-${card.id}-image`}
          uri={card.localImage != null ? null : mediaUrl(card.image)}
          localSource={card.localImage}
          contentFit="cover"
          style={ownedArtwork ? styles.ownedImage : styles.cardImage}
          accessibilityLabel={title || undefined}
          decorative={!title}
        />
        {/* Voile sombre en haut : garantit le contraste du titre posé sur la photo. */}
        {!ownedArtwork ? <LinearGradient
          testID={`hero-card-${card.id}-scrim`}
          colors={[withAlpha(theme.colors.scrim, 0.85), withAlpha(theme.colors.scrim, 0)]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={styles.cardScrim}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        /> : null}
        {!ownedArtwork ? copy : null}
      </View>
    </Pressable>
  );
});

/* ── Styles ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  // Pas de fond propre à la carte : le fond du carrousel passe derrière les
  // voisines et finit en fondu dans le fond de page.
  section: { paddingTop: 16, paddingBottom: SECTION_BOTTOM_GAP, overflow: 'hidden' },
  // Pas de marge interne : le visuel occupe toute la largeur de la carte (plus grand).
  card: {},
  cardMedia: { overflow: 'hidden' },
  cardImage: { width: '100%', aspectRatio: CARD_ASPECT },
  ownedImage: { width: '100%', aspectRatio: 1 },
  ownedCopy: { padding: HERO_COPY.inset, minHeight: HERO_COPY.minHeight, justifyContent: 'center' },
  cardScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: '60%' },
  /** Pastilles posées sur le bas de la photo, centrées, sur un petit voile. */
  /** Titre et sous-titre posés sur le visuel, en haut (début de ligne), marges intérieures. */
  cardCopy: { position: 'absolute', start: 16, end: 16, top: 16 },
  cardSubtitle: { marginTop: 4 },
});

/**
 * Bandes de la couche de fond : le haut reprend le bord haut de la photo,
 * puis son bord bas, avant un fondu vers le fond de page en bas de la section.
 */
const EDGE_LOCATIONS = [0, 0.18, 0.55, 0.82, 1] as const;

