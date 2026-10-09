/**
 * Carrousel Hero de l'accueil — piloté par l'Admin (`hero_slides`), servi par
 * `/api/public/hero-slides`, fond adaptatif extrait côté serveur (§5).
 *
 * Contrat d'affichage :
 *  • chargement ⇒ squelette de la forme attendue, JAMAIS un trou blanc ;
 *  • module désactivé / erreur API / aucune carte ⇒ `fallback` (l'ancien hero) ;
 *  • carte = titre + visuel 4:5 + fondu vers le fond + CTA optionnel ;
 *  • la section adapte son fond à la carte active (transition animée) ;
 *  • impression/clic tracés en fire-and-forget — mesurer ne casse jamais rien.
 *
 * Le fondu (dégradé) est la SEULE superposition `absolute` de ce fichier : le
 * visuel se dissout dans la couleur de la carte, il n'est pas posé dans le flux.
 */
import {
  memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  AccessibilityInfo, Animated, AppState, Easing, FlatList, Linking, Pressable, StyleSheet, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
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

/* ── Géométrie ───────────────────────────────────────────────────────────── */

const CARD_ASPECT = 4 / 5;
const CARD_GAP = 16;
/** Largeur du voisin visible à droite/gauche : le carrousel se devine. */
const CARD_PEEK = 24;
/** Sur tablette, la carte est plafonnée (le 4:5 géant n'a pas de sens). */
const CARD_MAX_WIDTH = 400;
const CARD_MIN_WIDTH = 240;

/* ── États du composant parent ───────────────────────────────────────────── */

interface HeroCarouselProps {
  settings: UseQueryResult<HeroCarouselSettings>;
  slides: UseQueryResult<HeroSlide[]>;
  /** Repli : l'ancien hero éditorial (module désactivé / erreur / vide). */
  fallback: ReactNode;
}

export function HeroCarousel({ settings, slides, fallback }: HeroCarouselProps) {
  // 1. Chargement ⇒ squelette, jamais un indicateur indéfini ni un trou blanc.
  if (settings.isPending || slides.isPending) return <HeroCarouselSkeleton />;
  // 2. Erreur de réglages ⇒ défauts sûrs (module actif, sobre, sans autoplay).
  const config = settings.data ?? parseHeroCarouselSettings(null);
  const cards = slides.data ?? [];
  // 3. Désactivé / erreur slides / aucune carte ⇒ repli sur l'ancien hero.
  if (!config.enabled || slides.isError || cards.length === 0) return <>{fallback}</>;
  return <HeroCarouselView settings={config} slides={cards} />;
}

/* ── Le carrousel ─────────────────────────────────────────────────────────── */

function HeroCarouselView({ settings, slides }: { settings: HeroCarouselSettings; slides: HeroSlide[] }) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const { gutter, width } = useResponsive();
  const isFocused = useIsFocused();

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

  // Géométrie : carte bord-à-bord, le voisin dépasse (découvrabilité du swipe).
  const cardWidth = Math.min(
    CARD_MAX_WIDTH,
    Math.max(CARD_MIN_WIDTH, width - 2 * gutter - CARD_GAP - CARD_PEEK),
  );
  const stride = cardWidth + CARD_GAP;

  // Fond effectif de chaque carte (palette serveur, repli = surface du thème).
  const backgrounds = useMemo(
    () => slides.map((card) => card.background || theme.colors.surface),
    [slides, theme.colors.surface],
  );
  const sectionBackground = bgAnim.interpolate({
    inputRange: slides.map((_, index) => index),
    outputRange: backgrounds,
  });

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
    if (card) trackHeroEvent(card.id, 'impression', card.destinationType, locale);
  }, [activeIndex, slides, locale]);

  // Autoplay : en pause au toucher, hors foyer, ou application en arrière-plan.
  const paused = interacting || !isFocused || !appActive;
  useEffect(() => {
    if (!settings.autoplay || reduceMotion || slides.length < 2 || paused) return;
    const timer = setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % slides.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, settings.autoplayIntervalMs);
    return () => clearInterval(timer);
  }, [settings.autoplay, settings.autoplayIntervalMs, slides.length, paused, reduceMotion]);

  const onScrollBeginDrag = useCallback(() => setInteracting(true), []);
  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setInteracting(false);
    // `inverted` (RTL) ⇒ offset négatif : la valeur absolue suit toujours l'index.
    const x = Math.abs(event.nativeEvent.contentOffset.x);
    const next = Math.min(slides.length - 1, Math.max(0, Math.round(x / stride)));
    setActiveIndex(next);
  }, [slides.length, stride]);

  const onPressCard = useCallback((card: HeroSlide) => {
    trackHeroEvent(card.id, 'click', card.destinationType, locale);
    if (!card.href) return;
    if (card.href.startsWith('/')) router.push(card.href as never);
    else Linking.openURL(card.href).catch(() => {});
  }, [locale]);

  const ink = adaptiveInk(backgrounds[activeIndex] ?? theme.colors.surface, theme.colors);

  return (
    <Animated.View
      testID="hero-carousel"
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
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: gutter, gap: CARD_GAP }}
        getItemLayout={(_, index) => ({ length: stride, offset: stride * index, index })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        onMomentumScrollEnd={onScrollEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        renderItem={({ item }) => (
          <HeroCard
            card={item}
            width={cardWidth}
            background={item.background || theme.colors.surface}
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
                { backgroundColor: ink },
                index === activeIndex ? styles.dotActive : { opacity: theme.opacity.disabled },
              ]}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

/* ── Carte ────────────────────────────────────────────────────────────────── */

interface HeroCardProps {
  card: HeroSlide;
  width: number;
  /** Fond effectif (palette ou repli) — cible du fondu ET couleur du texte. */
  background: string;
  onPress: (card: HeroSlide) => void;
}

const HeroCard = memo(function HeroCard({ card, width, background, onPress }: HeroCardProps) {
  const theme = useTheme();
  const { locale } = useI18n();
  const isArabic = locale === 'ar';
  const ink = adaptiveInk(background, theme.colors);
  const title = pickHeroText(card.title, card.titleAr, isArabic);
  const subtitle = pickHeroText(card.subtitle, card.subtitleAr, isArabic);
  const cta = pickHeroText(card.cta, card.ctaAr, isArabic);
  // Libellé composé des données serveur — jamais de chaîne écrite en dur.
  const label = [title, subtitle, cta].filter(Boolean).join(' · ');

  return (
    <Pressable
      testID={`hero-card-${card.id}`}
      style={[styles.card, { width, backgroundColor: background }]}
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
          uri={mediaUrl(card.image)}
          contentFit="cover"
          style={styles.cardImage}
          accessibilityLabel={title || undefined}
          decorative={!title}
        />
        {/* Fondu : le bas du visuel se dissout dans le fond de la carte (§5.4). */}
        <LinearGradient
          colors={['transparent', background]}
          start={{ x: 0.5, y: 0.55 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardFade}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      {cta ? (
        <View
          style={[styles.cardCta, { backgroundColor: theme.colors.action }]}
          accessibilityElementsHidden
        >
          <AppText variant="label" weight="bold" color={theme.colors.onAction} numberOfLines={1}>
            {cta}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
});

/* ── Styles ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  section: { paddingVertical: 16 },
  card: { padding: 16 },
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
