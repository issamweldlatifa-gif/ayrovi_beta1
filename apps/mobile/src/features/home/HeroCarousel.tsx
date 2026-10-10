/**
 * Carrousel Hero de l'accueil — piloté par l'Admin (`hero_slides`), servi par
 * `/api/public/hero-slides`, fond adaptatif extrait côté serveur (§5).
 *
 * Contrat d'affichage :
 *  • chargement ⇒ squelette de la forme attendue, JAMAIS un trou blanc ;
 *  • module désactivé / erreur API / aucune carte ⇒ rien (il n'existe plus d'ancien hero) ;
 *  • carte = titre + visuel 5:8 + fondu vers le fond + CTA optionnel ;
 *  • la section adapte son fond à la carte active (transition animée) ;
 *  • impression/clic tracés en fire-and-forget — mesurer ne casse jamais rien.
 *
 * Le fondu (dégradé) est la SEULE superposition `absolute` de ce fichier : le
 * visuel se dissout dans la couleur de la carte, il n'est pas posé dans le flux.
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
import { pickHeroText, softenHeroBackground, withAlpha } from './heroPalette';
import { isDemoSlide } from './heroDemo';
import {
  CARD_ASPECT, CARD_GAP, carouselGeometry, indexForOffset, isStillAfterDrag, nextIndex,
  shouldAutoplayAdvance,
} from './heroCarouselLogic';

/** Hauteur du fondu final vers le fond de page (blanc) sous le carrousel. */
const PAGE_FADE_HEIGHT = 120;
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

  // Géométrie : carte active centrée, voisines visibles à égale distance des deux côtés.
  const { cardWidth, stride, sideInset } = carouselGeometry(viewportWidth);

  // Fond effectif de chaque carte (palette serveur, repli = surface du thème).
  // Fond adouci vers le blanc de la page : le cadre de la photo reste visible.
  const backgrounds = useMemo(
    () => slides.map((card) => softenHeroBackground(card.background || theme.colors.surface, theme.colors.canvas)),
    [slides, theme.colors.surface, theme.colors.canvas],
  );
  const sectionBackground = bgAnim.interpolate({
    inputRange: slides.map((_, index) => index),
    outputRange: backgrounds,
  });
  // Le header reçoit la couleur adoucie de la carte active (même valeur que la section).

  // Le header reprend la couleur de la carte active ; remise à zéro au démontage.
  useEffect(() => {
    onActiveBackgroundChange?.(backgrounds[activeIndex] ?? null);
  }, [activeIndex, backgrounds, onActiveBackgroundChange]);
  useEffect(() => () => onActiveBackgroundChange?.(null), [onActiveBackgroundChange]);

  // Transition du fond de section vers la carte active.
  useEffect(() => {
    Animated.timing(bgAnim, {
      toValue: activeIndex,
      duration: reduceMotion ? 0 : settings.transitionMs,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
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
      listRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0.5 });
      setActiveIndex(next);
    }, settings.autoplayIntervalMs);
    return () => clearInterval(timer);
  }, [settings.autoplay, settings.autoplayIntervalMs, slides.length, paused, reduceMotion]);

  const onScrollBeginDrag = useCallback(() => setInteracting(true), []);
  // Glissement relâché SANS élan : RN ne déclenche pas `onMomentumScrollEnd`,
  // donc la pause de l'autoplay resterait bloquée. On la libère ici.
  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isStillAfterDrag(event.nativeEvent.velocity?.x)) setInteracting(false);
  }, []);
  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setInteracting(false);
    setActiveIndex(indexForOffset(event.nativeEvent.contentOffset.x, stride, slides.length));
  }, [slides.length, stride]);

  const onPressCard = useCallback((card: HeroSlide) => {
    if (!isDemoSlide(card.id)) trackHeroEvent(card.id, 'click', card.destinationType, locale);
    if (!card.href) return;
    if (card.href.startsWith('/')) router.push(card.href as never);
    else Linking.openURL(card.href).catch(() => {});
  }, [locale]);

  return (
    <Animated.View
      testID="hero-carousel"
      onLayout={onSectionLayout}
      style={[styles.section, { marginHorizontal: -gutter, backgroundColor: sectionBackground }]}
    >
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
        snapToInterval={stride}
        // « start » et PAS « center » : avec snapToInterval = stride (carte + espace),
        // « center » centre un bloc de largeur stride et décale la carte de l'espace / 2.
        // Le décalage `i × stride` calculé plus haut est déjà le bon point de centrage.
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sideInset, gap: CARD_GAP }}
        // Le décalage inclut le retrait initial : sans lui, `scrollToIndex` vise à côté.
        getItemLayout={(_, index) => ({ length: stride, offset: sideInset + stride * index, index })}
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
      {/* Fin de carrousel : le fond passe en douceur au blanc de la page. */}
      <LinearGradient
        colors={[
          withAlpha(theme.colors.canvas, 0),
          withAlpha(theme.colors.canvas, 0.55),
          theme.colors.canvas,
        ]}
        locations={[0, 0.5, 1]}
        style={[styles.pageFade, { height: PAGE_FADE_HEIGHT }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Animated.View>
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
 * sur un voile sombre en bas. Le visuel occupe toute la largeur de la carte.
 */
const HeroCard = memo(function HeroCard({ card, width, onPress }: HeroCardProps) {
  const theme = useTheme();
  const { locale } = useI18n();
  const isArabic = locale === 'ar';
  const title = pickHeroText(card.title, card.titleAr, isArabic);
  const subtitle = pickHeroText(card.subtitle, card.subtitleAr, isArabic);
  const cta = pickHeroText(card.cta, card.ctaAr, isArabic);
  // Libellé composé des données serveur — jamais de chaîne écrite en dur.
  const label = [title, subtitle, cta].filter(Boolean).join(' · ');

  return (
    <Pressable
      testID={`hero-card-${card.id}`}
      style={[styles.card, { width }]}
      onPress={() => onPress(card)}
      accessibilityRole="link"
      accessibilityLabel={label || undefined}
    >
      <View style={[styles.cardMedia, { borderRadius: theme.radius.lg }]}>
        <AppImage
          testID={`hero-card-${card.id}-image`}
          uri={card.localImage != null ? null : mediaUrl(card.image)}
          localSource={card.localImage}
          contentFit="cover"
          style={styles.cardImage}
          accessibilityLabel={title || undefined}
          decorative={!title}
        />
        {/* Voile sombre en haut : garantit le contraste du titre posé sur la photo. */}
        <LinearGradient
          colors={[theme.colors.scrim, withAlpha(theme.colors.scrim, 0)]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={styles.cardScrim}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        {title || subtitle ? (
          <View style={styles.cardCopy} pointerEvents="none">
            {title ? (
              <AppText variant="title" weight="bold" color={theme.colors.onMedia} numberOfLines={2}>
                {title}
              </AppText>
            ) : null}
            {subtitle ? (
              <AppText variant="body" color={theme.colors.onMedia} numberOfLines={2} style={styles.cardSubtitle}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
      {cta ? (
        <Pressable
          testID={`hero-card-${card.id}-cta`}
          onPress={() => onPress(card)}
          accessibilityRole="button"
          accessibilityLabel={cta}
          style={({ pressed }) => [
            styles.cardCta,
            { backgroundColor: theme.colors.action, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppText variant="label" weight="bold" color={theme.colors.onAction} numberOfLines={1}>
            {cta}
          </AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
});

/* ── Styles ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  // Pas de fond propre à la carte : le fond continu du carrousel passe derrière
  // les voisines (aucune bande coupée). Le bas de section laisse place au fondu.
  section: { paddingTop: 16, paddingBottom: PAGE_FADE_HEIGHT, overflow: 'hidden' },
  // Pas de marge interne : le visuel occupe toute la largeur de la carte (plus grand).
  card: {},
  cardMedia: { overflow: 'hidden' },
  cardImage: { width: '100%', aspectRatio: CARD_ASPECT },
  cardScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: '60%' },
  /** Pastilles posées sur le bas de la photo, centrées, sur un petit voile. */
  /** Titre et sous-titre posés sur le visuel, en haut (début de ligne), marges intérieures. */
  cardCopy: { position: 'absolute', start: 16, end: 16, top: 16 },
  cardSubtitle: { marginTop: 4 },
  cardCta: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pageFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

