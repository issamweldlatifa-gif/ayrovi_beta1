import { describe, expect, test } from 'vitest';
import {
  DEFAULT_INTERFACE_CONFIG, INTERFACE_FONT_PRESETS, INTERFACE_ICON_LIBRARIES, normalizeInterfaceConfig,
} from '../client/src/config/interfaceConfig';

describe('واجهتي full interface configuration', () => {
  test('locks the 70/25/5 AYROVI palette on public defaults', () => {
    expect(DEFAULT_INTERFACE_CONFIG.colors).toMatchObject({
      pageBackground: '#ffffff',
      primary: '#111318',
      accent: '#fe7003',
      announcementBackground: '#111318',
      announcementText: '#ffffff',
      heroBackground: '#111318',
    });
    expect(DEFAULT_INTERFACE_CONFIG.icons.activeColor).toBe('#fe7003');
    expect(DEFAULT_INTERFACE_CONFIG.navigation).toMatchObject({ background: '#ffffff', color: '#111318' });
    expect(DEFAULT_INTERFACE_CONFIG.buttons.background).toBe('#111318');
  });

  test('uses a single Inter / Noto Sans Arabic stack on the default preset', () => {
    expect(DEFAULT_INTERFACE_CONFIG.typography.display).toContain('Inter');
    expect(DEFAULT_INTERFACE_CONFIG.typography.body).toContain('Noto Sans Arabic');
    expect(DEFAULT_INTERFACE_CONFIG.typography.display).toBe(DEFAULT_INTERFACE_CONFIG.typography.body);
    expect(INTERFACE_FONT_PRESETS[0].display).not.toContain('Plus Jakarta');
  });

  test('publishes exactly five font presets and the single AYROVI icon system', () => {
    expect(INTERFACE_FONT_PRESETS).toHaveLength(5);
    expect(new Set(INTERFACE_FONT_PRESETS.map((preset) => preset.id)).size).toBe(5);
    expect(INTERFACE_FONT_PRESETS.every((preset) => preset.body && preset.display)).toBe(true);
    // Un seul système d'icônes : le système maison (lucide et les bibliothèques de comparaison ont été retirés).
    expect(INTERFACE_ICON_LIBRARIES.map((library) => library.id)).toEqual(['ayrovi']);
  });

  test('upgrades a legacy واجهتي payload without losing its content', () => {
    const legacy = {
      logoUrl: '/media/logo-ayrovi.png',
      sections: DEFAULT_INTERFACE_CONFIG.sections.map(({ id, visible, order, title, subtitle, image }) => ({ id, visible, order, title, subtitle, image })),
      typography: { body: DEFAULT_INTERFACE_CONFIG.typography.body, display: DEFAULT_INTERFACE_CONFIG.typography.display, baseSize: 17, align: 'center', headingColor: '#112233', textColor: '#445566' },
      buttons: { background: '#123456', color: '#ffffff', radius: 8, height: 46, shape: 'soft' },
      icons: { library: 'lucide', color: '#654321', size: 22, style: 'outline' },
      navigation: { background: '#111111', color: '#eeeeee', activeBackground: '#333333', showLabels: true, height: 72, lensLabel: 'Photo', aiLabel: 'AI', visionLabel: 'Vision' },
      slider: DEFAULT_INTERFACE_CONFIG.slider,
      layout: { sectionGap: 24, maxWidth: 1320 },
    };
    const normalized = normalizeInterfaceConfig(legacy);
    expect(normalized.sections.map((section) => section.id)).toEqual(['hero', 'cms', 'brands', 'about', 'footer']);
    expect(normalized.typography.baseSize).toBe(17);
    expect(normalized.typography.headingColor).toBe('#112233');
    expect(normalized.colors.pageBackground).toBe('#ffffff');
    expect(normalized.buttons.secondaryColor).toBe('#111318');
    // Les anciennes valeurs de bibliothèque (lucide…) sont recentrées sur le système AYROVI.
    expect(normalized.icons).toMatchObject({ library: 'ayrovi', color: '#654321', activeColor: '#fe7003' });
    expect(normalized.layout).toMatchObject({ sectionGap: 24, maxWidth: 1320, cardRadius: 16, shadow: 'soft' });
  });

  test('accepts HEX controls and clamps unsafe or out-of-range values', () => {
    const input = structuredClone(DEFAULT_INTERFACE_CONFIG);
    input.colors.pageBackground = '#ABCDEF';
    input.colors.primary = 'red';
    input.typography.baseSize = 100;
    input.typography.lineHeight = 0;
    input.icons.library = 'material' as never; // valeur legacy stockée en base
    input.icons.size = 99;
    input.layout.cardRadius = 99;
    input.sections[0].paddingY = 999;
    const normalized = normalizeInterfaceConfig(input);
    expect(normalized.colors.pageBackground).toBe('#abcdef');
    expect(normalized.colors.primary).toBe(DEFAULT_INTERFACE_CONFIG.colors.primary);
    expect(normalized.typography.baseSize).toBe(22);
    expect(normalized.typography.lineHeight).toBe(1.2);
    expect(normalized.icons).toMatchObject({ library: 'ayrovi', size: 44 });
    expect(normalized.layout.cardRadius).toBe(48);
    expect(normalized.sections[0].paddingY).toBe(160);
  });
});
