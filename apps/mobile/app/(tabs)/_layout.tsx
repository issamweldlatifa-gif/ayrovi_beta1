/**
 * Barre d'onglets principale — 5 destinations visibles dans une barre opaque
 * pleine largeur posée bord à bord en bas de l'écran (aucune transparence,
 * aucun vide sous la barre) :
 *
 *   `Accueil` · `Lens` · `AYWEBs` · `Sonim` · `Profil`
 *
 *   • Toutes les icônes appartiennent à la famille unique officielle (`Ionicons`
 *     `-outline` via `TabNavIcons`, grille `24 × 24` pt).
 *   • `AYWEBs` occupe l'emplacement central avec l'icône patte de chat officielle
 *     en violet de marque (`#0113B5` en clair, `#FFFFFF` en sombre), sans libellé.
 *   • `cart` reste une route valide (`href: null`) pour l'icône panier.
 */
import { AppText } from '@/design/ui';
import { StyleSheet, View } from 'react-native';
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
import { AYWEBS_WORDMARK_TINT, TAB_BAR_SURFACE } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const chromeHidden = useChromeHidden();
  const surface = TAB_BAR_SURFACE[theme.mode];

  const label =
    (text: string) =>
    ({ focused }: { focused: boolean }) =>
      (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <AppText
            variant="captionStrong"
            color={focused ? theme.colors.ink : theme.colors.muted}
          >
            {text}
          </AppText>
          <View
            style={{
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: focused ? theme.colors.focus : 'transparent',
            }}
          />
        </View>
      );

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
        tabBarLabelStyle: {
          ...theme.text('captionStrong'),
          marginTop: 0,
        },
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
          tabBarLabel: label(t('tabs.home')),
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
          tabBarLabel: label(t('tabs.lens')),
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
            <TabAywebsPawIcon color={AYWEBS_WORDMARK_TINT[theme.mode]} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sonim"
        options={{
          title: t('tabs.sonim'),
          tabBarLabel: label(t('tabs.sonim')),
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
          tabBarLabel: label(t('tabs.account')),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabProfileIcon color={color} focused={focused} />
          ),
        }}
      />
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
