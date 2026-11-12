/** Sparse main identity. LegacyMainMenu and all destinations remain available in source, unmounted. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandWordmark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { RADIUS } from '@/design/tokens.mobile';
import { AYWEBS_WORDMARK_TINT } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useSession } from '@/state/session';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { adaptiveInk } from '@/features/home/heroPalette';
import { requestScrollToTop } from '@/features/shell/scrollToTop';
import { backdropLayerRange } from '@/features/home/heroCarouselLogic';
import type { HeroTint } from '@/features/home/HeroCarousel';

/** Passage teinte Hero ↔ fond de page quand la page défile : fondu court, jamais une coupure. */
export const HEADER_TINT_FADE_MS = 180;

export function AppHeader({ scrolled, heroBackground = null, heroTint = null, brand = 'zayrovi', showNotifications = true }: {
  scrolled: boolean; heroBackground?: string | null;
  /**
   * Teintes du carrousel + avancement animé (12/11/2026) : le fond de
   * l'en-tête se fond d'une carte à l'autre AU MÊME RYTHME que la section,
   * au lieu de changer d'un coup à la fin du geste.
   */
  heroTint?: HeroTint | null;
  brand?: 'zayrovi' | 'aywebs'; showNotifications?: boolean;
}) {
  const theme = useTheme(), t = useT(), insets = useSafeAreaInsets();
  const { status } = useSession();
  const pathname = usePathname();
  const onHero = !scrolled && heroBackground !== null;
  const ink = onHero ? adaptiveInk(heroBackground, theme.colors) : theme.colors.ink;
  // Calque « teinte Hero » au-dessus du fond de page : seule son opacité bouge.
  const hasTint = heroBackground !== null || (heroTint?.colors.length ?? 0) > 0;
  const tintFade = useRef(new Animated.Value(onHero ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(tintFade, {
      toValue: onHero ? 1 : 0,
      duration: HEADER_TINT_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [onHero, tintFade]);
  const row = theme.isRTL ? 'row-reverse' : 'row';
  /**
   * Visiteur (référence Zalando 085451) : sur l'en-tête PRINCIPAL, le
   * mot-symbole, la cloche et la panier laissent place à une seule invitation
   * « Bienvenue, se connecter ? » qui ouvre la connexion. L'expérience
   * boutique AYWEBs garde sa propre identité : son en-tête ne change pas.
   */
  const guest = status !== 'signedIn' && brand === 'zayrovi';
  const icon = (name: keyof typeof Ionicons.glyphMap, label: string, href: string) => <Pressable
    accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href as never)} style={styles.hit}>
    <Ionicons name={name} size={theme.iconSize.md} color={ink} />
  </Pressable>;
  /** Le mot-symbole ramène à l'accueil ; sur l'accueil déjà ouvert, il remonte la page en haut. */
  const openHome = () => {
    if (pathname !== '/') router.push('/');
    requestScrollToTop();
  };
  return <View testID="main-app-header" pointerEvents="box-none" style={[styles.bar, {
    height: insets.top + theme.chrome.header, paddingTop: insets.top, flexDirection: row,
    backgroundColor: theme.colors.canvas,
    borderBottomColor: scrolled ? theme.colors.line : 'transparent',
  }]}>
    {hasTint ? (
      <Animated.View
        testID="main-app-header-tint"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { opacity: tintFade }]}
      >
        {heroTint && heroTint.colors.length > 0 ? heroTint.colors.map((color, index) => {
          const range = backdropLayerRange(index);
          return (
            <Animated.View
              key={`${index}-${color}`}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: color },
                range ? { opacity: heroTint.progress ? heroTint.progress.interpolate({ ...range, extrapolate: 'clamp' }) : 0 } : null,
              ]}
            />
          );
        }) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: heroBackground ?? theme.colors.canvas }]} />
        )}
      </Animated.View>
    ) : null}
    {guest ? (
      <Pressable
        testID="guest-header-signin"
        accessibilityRole="button"
        accessibilityLabel={`${t('header.guest.prefix')} ${t('header.guest.link')}`}
        onPress={() => router.push('/sign-in')}
        style={styles.wordmark}
      >
        <AppText variant="body" color={ink}>
          {t('header.guest.prefix')}{' '}
          <AppText variant="body" color={ink} style={styles.guestLink}>{t('header.guest.link')}</AppText>
        </AppText>
      </Pressable>
    ) : (
      <Pressable testID={brand === 'aywebs' ? 'aywebs-header-wordmark' : 'main-header-wordmark'} accessibilityRole="button" accessibilityLabel={t('nav.home')} onPress={brand === 'aywebs' ? () => router.push('/') : openHome} style={styles.wordmark}>
        {brand === 'aywebs' ? <AppImage localSource={theme.mode === 'dark' ? require('../../../assets/aywebs/aywebs-wordmark-white.png') : require('../../../assets/aywebs/aywebs-wordmark-violet.png')}
          contentFit="contain" tintColor={AYWEBS_WORDMARK_TINT[theme.mode]} decorative background={null} style={styles.aywebsWordmark} />
          : <BrandWordmark height={25} color={ink} />}
      </Pressable>
    )}
    <View style={{ flexDirection: row, alignItems: 'center', gap: 0, flexShrink: 0 }}>
      {/* Plus Light : visible seulement connecté — le visiteur, lui, ne voit
          QUE l'invitation de connexion (demande du 10/11, capture 122549). */}
      {brand === 'zayrovi' && status === 'signedIn' ? <Pressable testID="plus-light" accessibilityRole="button" accessibilityLabel={t('brand.plusLight')} accessibilityState={{ disabled: true }} disabled
        style={styles.plusHit}><View testID="plus-light-pill" style={[styles.plus, { borderColor: ink }]}><AppText variant="captionStrong" color={ink} numberOfLines={1}>Plus</AppText><Ionicons name="star" size={theme.iconSize.xs} color={ink} /><AppText variant="caption" color={ink} numberOfLines={1}>Light</AppText></View></Pressable> : null}
      {!guest && showNotifications ? icon('notifications-outline', t('account.menu.notifications'), status === 'signedIn' ? '/account/notifications' : '/sign-in') : null}
      {brand === 'aywebs' ? icon('heart-outline', t('account.menu.favorites'), '/account/favorites') : null}
      {!guest ? icon('bag-outline', t('cart.title'), '/panier') : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  aywebsWordmark: { width: 121, height: 42 },
  // Une seule ligne, toujours : le groupe de contrôles ne se replie jamais,
  // seul le mot-symbole peut se resserrer sur écran étroit.
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  wordmark: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  // Invitation visiteur : « se connecter ? » porte le soulignement-lien,
  // la seule affordance demandée (référence Zalando « Welcome, sign in? »).
  guestLink: { textDecorationLine: 'underline' },
  // Zone de toucher 44 conservée ; le cadre visible, lui, ÉPOUSE le texte
  // (référence « New for you » : cadre fin, mots + étoile harmonisés).
  plusHit: { minWidth: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: RADIUS.full },
});
