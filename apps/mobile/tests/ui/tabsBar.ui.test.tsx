/**
 * Barre de navigation principale — correction officielle (29/10/2026) :
 * - Surface pleine opaque (`TAB_BAR_SURFACE`), zéro translucidité
 * - Posée bord à bord tout en bas de l'écran (`bottom: 0`, aucun espace sous la barre)
 * - 5 icônes vectorielles à trait fin de la même famille (`TabHomeIcon`, `TabLensIcon`,
 *   `TabAyWebsIcon` patte violette `#571EF6`, `TabSonimIcon`, `TabProfileIcon`) `24 × 24` pt
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabsLayout from '../../app/(tabs)/_layout';
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
const mockCapturedScreens: Array<{ name: string; options: Record<string, unknown> }> = [];

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
  }: {
    name: string;
    options: Record<string, unknown>;
  }) {
    mockCapturedScreens.push({ name, options });
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
  };
});

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
  it('applique une surface pleine opaque collée tout en bas (zéro espace dessous) et 5 icônes 24×24 de la même famille', () => {
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
      'aywebs',
      'sonim',
      'account',
      'cart',
    ]);
    for (const tabName of ['index', 'lens', 'aywebs', 'sonim', 'account']) {
      const entry = mockCapturedScreens.find((s) => s.name === tabName);
      const iconSlot = entry?.options.tabBarIconStyle as { width: number; height: number };
      expect(iconSlot.width).toBe(24);
      expect(iconSlot.height).toBe(24);
    }

    const aywebsEntry = mockCapturedScreens.find((s) => s.name === 'aywebs');
    expect(aywebsEntry?.options.tabBarShowLabel).toBe(false);
    const aywebsIconFn = aywebsEntry?.options.tabBarIcon as (p: {
      color: string;
      focused: boolean;
      size: number;
    }) => React.ReactElement<{ color?: string }>;
    const aywebsIconEl = aywebsIconFn({ color: '#0A0A0A', focused: false, size: 24 });
    expect(aywebsIconEl.props.color).toBe(AYWEBS_WORDMARK_TINT.light);

    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('#E5E5E5');
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
