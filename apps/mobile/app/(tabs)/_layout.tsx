/**
 * Barre d'onglets principale — 5 destinations visibles dans une barre flottante
 * translucide à coins arrondis compacts (style Zalando) :
 *
 *   `Accueil` · `Lens` · `AYWEBs` · `Sonim` · `Profil`
 *
 *   • Verre haute transparence (`TAB_BAR_GLASS`) rendu via `tabBarBackground`
 *     avec `elevation: 0` (`theme.elevation.none`) pour éliminer le cône d'ombre
 *     interne d'Android sur les surfaces translucides.
 *   • Icônes vectorielles officielles intégrées (`TabNavIcons`, grille unique
 *     `24 × 24` et épaisseur de trait uniforme) et médaillon central `AYWEBs`
 *     `24 × 24` sans plaque grise (`background={null}`), centré verticalement.
 *   • `cart` reste une route valide (`href: null`) pour l'icône panier de `AppHeader`.
 */
import { StyleSheet, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppImage } from '@/design/appImage';
import { revealChrome, useChromeHidden } from '@/design/chrome';
import {
  TabHomeIcon,
  TabLensIcon,
  TabProfileIcon,
  TabSonimIcon,
} from '@/design/TabNavIcons';
import { useTheme } from '@/design/theme';
import { AYWEBS_WORDMARK_TINT, TAB_BAR_GLASS } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

const AYWEB_LOGO_LIGHT = require('../../assets/aywebs/aywebs-icon-violet.png');
const AYWEB_LOGO_DARK = require('../../assets/aywebs/aywebs-icon-white.png');

/** Ratio 1:1 exact aligné sur `theme.iconSize.md` (`24 × 24`), sans texte dessous. */
const AYWEB_TAB_LOGO = { width: 24, height: 24 } as const;

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const chromeHidden = useChromeHidden();
  const glass = TAB_BAR_GLASS[theme.mode];

  const barHeight = theme.chrome.tabBar - theme.space[0];
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
        tabBarItemStyle: styles.tabItem,
        tabBarBackground: () => (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: glass.background,
                borderRadius: theme.radius.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: glass.border,
              },
            ]}
          />
        ),
        tabBarStyle: chromeHidden
          ? { display: 'none' }
          : {
              position: 'absolute',
              left: theme.space[2],
              right: theme.space[2],
              bottom: Math.max(insets.bottom, theme.space[1]),
              height: barHeight,
              paddingTop: 0,
              paddingBottom: 0,
              paddingHorizontal: theme.space[0],
              borderRadius: theme.radius.md,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              borderTopColor: 'transparent',
              ...theme.elevation.none,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabHomeIcon size={theme.iconSize.md} color={color} focused={focused} />
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
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabLensIcon size={theme.iconSize.md} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="aywebs"
        options={{
          title: t('tabs.aywebs'),
          tabBarAccessibilityLabel: t('tabs.aywebs'),
          tabBarShowLabel: false,
          tabBarLabel: () => null,
          tabBarIconStyle: centerIconSlot,
          tabBarIcon: () => (
            <AppImage
              localSource={theme.mode === 'dark' ? AYWEB_LOGO_DARK : AYWEB_LOGO_LIGHT}
              style={AYWEB_TAB_LOGO}
              contentFit="contain"
              tintColor={AYWEBS_WORDMARK_TINT[theme.mode]}
              background={null}
              decorative
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sonim"
        options={{
          title: t('tabs.sonim'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabSonimIcon size={theme.iconSize.md} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account'),
          tabBarIconStyle: standardIconSlot,
          tabBarIcon: ({ color, focused }) => (
            <TabProfileIcon size={theme.iconSize.md} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="cart" options={{ href: null, title: t('tabs.cart') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    paddingVertical: 0,
  },
});
