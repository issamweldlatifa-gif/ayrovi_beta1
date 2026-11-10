/**
 * Barre de navigation principale — correction officielle (29/10/2026) :
 * - Surface pleine opaque (`TAB_BAR_SURFACE`), zéro translucidité
 * - Posée bord à bord tout en bas de l'écran (`bottom: 0`, aucun espace sous la barre)
 * - 5 icônes vectorielles à trait fin de la même famille (`TabHomeIcon`, `TabLensIcon`,
 *   `TabAyWebsIcon` recherche monochrome, `TabSonimIcon` (Clean), `TabProfileIcon`) `24 × 24` pt
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import TabsLayout from '../../app/(tabs)/_layout';
import { registerScrollToTopHandler } from '../../src/features/shell/scrollToTop';
import {
  TabAyWebsIcon,
  TabHomeIcon,
  TabLensIcon,
  TabProfileIcon,
  TabSonimIcon,
} from '@/design/TabNavIcons';
import { ThemeProvider } from '@/design/theme';
import { AYWEBS_WORDMARK_TINT, TAB_BAR_SURFACE } from '@/design/tokens.mobile';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

let mockCapturedScreenOptions: Record<string, unknown> | null = null;
const mockCapturedScreens: Array<{ name: string; options: Record<string, unknown>; listeners: Record<string, unknown> | null }> = [];
/** Chemin courant simulé : le layout s'en sert pour distinguer re-tap et navigation. */
let mockPathname = '/';

jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  function MockTabs({
    screenOptions,
    children,
  }: {
    screenOptions: Record<string, unknown>;
    children: React.ReactNode;
  }) {
    mockCapturedScreenOptions = screenOptions;
    mockCapturedScreens.length = 0;
    return ReactActual.createElement(
      RNView,
      { testID: 'mock-tabs-root' },
      children,
    );
  }
  MockTabs.Screen = function MockTabScreen({
    name,
    options,
    listeners,
  }: {
    name: string;
    options: Record<string, unknown>;
    listeners?: Record<string, unknown> | null;
  }) {
    mockCapturedScreens.push({ name, options, listeners: listeners ?? null });
    const iconRenderer = options?.tabBarIcon as
      | ((mockProps: { color: string; focused: boolean; size: number }) => unknown)
      | undefined;
    return ReactActual.createElement(
      RNView,
      { testID: `mock-tab-${name}` },
      iconRenderer ? iconRenderer({ color: '#0A0A0A', focused: name === 'sonim', size: 24 }) : null,
    );
  };
  return {
    Tabs: MockTabs,
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    usePathname: () => mockPathname,
  };
});

jest.mock('../../src/state/session', () => ({
  useSession: () => ({ status: (globalThis as any).__testSessionStatus ?? 'signedOut' }),
}));

function renderTabsBar() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 44, left: 0, right: 0, bottom: 16 },
      }}
    >
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <TabsLayout />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>,
  );
}

