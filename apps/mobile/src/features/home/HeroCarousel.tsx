/**
 * Carrousel Hero de l'accueil — piloté par l'Admin (`hero_slides`), servi par
 * `/api/public/hero-slides`, fond adaptatif extrait côté serveur (§5).
 *
 * Contrat d'affichage :
 *  • chargement ⇒ squelette de la forme attendue, JAMAIS un trou blanc ;
 *  • module désactivé / erreur API / aucune carte ⇒ rien (il n'existe plus d'ancien hero) ;
 *  • carte = titre + visuel 4:5 + fondu vers le fond + CTA optionnel ;
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
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n, useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import {
  parseHeroCarouselSettings, trackHeroEvent,
  type HeroCarouselSettings, type HeroSlide,
} from '@/api/public';
import { adaptiveInk, pickHeroText } from './heroPalette';
import { isDemoSlide } from './heroDemo';
import {
  CARD_ASPECT, CARD_GAP, carouselGeometry, indexForOffset, isStillAfterDrag, nextIndex,
  shouldAutoplayAdvance,
} from './heroCarouselLogic';

/** Hauteur du fondu final vers le fond de page (blanc) sous le carrousel. */
const PAGE_FADE_HEIGHT = 72;

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
  const backgrounds = useMemo(
    () => slides.map((card) => card.background || theme.colors.surface),
    [slides, theme.colors.surface],
  );
  const sectionBackground = bgAnim.interpolate({
    inputRange: slides.map((_, index) => index),
    outputRange: backgrounds,
  });
  // Couleur unique du carrousel = couleur de la carte active. Les voisines la
  // reprennent (texte, fondu) : aucune pastille de couleur différente ne subsiste.
  const surface = backgrounds[activeIndex] ?? theme.colors.surface;

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

  const dotInk = adaptiveInk(surface, theme.colors);

  return (
    <Animated.View
      testID="hero-carousel"
      onLayout={onSectionLayout}
      style={[styles.section, { marginHorizontal: -gutter, backgroundColor: sectionBackground }]}
    >
      <FlatList
        ref={listRef}
        testID="hero-carousel-list"
        data={slides}
        keyExtractor={(card) => card.id}
        horizontal
        inverted={theme.isRTL}
        showsHorizontalScrollIndicator={false}
        snapToInterval={stride}
        snapToAlignment="center"
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
            surface={surface}
            fadeTo={surface}
            onPress={onPressCard}
          />
        )}
      />
      {settings.paginationVisible && slides.length > 1 ? (
        <View
          testID="hero-carousel-dots"
          style={[styles.dots, { flexDirection: rowDirectionFor(theme.isRTL) }]}
          accessibilityLabel={t('home.hero.slideOf', { current: activeIndex + 1, total: slides.length })}
          accessibilityHint={t('home.hero.swipeHint')}
        >
          {slides.map((card, index) => (
            <View
              key={card.id}
              accessibilityElementsHidden
              style={[
                styles.dot,
                { backgroundColor: dotInk },
                index === activeIndex ? styles.dotActive : { opacity: theme.opacity.disabled },
              ]}
            />
          ))}
        </View>
      ) : null}
      {/* Fin de carrousel : le fond passe en douceur au blanc de la page. */}
      <LinearGradient
        colors={['transparent', theme.colors.canvas]}
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
  /** Couleur du carrousel (carte active) — couleur du texte posé dessus. */
  surface: string;
  /** Couleur vers laquelle le visuel se dissout (= couleur du carrousel). */
  fadeTo: string;
  onPress: (card: HeroSlide) => void;
}

const HeroCard = memo(function HeroCard({ card, width, surface, fadeTo, onPress }: HeroCardProps) {
  const theme = useTheme();
  const { locale } = useI18n();
  const isArabic = locale === 'ar';
  const ink = adaptiveInk(surface, theme.colors);
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
      {title ? (
        <AppText variant="title" weight="bold" color={ink} numberOfLines={2} style={styles.cardTitle}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText variant="body" color={ink} numberOfLines={2} style={styles.cardSubtitle}>
          {subtitle}
        </AppText>
      ) : null}
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
        {/* Fondu : le bas du visuel se dissout dans le fond de la carte (§5.4). */}
        <LinearGradient
          colors={['transparent', fadeTo]}
          start={{ x: 0.5, y: 0.55 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardFade}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
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
  card: { padding: 16 },
  pageFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cardTitle: { marginBottom: 4 },
  cardSubtitle: { marginBottom: 12 },
  cardMedia: { overflow: 'hidden' },
  cardImage: { width: '100%', aspectRatio: CARD_ASPECT },
  /** Superposition unique : le fondu du visuel vers le fond de la carte. */
  cardFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  cardCta: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 999 },
  dotActive: { width: 20 },
});
