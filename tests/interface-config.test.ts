import { describe, expect, test } from 'vitest';
import {
  DEFAULT_INTERFACE_CONFIG, INTERFACE_FONT_PRESETS, INTERFACE_ICON_LIBRARIES, normalizeInterfaceConfig,
} from '../client/src/config/interfaceConfig';

describe('واجهتي full interface configuration', () => {
  test('locks the official ZAYROVI palette (white / black / electric violet) on public defaults', () => {
    expect(DEFAULT_INTERFACE_CONFIG.colors).toMatchObject({
      pageBackground: '#ffffff',
      primary: '#000000',
      accent: '#571ef6',
      announcementBackground: '#000000',
      announcementText: '#ffffff',
      heroBackground: '#000000',
    });
    expect(DEFAULT_INTERFACE_CONFIG.icons.activeColor).toBe('#571ef6');
    // la section « annonce » (masquée par défaut) n'est plus un aplat orange : noir officiel
    expect(DEFAULT_INTERFACE_CONFIG.sections.find((section) => section.id === 'announcement')?.backgroundColor).toBe('#0a0a0a');
    expect(DEFAULT_INTERFACE_CONFIG.navigation).toMatchObject({ background: '#ffffff', color: '#000000' });
    expect(DEFAULT_INTERFACE_CONFIG.buttons.background).toBe('#000000');
  });

  test('uses a single Zalando Sans / Noto Sans Arabic stack on the default preset', () => {
    expect(DEFAULT_INTERFACE_CONFIG.typography.display).toContain('Zalando Sans');
    expect(DEFAULT_INTERFACE_CONFIG.typography.body).toContain('Noto Sans Arabic');
    expect(DEFAULT_INTERFACE_CONFIG.typography.display).toBe(DEFAULT_INTERFACE_CONFIG.typography.body);
    expect(INTERFACE_FONT_PRESETS[0].display).not.toContain('Plus Jakarta');
  });

  test('publishes one locked font preset and the single ZAYROVI icon system', () => {
    expect(INTERFACE_FONT_PRESETS).toHaveLength(1);
    expect(new Set(INTERFACE_FONT_PRESETS.map((preset) => preset.id)).size).toBe(1);
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
      navigation: { background: '#000000', color: '#eeeeee', activeBackground: '#333333', showLabels: true, height: 72, lensLabel: 'Photo', aiLabel: 'AI', visionLabel: 'Vision' },
      slider: DEFAULT_INTERFACE_CONFIG.slider,
      layout: { sectionGap: 24, maxWidth: 1320 },
    };
    const normalized = normalizeInterfaceConfig(legacy);
    expect(normalized.sections.map((section) => section.id)).toEqual(['hero', 'cms', 'brands', 'about', 'footer', 'announcement']);
    expect(normalized.typography.baseSize).toBe(17);
    expect(normalized.typography.headingColor).toBe('#0a0a0a');
    expect(normalized.colors.pageBackground).toBe('#ffffff');
    expect(normalized.buttons.secondaryColor).toBe('#000000');
    // Les anciennes valeurs de bibliothèque (lucide…) sont recentrées sur le système ZAYROVI.
    expect(normalized.icons).toMatchObject({ library: 'ayrovi', color: '#654321', activeColor: '#571ef6' });
    expect(normalized.layout).toMatchObject({ sectionGap: 24, maxWidth: 1320, cardRadius: 16, shadow: 'soft' });
  });

  test('reads the retired brand oranges as the official violet, and keeps any other admin colour', () => {
    for (const orange of ['#ff6900', '#FF7900', '#fe7003', '#ff7a00']) {
      const normalized = normalizeInterfaceConfig({ colors: { accent: orange }, icons: { activeColor: orange },
        sections: [{ id: 'announcement', visible: true, backgroundColor: orange, textColor: '#ffffff' }] });
      expect(normalized.colors.accent).toBe('#571ef6');
      expect(normalized.icons.activeColor).toBe('#571ef6');
      // une grande surface n'est jamais violette : l'ancien bandeau orange devient noir
      expect(normalized.sections.find((section) => section.id === 'announcement')?.backgroundColor).toBe('#0a0a0a');
    }
    const custom = normalizeInterfaceConfig({ colors: { accent: '#123456' }, icons: { activeColor: '#2e7d32' } });
    expect(custom.colors.accent).toBe('#123456');
    expect(custom.icons.activeColor).toBe('#2e7d32');
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
    expect(normalized.colors.pageBackground).toBe('#ffffff');
    // `primary` appartient à l'identité (enforceBrandIdentity) : c'est l'encre officielle, pas la valeur CMS.
    expect(normalized.colors.primary).toBe('#0a0a0a');
    expect(normalized.typography.baseSize).toBe(22);
    expect(normalized.typography.lineHeight).toBe(1.2);
    expect(normalized.icons).toMatchObject({ library: 'ayrovi', size: 44 });
    expect(normalized.layout.cardRadius).toBe(48);
    expect(normalized.sections[0].paddingY).toBe(160);
  });

  test('annonce : masquée par défaut, cible interne seulement, média image ou vidéo validé', () => {
    const base = normalizeInterfaceConfig(undefined);
    const defaultAnnouncement = base.sections.find((section) => section.id === 'announcement');
    expect(defaultAnnouncement).toMatchObject({ visible: false, mediaType: 'image', ctaTarget: 'app:lens' });

    const input = structuredClone(DEFAULT_INTERFACE_CONFIG) as any;
    input.sections = input.sections.map((section: any) => section.id === 'announcement'
      ? { ...section, visible: true, mediaType: 'video', videoUrl: '/uploads/clip.mp4', image: 'javascript:alert(1)', ctaLabel: 'Voir', ctaTarget: 'https://evil.example' }
      : section);
    const hostile = normalizeInterfaceConfig(input).sections.find((section) => section.id === 'announcement');
    expect(hostile).toMatchObject({ visible: true, mediaType: 'video', videoUrl: '/uploads/clip.mp4', image: '', ctaLabel: 'Voir', ctaTarget: '' });

    input.sections = input.sections.map((section: any) => section.id === 'announcement' ? { ...section, ctaTarget: '/magazine', videoUrl: 'data:text/html,x' } : section);
    const internal = normalizeInterfaceConfig(input).sections.find((section) => section.id === 'announcement');
    expect(internal).toMatchObject({ ctaTarget: '/magazine', videoUrl: '' });
  });
});
