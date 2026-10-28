/**
 * Barre de navigation principale (style Zalando) :
 * - Coins arrondis réduits (`theme.radius.md` = 12pt) et haute transparence (`TAB_BAR_GLASS`, alpha 0.58)
 * - Zéro élévation Android (`elevation: 0`) pour supprimer l'ombre rectangulaire interne
 * - Icônes vectorielles officielles intégrées (`TabHomeIcon`, `TabLensIcon`, `TabSonimIcon`, `TabProfileIcon`)
 *   de dimensions strictement égales (`24 × 24` pt) + médaillon central `AYWEBs` `24 × 24` sans fond gris
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabsLayout from '../../app/(tabs)/_layout';
import {
  TabHomeIcon,
  TabLensIcon,
  TabProfileIcon,
  TabSonimIcon,
} from '@/design/TabNavIcons';
import { ThemeProvider } from '@/design/theme';
import { TAB_BAR_GLASS } from '@/design/tokens.mobile';
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
    const bgRenderer = screenOptions?.tabBarBackground as (() => React.ReactNode) | undefined;
    return ReactActual.createElement(
      RNView,
      { testID: 'mock-tabs-root' },
      bgRenderer ? bgRenderer() : null,
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

describe('TabsLayout — barre flottante transparente style Zalando & icônes vectorielles égales', () => {
  it('applique un rayon réduit (12pt), une transparence élevée sans élévation Android et 5 icônes 24×24 sans fond gris', () => {
    const tree = renderTabsBar();
    expect(mockCapturedScreenOptions).not.toBeNull();

    const tabBarStyle = mockCapturedScreenOptions?.tabBarStyle as Record<string, unknown>;
    expect(tabBarStyle.position).toBe('absolute');
    expect(tabBarStyle.borderRadius).toBe(12);
    expect(tabBarStyle.elevation).toBe(0);
    expect(tabBarStyle.backgroundColor).toBe('transparent');
    expect(tabBarStyle.paddingBottom).toBe(0);

    const bgRenderer = mockCapturedScreenOptions?.tabBarBackground as () => React.ReactElement<{
      style: import('react-native').StyleProp<import('react-native').ViewStyle>;
    }>;
    const bgElement = bgRenderer();
    const flatBg = StyleSheet.flatten(bgElement.props.style);
    expect(flatBg.backgroundColor).toBe(TAB_BAR_GLASS.light.background);
    expect(flatBg.borderRadius).toBe(12);

    // Ordre des onglets et tailles d'emplacements 24×24 sur les 5 onglets visibles
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

    // L'icône centrale AYWEBs ne peint aucune plaque grise derrière le cercle violet
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('#E5E5E5');
  });

  it('rend les 4 icônes vectorielles intégrées sur une boîte 24×24 identique', () => {
    const { toJSON } = render(
      <View>
        <TabHomeIcon color="#0A0A0A" size={24} />
        <TabLensIcon color="#0A0A0A" size={24} />
        <TabSonimIcon color="#0A0A0A" size={24} focused />
        <TabProfileIcon color="#0A0A0A" size={24} />
      </View>,
    );
    const root = toJSON() as { children?: Array<{ props?: Record<string, unknown> }> };
    expect(root.children).toHaveLength(4);
    for (const svgNode of root.children ?? []) {
      expect(svgNode.props?.width).toBe(24);
      expect(svgNode.props?.height).toBe(24);
    }
  });
});