describe('TabsLayout — barre inférieure pleine, affleurante en bas et famille d’icônes unifiée', () => {
  it('applique une surface pleine opaque collée tout en bas (zéro espace dessous) et 5 icônes 28×28 de la même famille', () => {
    const tree = renderTabsBar();
    expect(mockCapturedScreenOptions).not.toBeNull();

    const tabBarStyle = mockCapturedScreenOptions?.tabBarStyle as Record<string, unknown>;
    expect(tabBarStyle.position).toBeUndefined();
    expect(tabBarStyle.backgroundColor).toBe(TAB_BAR_SURFACE.light.background);
    expect(tabBarStyle.borderTopColor).toBe(TAB_BAR_SURFACE.light.border);
    expect(tabBarStyle.borderTopWidth).toBe(StyleSheet.hairlineWidth);
    expect(tabBarStyle.elevation).toBe(0);
    expect(tabBarStyle.paddingBottom).toBe(16);

    expect(mockCapturedScreens.map((s) => s.name)).toEqual([
      'index',
      'lens',
      'sonim',
      'aywebs',
      'account',
      'social',
      'cart',
    ]);
    for (const tabName of ['index', 'lens', 'sonim', 'aywebs', 'account']) {
      const entry = mockCapturedScreens.find((s) => s.name === tabName);
      const iconSlot = entry?.options.tabBarIconStyle as { width: number; height: number };
      expect(iconSlot.width).toBe(28);
      expect(iconSlot.height).toBe(28);
    }

    expect(mockCapturedScreenOptions?.tabBarShowLabel).toBe(false);
    expect(mockCapturedScreens.find(s => s.name === 'social')?.options.href).toBeNull();
    expect(mockCapturedScreens.filter(s => s.options.href !== null)).toHaveLength(5);
    for (const name of ['index', 'lens', 'sonim', 'aywebs', 'account']) {
      expect(mockCapturedScreens.find(s => s.name === name)?.options.tabBarAccessibilityLabel).toBeTruthy();
    }
    const aywebsEntry = mockCapturedScreens.find((s) => s.name === 'aywebs');
    expect(aywebsEntry?.options.tabBarShowLabel).toBe(false);
    const aywebsIconFn = aywebsEntry?.options.tabBarIcon as (p: {
      color: string;
      focused: boolean;
      size: number;
    }) => React.ReactElement<{ color?: string }>;
    const aywebsIconEl = aywebsIconFn({ color: '#0A0A0A', focused: false, size: 24 });
    expect(aywebsIconEl.props.color).toBe('#0A0A0A');

    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('#E5E5E5');
  });

  it('re-tap sur l’Accueil déjà actif : remonte la page en haut (référence Zalando), sans re-navigation', () => {
    jest.clearAllMocks();
    mockPathname = '/';
    renderTabsBar();
    const scrollToTop = jest.fn();
    registerScrollToTopHandler(scrollToTop);
    const event = { preventDefault: jest.fn() };
    const listeners = mockCapturedScreens.find((s) => s.name === 'index')?.listeners as {
      tabPress: (event: { preventDefault: jest.Mock }) => void;
    };
    listeners.tabPress(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(scrollToTop).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    registerScrollToTopHandler(null);
    // Premier tap depuis une autre page : navigation normale, aucun intercepteur.
    mockPathname = '/catalog';
    renderTabsBar();
    const fresh = mockCapturedScreens.find((s) => s.name === 'index')?.listeners as {
      tabPress: (event: { preventDefault: jest.Mock }) => void;
    };
    const second = { preventDefault: jest.fn() };
    fresh.tabPress(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(scrollToTop).toHaveBeenCalledTimes(1);
  });

  it('Profil non connecté : ouvre DIRECTEMENT la connexion (plus d’étape intermédiaire)', () => {
    jest.clearAllMocks();
    (globalThis as any).__testSessionStatus = 'signedOut';
    mockPathname = '/';
    renderTabsBar();
    const event = { preventDefault: jest.fn() };
    const listeners = mockCapturedScreens.find((s) => s.name === 'account')?.listeners as {
      tabPress: (event: { preventDefault: jest.Mock }) => void;
    };
    listeners.tabPress(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/sign-in');
    // Le moudal connexion déjà ouvert : aucun empilement supplémentaire.
    mockPathname = '/sign-in';
    (router.push as jest.Mock).mockClear();
    renderTabsBar();
    const reopened = mockCapturedScreens.find((s) => s.name === 'account')?.listeners as {
      tabPress: (event: { preventDefault: jest.Mock }) => void;
    };
    reopened.tabPress({ preventDefault: jest.fn() });
    expect(router.push).not.toHaveBeenCalled();
    (globalThis as any).__testSessionStatus = undefined;
  });

  it('Profil connecté : navigation normale vers la page compte', () => {
    jest.clearAllMocks();
    (globalThis as any).__testSessionStatus = 'signedIn';
    mockPathname = '/';
    renderTabsBar();
    const event = { preventDefault: jest.fn() };
    const listeners = mockCapturedScreens.find((s) => s.name === 'account')?.listeners as {
      tabPress: (event: { preventDefault: jest.Mock }) => void;
    };
    listeners.tabPress(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    (globalThis as any).__testSessionStatus = undefined;
  });

  it('rend les 5 icônes vectorielles à trait fin sur une boîte 24×24 identique', () => {
    const { toJSON } = render(
      <PrefsProvider>
        <ThemeProvider>
          <View>
            <TabHomeIcon color="#0A0A0A" size={24} />
            <TabLensIcon color="#0A0A0A" size={24} />
            <TabAyWebsIcon color={AYWEBS_WORDMARK_TINT.light} size={24} />
            <TabSonimIcon color="#0A0A0A" size={24} focused />
            <TabProfileIcon color="#0A0A0A" size={24} />
          </View>
        </ThemeProvider>
      </PrefsProvider>,
    );
    const root = toJSON() as { children?: Array<{ props?: { style?: { width?: number; height?: number } } }> };
    expect(root.children).toHaveLength(5);
    for (const slot of root.children ?? []) {
      expect(slot.props?.style?.width).toBe(24);
      expect(slot.props?.style?.height).toBe(24);
    }
  });
});
