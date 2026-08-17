export const PUBLIC_SECTION_IDS = ['hero', 'cms', 'brands', 'about', 'footer'] as const;
export type PublicSectionId = (typeof PUBLIC_SECTION_IDS)[number];

export const INTERFACE_FONT_PRESETS = [
  {
    id: 'ayrovi-modern',
    label: 'AYROVI Modern',
    description: 'Titres affirmés et contenu très lisible.',
    display: "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif",
    body: "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  {
    id: 'system-clean',
    label: 'System Clean',
    description: 'Rapide, neutre et optimisé sur tous les appareils.',
    display: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    body: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  {
    id: 'tunis-arabic',
    label: 'Tunis Arabic',
    description: 'Tahoma assure une lecture équilibrée en arabe et en français.',
    display: "Tahoma, Arial, 'Segoe UI', sans-serif",
    body: "Tahoma, Arial, 'Segoe UI', sans-serif",
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Titres élégants avec un contenu sans-serif classique.',
    display: "Georgia, 'Times New Roman', serif",
    body: "Arial, Helvetica, sans-serif",
  },
  {
    id: 'friendly',
    label: 'Friendly Rounded',
    description: 'Trebuchet donne une personnalité accessible et dynamique.',
    display: "'Trebuchet MS', 'Segoe UI', sans-serif",
    body: "'Trebuchet MS', Arial, sans-serif",
  },
] as const;
export type InterfaceFontPresetId = (typeof INTERFACE_FONT_PRESETS)[number]['id'];

export const INTERFACE_ICON_LIBRARIES = [
  { id: 'ayrovi', label: 'AYROVI', description: 'Pictogrammes maison' },
  { id: 'lucide', label: 'Lucide', description: 'Contour universel' },
  { id: 'fontawesome', label: 'Font Awesome', description: 'Dense et reconnaissable' },
  { id: 'bootstrap', label: 'Bootstrap', description: 'Simple et produit' },
  { id: 'material', label: 'Material', description: 'Géométrique et affirmé' },
] as const;
export type InterfaceIconLibrary = (typeof INTERFACE_ICON_LIBRARIES)[number]['id'];

export interface InterfaceSectionConfig {
  id: PublicSectionId;
  visible: boolean;
  order: number;
  title: string;
  subtitle: string;
  image: string;
  backgroundColor: string;
  textColor: string;
  paddingY: number;
  contained: boolean;
}

export interface PublicInterfaceConfig {
  logoUrl: string;
  sections: InterfaceSectionConfig[];
  typography: {
    preset: InterfaceFontPresetId;
    body: string;
    display: string;
    baseSize: number;
    align: 'start' | 'center' | 'end';
    headingColor: string;
    textColor: string;
    lineHeight: number;
    letterSpacing: number;
    headingScale: number;
  };
  colors: {
    pageBackground: string;
    surfaceBackground: string;
    surfaceAlt: string;
    borderColor: string;
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    headerBackground: string;
    headerText: string;
    announcementBackground: string;
    announcementText: string;
    heroBackground: string;
    heroText: string;
    footerBackground: string;
    footerText: string;
    success: string;
    warning: string;
    danger: string;
  };
  buttons: {
    background: string;
    color: string;
    secondaryBackground: string;
    secondaryColor: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
    height: number;
    shape: 'soft' | 'pill' | 'square';
  };
  icons: {
    library: InterfaceIconLibrary;
    color: string;
    activeColor: string;
    size: number;
    style: 'outline' | 'solid';
  };
  navigation: {
    background: string;
    color: string;
    activeBackground: string;
    showLabels: boolean;
    height: number;
    lensLabel: string;
    aiLabel: string;
    visionLabel: string;
  };
  slider: {
    autoplay: boolean;
    duration: number;
    transition: number;
    showArrows: boolean;
    showDots: boolean;
  };
  layout: {
    sectionGap: number;
    maxWidth: number;
    pagePadding: number;
    cardRadius: number;
    cardBorderWidth: number;
    shadow: 'none' | 'soft' | 'strong';
  };
}

export const DEFAULT_INTERFACE_CONFIG: PublicInterfaceConfig = {
  logoUrl: '/media/logo-ayrovi.png',
  sections: [
    { id: 'hero', visible: true, order: 10, title: 'Toute la mode du monde, livrée chez vous.', subtitle: '', image: '', backgroundColor: '#24104f', textColor: '#ffffff', paddingY: 0, contained: false },
    { id: 'cms', visible: true, order: 20, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
    { id: 'brands', visible: true, order: 30, title: '', subtitle: '', image: '', backgroundColor: '#f8f9fe', textColor: '#1d2130', paddingY: 0, contained: false },
    { id: 'about', visible: true, order: 40, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
    { id: 'footer', visible: true, order: 50, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
  ],
  typography: {
    preset: 'ayrovi-modern',
    body: INTERFACE_FONT_PRESETS[0].body,
    display: INTERFACE_FONT_PRESETS[0].display,
    baseSize: 16,
    align: 'start',
    headingColor: '#1d2130',
    textColor: '#6b7280',
    lineHeight: 1.6,
    letterSpacing: -0.02,
    headingScale: 1,
  },
  colors: {
    pageBackground: '#ffffff',
    surfaceBackground: '#ffffff',
    surfaceAlt: '#f8f9fe',
    borderColor: '#e2e8f0',
    primary: '#673de6',
    primaryDark: '#5025d1',
    primaryLight: '#7e57ff',
    accent: '#fbbf24',
    headerBackground: '#ffffff',
    headerText: '#1d2130',
    announcementBackground: '#fbbf24',
    announcementText: '#1d2130',
    heroBackground: '#24104f',
    heroText: '#ffffff',
    footerBackground: '#ffffff',
    footerText: '#1d2130',
    success: '#15803d',
    warning: '#b77900',
    danger: '#dc2626',
  },
  buttons: {
    background: '#24104f', color: '#ffffff', secondaryBackground: '#ffffff', secondaryColor: '#5025d1',
    borderColor: '#673de6', borderWidth: 1, radius: 12, height: 44, shape: 'soft',
  },
  icons: { library: 'ayrovi', color: '#673de6', activeColor: '#fbbf24', size: 20, style: 'outline' },
  navigation: {
    background: '#17151f', color: '#ffffff', activeBackground: '#673de6', showLabels: true, height: 72,
    lensLabel: 'Lens', aiLabel: 'AI', visionLabel: 'Vision',
  },
  slider: { autoplay: true, duration: 5200, transition: 1200, showArrows: true, showDots: true },
  layout: { sectionGap: 0, maxWidth: 1280, pagePadding: 16, cardRadius: 16, cardBorderWidth: 1, shadow: 'soft' },
};

const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
const safeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const safeText = (value: unknown, fallback = '', max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const safeMedia = (value: unknown) => {
  const text = safeText(value, '', 1000);
  return text === '' || text.startsWith('/uploads/') || text.startsWith('/media/') || /^https:\/\//i.test(text) ? text : '';
};
const fontStacks = new Set<string>(INTERFACE_FONT_PRESETS.flatMap((preset) => [preset.display, preset.body]));
const safeFont = (value: unknown, fallback: string) => fontStacks.has(String(value || '')) ? String(value) : fallback;
const fontPresetIds = new Set<string>(INTERFACE_FONT_PRESETS.map((preset) => preset.id));
const iconLibraryIds = new Set<string>(INTERFACE_ICON_LIBRARIES.map((library) => library.id));

/** Merge persisted Admin data with safe defaults before it reaches public UI styles. */
export function normalizeInterfaceConfig(input: unknown): PublicInterfaceConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return structuredClone(DEFAULT_INTERFACE_CONFIG);
  const value = input as Partial<PublicInterfaceConfig>;
  const inputSections = Array.isArray(value.sections) ? value.sections : [];
  const sections = DEFAULT_INTERFACE_CONFIG.sections.map((fallback) => {
    const candidate = inputSections.find((section) => section && section.id === fallback.id) as Partial<InterfaceSectionConfig> | undefined;
    return {
      id: fallback.id,
      visible: candidate?.visible !== false,
      order: safeNumber(candidate?.order, fallback.order, 0, 999),
      title: safeText(candidate?.title, fallback.title),
      subtitle: safeText(candidate?.subtitle, fallback.subtitle, 500),
      image: safeMedia(candidate?.image),
      backgroundColor: safeColor(candidate?.backgroundColor, fallback.backgroundColor),
      textColor: safeColor(candidate?.textColor, fallback.textColor),
      paddingY: safeNumber(candidate?.paddingY, fallback.paddingY, 0, 160),
      contained: candidate?.contained === true,
    };
  });
  const typography = value.typography || {} as PublicInterfaceConfig['typography'];
  const colors = value.colors || {} as PublicInterfaceConfig['colors'];
  const buttons = value.buttons || {} as PublicInterfaceConfig['buttons'];
  const icons = value.icons || {} as PublicInterfaceConfig['icons'];
  const navigation = value.navigation || {} as PublicInterfaceConfig['navigation'];
  const slider = value.slider || {} as PublicInterfaceConfig['slider'];
  const layout = value.layout || {} as PublicInterfaceConfig['layout'];
  const preset = fontPresetIds.has(String(typography.preset || '')) ? typography.preset as InterfaceFontPresetId : 'ayrovi-modern';
  const presetFallback = INTERFACE_FONT_PRESETS.find((item) => item.id === preset) || INTERFACE_FONT_PRESETS[0];
  return {
    logoUrl: safeMedia(value.logoUrl) || DEFAULT_INTERFACE_CONFIG.logoUrl,
    sections,
    typography: {
      preset,
      body: safeFont(typography.body, presetFallback.body),
      display: safeFont(typography.display, presetFallback.display),
      baseSize: safeNumber(typography.baseSize, 16, 13, 22),
      align: ['start', 'center', 'end'].includes(typography.align) ? typography.align : 'start',
      headingColor: safeColor(typography.headingColor, DEFAULT_INTERFACE_CONFIG.typography.headingColor),
      textColor: safeColor(typography.textColor, DEFAULT_INTERFACE_CONFIG.typography.textColor),
      lineHeight: safeNumber(typography.lineHeight, 1.6, 1.2, 2.2),
      letterSpacing: safeNumber(typography.letterSpacing, -0.02, -0.08, 0.12),
      headingScale: safeNumber(typography.headingScale, 1, 0.8, 1.4),
    },
    colors: {
      pageBackground: safeColor(colors.pageBackground, DEFAULT_INTERFACE_CONFIG.colors.pageBackground),
      surfaceBackground: safeColor(colors.surfaceBackground, DEFAULT_INTERFACE_CONFIG.colors.surfaceBackground),
      surfaceAlt: safeColor(colors.surfaceAlt, DEFAULT_INTERFACE_CONFIG.colors.surfaceAlt),
      borderColor: safeColor(colors.borderColor, DEFAULT_INTERFACE_CONFIG.colors.borderColor),
      primary: safeColor(colors.primary, DEFAULT_INTERFACE_CONFIG.colors.primary),
      primaryDark: safeColor(colors.primaryDark, DEFAULT_INTERFACE_CONFIG.colors.primaryDark),
      primaryLight: safeColor(colors.primaryLight, DEFAULT_INTERFACE_CONFIG.colors.primaryLight),
      accent: safeColor(colors.accent, DEFAULT_INTERFACE_CONFIG.colors.accent),
      headerBackground: safeColor(colors.headerBackground, DEFAULT_INTERFACE_CONFIG.colors.headerBackground),
      headerText: safeColor(colors.headerText, DEFAULT_INTERFACE_CONFIG.colors.headerText),
      announcementBackground: safeColor(colors.announcementBackground, DEFAULT_INTERFACE_CONFIG.colors.announcementBackground),
      announcementText: safeColor(colors.announcementText, DEFAULT_INTERFACE_CONFIG.colors.announcementText),
      heroBackground: safeColor(colors.heroBackground, DEFAULT_INTERFACE_CONFIG.colors.heroBackground),
      heroText: safeColor(colors.heroText, DEFAULT_INTERFACE_CONFIG.colors.heroText),
      footerBackground: safeColor(colors.footerBackground, DEFAULT_INTERFACE_CONFIG.colors.footerBackground),
      footerText: safeColor(colors.footerText, DEFAULT_INTERFACE_CONFIG.colors.footerText),
      success: safeColor(colors.success, DEFAULT_INTERFACE_CONFIG.colors.success),
      warning: safeColor(colors.warning, DEFAULT_INTERFACE_CONFIG.colors.warning),
      danger: safeColor(colors.danger, DEFAULT_INTERFACE_CONFIG.colors.danger),
    },
    buttons: {
      background: safeColor(buttons.background, DEFAULT_INTERFACE_CONFIG.buttons.background),
      color: safeColor(buttons.color, DEFAULT_INTERFACE_CONFIG.buttons.color),
      secondaryBackground: safeColor(buttons.secondaryBackground, DEFAULT_INTERFACE_CONFIG.buttons.secondaryBackground),
      secondaryColor: safeColor(buttons.secondaryColor, DEFAULT_INTERFACE_CONFIG.buttons.secondaryColor),
      borderColor: safeColor(buttons.borderColor, DEFAULT_INTERFACE_CONFIG.buttons.borderColor),
      borderWidth: safeNumber(buttons.borderWidth, 1, 0, 4),
      radius: safeNumber(buttons.radius, 12, 0, 40),
      height: safeNumber(buttons.height, 44, 36, 68),
      shape: ['soft', 'pill', 'square'].includes(buttons.shape) ? buttons.shape : 'soft',
    },
    icons: {
      library: iconLibraryIds.has(String(icons.library || '')) ? icons.library as InterfaceIconLibrary : 'ayrovi',
      color: safeColor(icons.color, DEFAULT_INTERFACE_CONFIG.icons.color),
      activeColor: safeColor(icons.activeColor, DEFAULT_INTERFACE_CONFIG.icons.activeColor),
      size: safeNumber(icons.size, 20, 14, 40),
      style: icons.style === 'solid' ? 'solid' : 'outline',
    },
    navigation: {
      background: safeColor(navigation.background, DEFAULT_INTERFACE_CONFIG.navigation.background),
      color: safeColor(navigation.color, DEFAULT_INTERFACE_CONFIG.navigation.color),
      activeBackground: safeColor(navigation.activeBackground, DEFAULT_INTERFACE_CONFIG.navigation.activeBackground),
      showLabels: navigation.showLabels !== false,
      height: safeNumber(navigation.height, 72, 56, 104),
      lensLabel: safeText(navigation.lensLabel, 'Lens', 24),
      aiLabel: safeText(navigation.aiLabel, 'AI', 24),
      visionLabel: safeText(navigation.visionLabel, 'Vision', 24),
    },
    slider: {
      autoplay: slider.autoplay !== false,
      duration: safeNumber(slider.duration, 5200, 2000, 20000),
      transition: safeNumber(slider.transition, 1200, 150, 2500),
      showArrows: slider.showArrows !== false,
      showDots: slider.showDots !== false,
    },
    layout: {
      sectionGap: safeNumber(layout.sectionGap, 0, 0, 120),
      maxWidth: safeNumber(layout.maxWidth, 1280, 880, 1800),
      pagePadding: safeNumber(layout.pagePadding, 16, 0, 64),
      cardRadius: safeNumber(layout.cardRadius, 16, 0, 48),
      cardBorderWidth: safeNumber(layout.cardBorderWidth, 1, 0, 4),
      shadow: ['none', 'soft', 'strong'].includes(layout.shadow) ? layout.shadow : 'soft',
    },
  };
}
