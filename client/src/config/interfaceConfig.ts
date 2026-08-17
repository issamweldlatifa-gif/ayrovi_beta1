export const AYROVI_SEMANTIC_PALETTE = {
  interactivePrimary: '#003b39',
  heroBackground: '#13251f',
  surfaceAlt: '#ede6de',
  surfaceBase: '#f9f8f4',
  textPrimary: '#1a1a1a',
  textSecondary: '#5f5f5b',
  chartAccent: '#2e667d',
  danger: '#a63b32',
  white: '#ffffff',
} as const;

export const PUBLIC_SECTION_IDS = ['hero', 'cms', 'brands', 'about', 'footer'] as const;
export type PublicSectionId = (typeof PUBLIC_SECTION_IDS)[number];

export interface InterfaceSectionConfig {
  id: PublicSectionId;
  visible: boolean;
  order: number;
  title: string;
  subtitle: string;
  image: string;
}

export interface PublicInterfaceConfig {
  logoUrl: string;
  sections: InterfaceSectionConfig[];
  typography: {
    body: string;
    display: string;
    baseSize: number;
    align: 'start' | 'center' | 'end';
    headingColor: string;
    textColor: string;
  };
  buttons: {
    background: string;
    color: string;
    radius: number;
    height: number;
    shape: 'soft' | 'pill' | 'square';
  };
  icons: {
    library: 'ayrovi' | 'lucide';
    color: string;
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
  };
}

export const DEFAULT_INTERFACE_CONFIG: PublicInterfaceConfig = {
  logoUrl: '/media/logo-ayrovi-final.png',
  sections: [
    { id: 'hero', visible: true, order: 10, title: 'Toute la mode du monde, livrée chez vous.', subtitle: '', image: '' },
    { id: 'cms', visible: true, order: 20, title: '', subtitle: '', image: '' },
    { id: 'brands', visible: true, order: 30, title: '', subtitle: '', image: '' },
    { id: 'about', visible: true, order: 40, title: '', subtitle: '', image: '' },
    { id: 'footer', visible: true, order: 50, title: '', subtitle: '', image: '' },
  ],
  typography: {
    body: "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif",
    baseSize: 16,
    align: 'start',
    headingColor: AYROVI_SEMANTIC_PALETTE.textPrimary,
    textColor: AYROVI_SEMANTIC_PALETTE.textSecondary,
  },
  buttons: { background: AYROVI_SEMANTIC_PALETTE.interactivePrimary, color: AYROVI_SEMANTIC_PALETTE.white, radius: 12, height: 44, shape: 'soft' },
  icons: { library: 'ayrovi', color: AYROVI_SEMANTIC_PALETTE.textPrimary, size: 20, style: 'outline' },
  navigation: {
    background: AYROVI_SEMANTIC_PALETTE.surfaceBase, color: AYROVI_SEMANTIC_PALETTE.textPrimary, activeBackground: AYROVI_SEMANTIC_PALETTE.surfaceAlt, showLabels: true, height: 72,
    lensLabel: 'Lens', aiLabel: 'AI', visionLabel: 'Vision',
  },
  slider: { autoplay: true, duration: 5200, transition: 1200, showArrows: true, showDots: true },
  layout: { sectionGap: 0, maxWidth: 1280 },
};

const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
const safeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const safeText = (value: unknown, fallback = '', max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const safeMedia = (value: unknown) => {
  const text = safeText(value, '', 1000);
  return text === '' || text.startsWith('/uploads/') || text.startsWith('/media/') || /^https:\/\//i.test(text) ? text : '';
};

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
    };
  });
  const typography = value.typography || {} as PublicInterfaceConfig['typography'];
  const buttons = value.buttons || {} as PublicInterfaceConfig['buttons'];
  const icons = value.icons || {} as PublicInterfaceConfig['icons'];
  const navigation = value.navigation || {} as PublicInterfaceConfig['navigation'];
  const slider = value.slider || {} as PublicInterfaceConfig['slider'];
  const layout = value.layout || {} as PublicInterfaceConfig['layout'];
  return {
    logoUrl: safeMedia(value.logoUrl) || DEFAULT_INTERFACE_CONFIG.logoUrl,
    sections,
    typography: {
      body: safeText(typography.body, DEFAULT_INTERFACE_CONFIG.typography.body, 180),
      display: safeText(typography.display, DEFAULT_INTERFACE_CONFIG.typography.display, 180),
      baseSize: safeNumber(typography.baseSize, 16, 14, 20),
      align: ['start', 'center', 'end'].includes(typography.align) ? typography.align : 'start',
      headingColor: safeColor(typography.headingColor, DEFAULT_INTERFACE_CONFIG.typography.headingColor),
      textColor: safeColor(typography.textColor, DEFAULT_INTERFACE_CONFIG.typography.textColor),
    },
    buttons: {
      background: safeColor(buttons.background, DEFAULT_INTERFACE_CONFIG.buttons.background),
      color: safeColor(buttons.color, DEFAULT_INTERFACE_CONFIG.buttons.color),
      radius: safeNumber(buttons.radius, 12, 0, 40),
      height: safeNumber(buttons.height, 44, 40, 60),
      shape: ['soft', 'pill', 'square'].includes(buttons.shape) ? buttons.shape : 'soft',
    },
    icons: {
      library: icons.library === 'lucide' ? 'lucide' : 'ayrovi',
      color: safeColor(icons.color, DEFAULT_INTERFACE_CONFIG.icons.color),
      size: safeNumber(icons.size, 20, 14, 36),
      style: icons.style === 'solid' ? 'solid' : 'outline',
    },
    navigation: {
      background: safeColor(navigation.background, DEFAULT_INTERFACE_CONFIG.navigation.background),
      color: safeColor(navigation.color, DEFAULT_INTERFACE_CONFIG.navigation.color),
      activeBackground: safeColor(navigation.activeBackground, DEFAULT_INTERFACE_CONFIG.navigation.activeBackground),
      showLabels: navigation.showLabels !== false,
      height: safeNumber(navigation.height, 72, 60, 88),
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
      maxWidth: safeNumber(layout.maxWidth, 1280, 960, 1600),
    },
  };
}
