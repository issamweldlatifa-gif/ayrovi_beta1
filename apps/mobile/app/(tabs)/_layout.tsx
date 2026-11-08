/**
 * Barre d'onglets principale — 5 destinations visibles dans une barre opaque
 * pleine largeur posée bord à bord en bas de l'écran (aucune transparence,
 * aucun vide sous la barre) :
 *
 *   `Accueil` · `Lens` · `AYWEBs` · `Clean` · `Profil`
 *
 *   • Aucun libellé visuel; les noms accessibles sont conservés.
 *   • Accueil utilise notre symbole (noir/blanc même actif). Les autres icônes appartiennent à la famille unique officielle (`Ionicons`
 *     `-outline` via `TabNavIcons`, grille `24 × 24` pt).
 *   • `AYWEBs` occupe l'emplacement central avec l'icône recherche avec étoile
 *     en noir/blanc, comme les autres icônes monochromes, sans libellé.
 *   • `cart` reste une route valide (`href: null`) pour l'icône panier.
 */
import { StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { revealChrome, useChromeHidden } from '@/design/chrome';
import {
  TabAywebsPawIcon,
  TabHomeIcon,
  TabLensIcon,
  TabProfileIcon,
  TabSonimIcon,
} from '@/design/TabNavIcons';
import { useTheme } from '@/design/theme';
import { TAB_BAR_SURFACE } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const chromeHidden = useChromeHidden();
  const surface = TAB_BAR_SURFACE[theme.mode];

  const standardIconSlot = {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
  };
  const centerIconSlot = {
    flex: 1,
    width: theme.iconSize.md,
    height: theme.iconSize.md,
  };

  return (
    <Tabs
      backBehavior="history"
      screenListeners={{
        tabPress: () => revealChrome(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.ink,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: chromeHidden
          ? { display: 'none' }
          : {
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
        options={{
          title: t('tabs.home'),
          tabBarAccessibilityLabel: t('tabs.home'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabHomeIcon color={color} focused={focused} />
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
            <TabLensIcon color={color} focused={focused} />
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
            <TabAywebsPawIcon color={theme.colors.ink} focused={focused} />
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
            <TabSonimIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account'),
          tabBarAccessibilityLabel: t('tabs.account'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabProfileIcon color={color} focused={focused} />
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
  tabItem: {
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
