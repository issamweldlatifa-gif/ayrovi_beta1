/**
 * Barre d'onglets principale — capsule flottante transparente à angles arrondis.
 *
 * Ordre imposé par le propriétaire :
 *   `Accueil` · `Lens` · `AYWEBs` · `Sonim` · `Profil`
 *
 *   • `AYWEBs` occupe le médaillon central avec son icône circulaire officielle
 *     (`#571EF6` en clair, `#FFFFFF` en sombre) sans libellé texte dessous ;
 *   • `Lens` et `Sonim` portent leurs pictogrammes dédiés teintés selon l'état
 *     actif/inactif du thème ;
 *   • `cart` reste une route valide (`href: null`) pour l'icône panier de `AppHeader`.
 */
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppImage } from '@/design/appImage';
import { revealChrome, useChromeHidden } from '@/design/chrome';
import { useTheme } from '@/design/theme';
import { AYWEBS_WORDMARK_TINT, TAB_BAR_GLASS } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

const AYWEB_LOGO_LIGHT = require('../../assets/aywebs/aywebs-icon-violet.png');
const AYWEB_LOGO_DARK = require('../../assets/aywebs/aywebs-icon-white.png');
const LENS_TAB_ICON = require('../../assets/tab-lens-icon.png');
const SONIM_TAB_ICON = require('../../assets/tab-sonim-icon.png');

/** Ratio 1:1 exact de l'icône circulaire AYWEBs (`256×256`), sans texte dessous. */
const AYWEB_TAB_LOGO = { width: 32, height: 32 } as const;
const CUSTOM_TAB_ICON = { width: 24, height: 24 } as const;

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const chromeHidden = useChromeHidden();
  const glass = TAB_BAR_GLASS[theme.mode];

  return (
    <Tabs
      screenListeners={{
        tabPress: () => revealChrome(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accentText,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: {
          ...theme.text('caption', 'semibold'),
          marginTop: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarStyle: chromeHidden
          ? { display: 'none' }
          : {
              position: 'absolute',
              left: theme.space[2],
              right: theme.space[2],
              bottom: Math.max(insets.bottom, theme.space[1]),
              height: theme.chrome.tabBar + theme.space[0],
              paddingHorizontal: theme.space[1],
              paddingTop: 2,
              paddingBottom: 4,
              borderRadius: theme.radius.xl,
              backgroundColor: glass.background,
              borderTopWidth: 1,
              borderWidth: 1,
              borderTopColor: glass.border,
              borderColor: glass.border,
              ...theme.elevation.medium,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="home-outline"
              size={theme.iconSize.md}
              color={color}
              accessibilityElementsHidden
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lens"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            revealChrome();
            router.push('/lens');
          },
        }}
        options={{
          title: t('tabs.lens'),
          lazy: true,
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color }) => (
          <AppImage
            localSource={LENS_TAB_ICON}
            style={CUSTOM_TAB_ICON}
            contentFit="contain"
            tintColor={typeof color === 'string' ? color : undefined}
            decorative
          />
        ),
      }}
    />
      <Tabs.Screen
        name="aywebs"
        options={{
          title: t('tabs.aywebs'),
          tabBarShowLabel: false,
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <AppImage
              localSource={theme.mode === 'dark' ? AYWEB_LOGO_DARK : AYWEB_LOGO_LIGHT}
              style={AYWEB_TAB_LOGO}
              contentFit="contain"
              tintColor={AYWEBS_WORDMARK_TINT[theme.mode]}
              decorative
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sonim"
        options={{
          title: t('tabs.sonim'),
          tabBarIcon: ({ color }) => (
            <AppImage
              localSource={SONIM_TAB_ICON}
              style={CUSTOM_TAB_ICON}
              contentFit="contain"
              tintColor={typeof color === 'string' ? color : undefined}
              decorative
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account'),
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="person-outline"
              size={theme.iconSize.md}
              color={color}
              accessibilityElementsHidden
            />
          ),
        }}
      />
      <Tabs.Screen name="cart" options={{ href: null, title: t('tabs.cart') }} />
    </Tabs>
  );
}
