/**
 * Barre d'onglets principale — 5 destinations visibles dans une barre opaque
 * pleine largeur posée bord à bord en bas de l'écran (aucune transparence,
 * aucun vide sous la barre) :
 *
 *   `Accueil` · `Lens` · `Clean` · `AYWEBs` · `Profil`
 *
 *   • Aucun libellé visuel; les noms accessibles sont conservés.
 *   • Accueil utilise notre symbole (noir/blanc même actif). Les autres icônes appartiennent à la famille unique officielle (`Ionicons`
 *     `-outline` via `TabNavIcons`, grille `24 × 24` pt).
 *   • `AYWEBs` occupe l'emplacement central avec l'icône recherche avec étoile
 *     en noir/blanc, comme les autres icônes monochromes, sans libellé.
 *   • `cart` reste une route valide (`href: null`) pour l'icône panier.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { revealChrome, useChromeHidden } from '@/design/chrome';
import { requestScrollToTop } from '@/features/shell/scrollToTop';
import { useSession } from '@/state/session';
import {
  TabAywebsPawIcon,
  NAV_ICON_SIZE,
  TabHomeIcon,
  TabLensIcon,
  TabProfileIcon,
  TabSonimIcon,
} from '@/design/TabNavIcons';
import { useTheme } from '@/design/theme';
import { TAB_BAR_SURFACE } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { useReduceMotion } from '@/design/motion';
import { tabMotion } from '@/design/navigationMotion';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

/** Glissement de la barre : court à la sortie, un peu plus doux au retour. */
export const TAB_BAR_HIDE_MS = 200;
export const TAB_BAR_SHOW_MS = 240;

/**
 * Barre d'onglets qui GLISSE (12/11/2026). La barre de React Navigation est
 * rendue telle quelle (mêmes options, mêmes icônes) dans un calque posé en bas
 * de l'écran ; seul son `translateY` bouge, sur le fil natif — aucune hauteur
 * d'écran ne change, donc rien ne saute ni ne clignote. L'écran réserve la
 * place de la barre (`AppScreen hasBottomBar`). Mouvement réduit : bascule
 * immédiate.
 */
export function SlidingTabBar(props: BottomTabBarProps) {
  const hidden = useChromeHidden();
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: hidden ? 1 : 0,
      duration: reduceMotion ? 0 : hidden ? TAB_BAR_HIDE_MS : TAB_BAR_SHOW_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [hidden, progress, reduceMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    if (next !== height) setHeight(next);
  };

  return (
    <Animated.View
      testID="tab-bar-slider"
      onLayout={onLayout}
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.slider,
        { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height + 1] }) }] },
      ]}
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const surface = TAB_BAR_SURFACE[theme.mode];
  const pathname = usePathname();
  const signedIn = useSession().status === 'signedIn';
  const motion = tabMotion(useReduceMotion());

  const standardIconSlot = {
    width: NAV_ICON_SIZE,
    height: NAV_ICON_SIZE,
  };
  const centerIconSlot = {
    width: NAV_ICON_SIZE,
    height: NAV_ICON_SIZE,
  };

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <SlidingTabBar {...props} />}
      screenListeners={{
        tabPress: () => revealChrome(),
      }}
      screenOptions={{
        headerShown: false,
        ...motion,
        tabBarActiveTintColor: theme.colors.ink,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabItem,
        // Toujours la MÊME barre : le repli au défilement est un glissement
        // (`SlidingTabBar`), plus un `display: 'none'` qui changeait la hauteur.
        tabBarStyle: {
          height: theme.chrome.tabBar + insets.bottom,
          paddingTop: theme.space[0],
          paddingBottom: insets.bottom,
          paddingHorizontal: theme.space[0],
          backgroundColor: surface.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: surface.border,
          ...theme.elevation.none,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={{
          /**
           * Re-tap sur l'onglet déjà actif : la page remonte EN HAUT
           * (référence Zalando). Le premier tap change d'onglet normalement.
           */
          tabPress: (event) => {
            if (pathname !== '/') return;
            event.preventDefault();
            revealChrome();
            requestScrollToTop();
          },
        }}
        options={{
          title: t('tabs.home'),
          tabBarAccessibilityLabel: t('tabs.home'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabHomeIcon size={NAV_ICON_SIZE} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="lens"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push('/z-lens');
          },
        }}
        options={{
          title: t('tabs.lens'),
          tabBarAccessibilityLabel: t('tabs.lens'),
          tabBarStyle: { display: 'none' },
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabLensIcon size={NAV_ICON_SIZE} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sonim"
        options={{
          title: t('tabs.sonim'),
          tabBarAccessibilityLabel: t('tabs.sonim'),
          tabBarStyle: { display: 'none' },
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabSonimIcon size={NAV_ICON_SIZE} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="aywebs"
        options={{
          title: t('tabs.aywebs'),
          tabBarShowLabel: false,
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: t('tabs.aywebs'),
          tabBarIconStyle: centerIconSlot,
          tabBarIcon: ({ focused }) => (
            <TabAywebsPawIcon size={NAV_ICON_SIZE} color={theme.colors.ink} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        listeners={{
          /**
           * Visiteur non connecté : l'onglet Profil ouvre DIRECTEMENT la
           * connexion (référence Zalando) — plus d'étape intermédiaire
           * « Votre compte ». La page compte reste atteignable en lien
           * direct une fois connecté.
           */
          tabPress: (event) => {
            if (signedIn) return;
            event.preventDefault();
            revealChrome();
            if (pathname !== '/sign-in') router.push('/sign-in');
          },
        }}
        options={{
          title: t('tabs.account'),
          tabBarAccessibilityLabel: t('tabs.account'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabProfileIcon size={NAV_ICON_SIZE} color={color} focused={focused} />
          ),
        }}
      />
      {/* Social entry hidden only; existing Publication and deep links remain valid. */}
      <Tabs.Screen name="social" options={{ href: null, title: t('tabs.social') }} />
      {/* Panier conservé comme route valide pour les liens directs, sans barre d'onglets. */}
      <Tabs.Screen name="cart" options={{ href: null, tabBarStyle: { display: 'none' }, title: t('tabs.cart') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Calque de la barre : posé en bas, au-dessus de l'écran (superposition
  // inventoriée dans tests/design-system.test.ts).
  slider: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabItem: {
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
