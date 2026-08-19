import React, { useEffect, useMemo, useState } from 'react';
import { Bot as LucideBot, Eye as LucideEye, ScanSearch as LucideScanSearch } from 'lucide-react';
import { FaCamera, FaEye, FaRobot } from 'react-icons/fa6';
import { BsCamera, BsChatDots, BsEye } from 'react-icons/bs';
import { MdCenterFocusStrong, MdSmartToy, MdVisibility } from 'react-icons/md';
import {
  ArrowDown, ArrowUp, Eye as AyroviEye, EyeOff, Heart, Home, Image as ImageIcon, LayoutGrid,
  LensBox, Menu, MessageCircle, Monitor, MousePointer2, Navigation, Palette, RotateCcw, Save,
  ShoppingBag, SlidersHorizontal, Sparkles, Type, User,
} from '../components/QatafoIcons';
import {
  DEFAULT_INTERFACE_CONFIG, INTERFACE_FONT_PRESETS, INTERFACE_ICON_LIBRARIES, normalizeInterfaceConfig,
  type InterfaceFontPresetId, type InterfaceIconLibrary, type InterfaceSectionConfig, type PublicInterfaceConfig,
} from '../config/interfaceConfig';
import { adminApi } from './api';
import { Button, Field, ImageUploader, Select, Toast } from './components';

const SECTION_LABELS: Record<InterfaceSectionConfig['id'], string> = {
  hero: 'Hero & slider',
  cms: 'Contenus & onglets',
  brands: 'Marques partenaires',
  about: 'Pourquoi AYROVI',
  footer: 'Pied de page',
};
const PANEL_ICONS = {
  sections: LayoutGrid,
  colors: Palette,
  typography: Type,
  controls: MousePointer2,
  navigation: Navigation,
  layout: SlidersHorizontal,
};
type Panel = keyof typeof PANEL_ICONS;
type PatchableKey = 'typography' | 'colors' | 'buttons' | 'icons' | 'navigation' | 'slider' | 'layout';
const selectOptions = (items: Array<[string, string]>) => items.map(([value, label]) => ({ value, label }));

const ICON_SETS: Record<InterfaceIconLibrary, React.ElementType[]> = {
  ayrovi: [Home, LensBox, MessageCircle, ShoppingBag, User],
  lucide: [LucideScanSearch, LucideBot, LucideEye],
  fontawesome: [FaCamera, FaRobot, FaEye],
  bootstrap: [BsCamera, BsChatDots, BsEye],
  material: [MdCenterFocusStrong, MdSmartToy, MdVisibility],
};
const AYROVI_CORE_ICONS = [
  { label: 'Accueil · الرئيسية', icon: Home },
  { label: 'Panier · السلة', icon: ShoppingBag },
  { label: 'Menu · القائمة', icon: Menu },
  { label: 'Favoris · المفضلة', icon: Heart },
  { label: 'Compte · الحساب', icon: User },
];

const COLOR_PRESETS: Array<{
  id: string;
  label: string;
  note: string;
  colors: PublicInterfaceConfig['colors'];
  heading: string;
  muted: string;
}> = [
  { id: 'violet', label: 'AYROVI Violet', note: 'Identité historique', colors: structuredClone(DEFAULT_INTERFACE_CONFIG.colors), heading: '#1d2130', muted: '#6b7280' },
  { id: 'petrole', label: 'Pétrole', note: 'Sérieux et premium', colors: { pageBackground: '#f7faf9', surfaceBackground: '#ffffff', surfaceAlt: '#eef5f3', borderColor: '#cbded9', primary: '#087f73', primaryDark: '#05665d', primaryLight: '#5bb5ac', accent: '#d7a72f', headerBackground: '#ffffff', headerText: '#15201f', announcementBackground: '#d7a72f', announcementText: '#15201f', heroBackground: '#123a36', heroText: '#ffffff', footerBackground: '#11201f', footerText: '#ffffff', success: '#197447', warning: '#a46c05', danger: '#b64040' }, heading: '#15201f', muted: '#5b6f6c' },
  { id: 'sand', label: 'Sable', note: 'Chaleureux et éditorial', colors: { pageBackground: '#fbf7f0', surfaceBackground: '#fffdf9', surfaceAlt: '#f3e8d7', borderColor: '#dfcfb9', primary: '#7b3f25', primaryDark: '#5b2b18', primaryLight: '#b97852', accent: '#d9a441', headerBackground: '#fffdf9', headerText: '#2d211b', announcementBackground: '#e8c77f', announcementText: '#2d211b', heroBackground: '#3a261d', heroText: '#fffaf2', footerBackground: '#2d211b', footerText: '#fffaf2', success: '#39704c', warning: '#9c6808', danger: '#a8433d' }, heading: '#2d211b', muted: '#75665e' },
  { id: 'ocean', label: 'Océan', note: 'Clair et technologique', colors: { pageBackground: '#f4f9fb', surfaceBackground: '#ffffff', surfaceAlt: '#e7f2f6', borderColor: '#c6dce5', primary: '#126782', primaryDark: '#0b4b61', primaryLight: '#5aa6bd', accent: '#e6b84b', headerBackground: '#ffffff', headerText: '#132a33', announcementBackground: '#e6b84b', announcementText: '#132a33', heroBackground: '#102f3b', heroText: '#ffffff', footerBackground: '#10242c', footerText: '#ffffff', success: '#2e7651', warning: '#a36c08', danger: '#b54848' }, heading: '#132a33', muted: '#58717a' },
  { id: 'mono', label: 'Monochrome', note: 'Minimal noir & blanc', colors: { pageBackground: '#f7f7f7', surfaceBackground: '#ffffff', surfaceAlt: '#eeeeee', borderColor: '#d4d4d4', primary: '#171717', primaryDark: '#000000', primaryLight: '#525252', accent: '#d9d9d9', headerBackground: '#ffffff', headerText: '#171717', announcementBackground: '#e5e5e5', announcementText: '#171717', heroBackground: '#171717', heroText: '#ffffff', footerBackground: '#171717', footerText: '#ffffff', success: '#28734d', warning: '#906512', danger: '#a83f3f' }, heading: '#171717', muted: '#666666' },
];

function mixHex(color: string, target: string, amount: number) {
  const parse = (value: string) => [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
  const source = parse(color);
  const destination = parse(target);
  return `#${source.map((channel, index) => Math.round(channel + (destination[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

const ColorControl: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ label, value, onChange, disabled, hint }) => {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = () => {
    if (/^#[0-9a-f]{6}$/i.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value.toUpperCase());
  };
  const shades = [mixHex(value, '#ffffff', 0.72), mixHex(value, '#ffffff', 0.42), mixHex(value, '#ffffff', 0.18), value, mixHex(value, '#000000', 0.22)];
  return <div className="interface-color-control">
    <div className="interface-color-head"><span>{label}</span><code>{value.toUpperCase()}</code></div>
    <div className="interface-color-inputs">
      <input aria-label={`Sélecteur ${label}`} disabled={disabled} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <input aria-label={`Code couleur ${label}`} disabled={disabled} value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />
    </div>
    <div className="interface-shades" aria-label={`Degrés ${label}`}>{shades.map((shade, index) => <button key={`${shade}-${index}`} type="button" disabled={disabled} style={{ background: shade }} onClick={() => onChange(shade)} title={shade.toUpperCase()} aria-label={`Appliquer ${shade}`} />)}</div>
    {hint && <small>{hint}</small>}
  </div>;
};

const IconLibraryPreview: React.FC<{ config: PublicInterfaceConfig['icons']; compact?: boolean }> = ({ config, compact }) => {
  const icons = ICON_SETS[config.library];
  return <div className={`interface-icon-preview ${compact ? 'is-compact' : ''}`} style={{ color: config.color }}>
    {icons.map((Icon, index) => <Icon key={index} size={config.size} style={{ color: index === 1 ? config.activeColor : config.color }} fill={config.style === 'solid' && ['ayrovi', 'lucide'].includes(config.library) ? 'currentColor' : undefined} />)}
  </div>;
};

const AyroviCorePreview: React.FC<{ config: PublicInterfaceConfig['icons'] }> = ({ config }) => (
  <div className="interface-ayrovi-core" style={{ color: config.color }}>
    <div><strong>Géométrie AYROVI · هندسة AYROVI</strong><small>24 × 24 · monoline 1.5 · round · currentColor</small></div>
    <ul>{AYROVI_CORE_ICONS.map(({ label, icon: Icon }) => <li key={label}><Icon size={Math.max(20, config.size)} /><span>{label}</span></li>)}</ul>
  </div>
);

export const InterfaceStudio: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [settingId, setSettingId] = useState('');
  const [config, setConfig] = useState<PublicInterfaceConfig>(() => structuredClone(DEFAULT_INTERFACE_CONFIG));
  const [panel, setPanel] = useState<Panel>('sections');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi<any>('/settings?category=INTERFACE');
      const row = response.data?.find((item: any) => item.setting_key === 'interface_config');
      if (!row) throw new Error('Configuration « واجهتي » introuvable. Redémarrez le service pour appliquer la migration.');
      setSettingId(String(row.id));
      setConfig(normalizeInterfaceConfig(row.setting_value));
    } catch (error: any) {
      setToast({ message: error.message || 'Impossible de charger la configuration.', tone: 'error' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = <K extends keyof PublicInterfaceConfig>(key: K, value: PublicInterfaceConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const patch = <K extends PatchableKey>(key: K, value: Partial<PublicInterfaceConfig[K]>) => setConfig((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  const patchSection = (id: InterfaceSectionConfig['id'], value: Partial<InterfaceSectionConfig>) => update('sections', config.sections.map((section) => section.id === id ? { ...section, ...value } : section));
  const orderedSections = useMemo(() => [...config.sections].sort((a, b) => a.order - b.order), [config.sections]);

  const move = (id: InterfaceSectionConfig['id'], delta: -1 | 1) => {
    const ordered = [...orderedSections];
    const index = ordered.findIndex((section) => section.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    update('sections', ordered.map((section, order) => ({ ...section, order: (order + 1) * 10 })));
  };

  const applyFontPreset = (id: InterfaceFontPresetId) => {
    const preset = INTERFACE_FONT_PRESETS.find((item) => item.id === id)!;
    patch('typography', { preset: id, display: preset.display, body: preset.body });
  };

  const applyColorPreset = (preset: (typeof COLOR_PRESETS)[number]) => {
    setConfig((current) => ({
      ...current,
      colors: structuredClone(preset.colors),
      typography: { ...current.typography, headingColor: preset.heading, textColor: preset.muted },
      buttons: { ...current.buttons, background: preset.colors.primary, color: preset.colors.heroText, secondaryBackground: preset.colors.surfaceBackground, secondaryColor: preset.colors.primaryDark, borderColor: preset.colors.primary },
      icons: { ...current.icons, color: preset.colors.primary, activeColor: preset.colors.accent },
      navigation: { ...current.navigation, background: preset.colors.footerBackground, color: preset.colors.footerText, activeBackground: preset.colors.primary },
      sections: current.sections.map((section) => ({
        ...section,
        backgroundColor: section.id === 'hero' ? preset.colors.heroBackground : section.id === 'brands' ? preset.colors.surfaceAlt : section.id === 'footer' ? preset.colors.footerBackground : preset.colors.pageBackground,
        textColor: section.id === 'hero' ? preset.colors.heroText : section.id === 'footer' ? preset.colors.footerText : preset.heading,
      })),
    }));
  };

  const save = async () => {
    if (!settingId) return;
    setBusy(true);
    try {
      const normalized = normalizeInterfaceConfig(config);
      await adminApi(`/settings/${settingId}`, { method: 'PUT', body: JSON.stringify({ value: normalized }) });
      setConfig(normalized);
      setToast({ message: 'واجهتي publiée. Toute la direction visuelle est maintenant appliquée au site public.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message || 'Publication impossible.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="admin-page-loading"><span /><p>Chargement de واجهتي…</p></div>;

  const panelLabels: Record<Panel, string> = {
    sections: 'Sections & images', colors: 'Couleurs globales', typography: '5 styles de polices', controls: 'Boutons & icônes', navigation: 'Header & navigation', layout: 'Mise en page & slider',
  };

  return <>
    <div className="admin-page-header">
      <div><span className="admin-eyebrow">AYROVI ADMIN · FULL INTERFACE CONTROL</span><h1>واجهتي</h1><p>Un studio unique pour piloter toutes les surfaces, les couleurs par degré ou code HEX, cinq familles de polices, cinq modèles d’icônes, les sections, les boutons, le header, la navigation et le mouvement.</p></div>
      {canWrite && <div className="interface-header-actions"><Button variant="secondary" onClick={() => setConfig(structuredClone(DEFAULT_INTERFACE_CONFIG))}><RotateCcw size={16} />Réinitialiser</Button><Button busy={busy} onClick={save}><Save size={17} />Publier واجهتي</Button></div>}
    </div>

    <div className="interface-studio-layout">
      <aside className="interface-studio-tabs" aria-label="Outils واجهتي">
        {(Object.keys(PANEL_ICONS) as Panel[]).map((id) => { const Icon = PANEL_ICONS[id]; return <button key={id} type="button" className={panel === id ? 'is-active' : ''} onClick={() => setPanel(id)}><Icon size={17} /><span>{panelLabels[id]}</span></button>; })}
      </aside>

      <div className="interface-studio-content">
        {panel === 'sections' && <>
          <section className="admin-card interface-card"><header><div><ImageIcon size={19} /><div><h2>Logo public</h2><p>Le logo partagé par le header, les modules et le footer.</p></div></div></header><ImageUploader value={config.logoUrl} onChange={(logoUrl) => update('logoUrl', logoUrl || DEFAULT_INTERFACE_CONFIG.logoUrl)} label="Remplacer le logo" /></section>
          <section className="admin-card interface-card"><header><div><LayoutGrid size={19} /><div><h2>Contrôle complet des sections</h2><p>Ordre, visibilité, textes, média, fond, texte, espacement et largeur de chaque bloc.</p></div></div></header>
            <div className="interface-section-list">{orderedSections.map((section, index) => <article key={section.id} className={!section.visible ? 'is-hidden' : ''}>
              <div className="interface-section-toolbar"><div><span>{String(index + 1).padStart(2, '0')}</span><strong>{SECTION_LABELS[section.id]}</strong></div><div><button type="button" disabled={!canWrite || index === 0} onClick={() => move(section.id, -1)} aria-label="Monter"><ArrowUp size={15} /></button><button type="button" disabled={!canWrite || index === orderedSections.length - 1} onClick={() => move(section.id, 1)} aria-label="Descendre"><ArrowDown size={15} /></button><button type="button" disabled={!canWrite} className={section.visible ? 'is-visible' : ''} onClick={() => patchSection(section.id, { visible: !section.visible })}>{section.visible ? <LucideEye size={15} /> : <EyeOff size={15} />}{section.visible ? 'Visible' : 'Masqué'}</button></div></div>
              <div className="admin-form interface-section-form"><Field label="Titre" full><input disabled={!canWrite} value={section.title} onChange={(event) => patchSection(section.id, { title: event.target.value })} placeholder="Titre du bloc (facultatif)" /></Field><Field label="Sous-titre / contenu court" full><textarea disabled={!canWrite} rows={2} value={section.subtitle} onChange={(event) => patchSection(section.id, { subtitle: event.target.value })} /></Field><Field label="Image du bloc" hint={section.id === 'hero' ? 'Remplace visuellement la première slide du Hero.' : 'Affichée comme couverture administrée du bloc.'} full><ImageUploader value={section.image} onChange={(image) => patchSection(section.id, { image })} label={`Ajouter l’image ${SECTION_LABELS[section.id]}`} /></Field></div>
              <details className="interface-section-advanced"><summary><Palette size={14} />Style propre à cette section</summary><div>
                <ColorControl label="Fond" value={section.backgroundColor} onChange={(backgroundColor) => patchSection(section.id, { backgroundColor })} disabled={!canWrite} />
                <ColorControl label="Texte" value={section.textColor} onChange={(textColor) => patchSection(section.id, { textColor })} disabled={!canWrite} />
                <Field label={`Espacement vertical · ${section.paddingY}px`}><input disabled={!canWrite} type="range" min="0" max="160" step="4" value={section.paddingY} onChange={(event) => patchSection(section.id, { paddingY: Number(event.target.value) })} /></Field>
                <Field label="Largeur du bloc"><button type="button" disabled={!canWrite} className={`admin-switch ${section.contained ? 'is-on' : ''}`} onClick={() => patchSection(section.id, { contained: !section.contained })}><i /><span>{section.contained ? 'Contenu encadré' : 'Pleine largeur'}</span></button></Field>
              </div></details>
            </article>)}</div>
          </section>
        </>}

        {panel === 'colors' && <>
          <section className="admin-card interface-card"><header><div><Sparkles size={19} /><div><h2>Palettes coordonnées</h2><p>Point de départ rapide. Chaque couleur reste ensuite modifiable par nuances ou code HEX.</p></div></div></header><div className="interface-palette-presets">{COLOR_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={!canWrite} onClick={() => applyColorPreset(preset)}><span>{[preset.colors.primary, preset.colors.accent, preset.colors.heroBackground, preset.colors.surfaceAlt, preset.colors.pageBackground].map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}</span><strong>{preset.label}</strong><small>{preset.note}</small></button>)}</div></section>
          <section className="admin-card interface-card"><header><div><Palette size={19} /><div><h2>Identité & interaction</h2><p>Couleurs principales utilisées par les liens, actions et accents.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Couleur principale" value={config.colors.primary} onChange={(primary) => patch('colors', { primary })} disabled={!canWrite} /><ColorControl label="Principale sombre" value={config.colors.primaryDark} onChange={(primaryDark) => patch('colors', { primaryDark })} disabled={!canWrite} /><ColorControl label="Principale claire" value={config.colors.primaryLight} onChange={(primaryLight) => patch('colors', { primaryLight })} disabled={!canWrite} /><ColorControl label="Accent" value={config.colors.accent} onChange={(accent) => patch('colors', { accent })} disabled={!canWrite} /></div></section>
          <section className="admin-card interface-card"><header><div><Monitor size={19} /><div><h2>Surfaces globales</h2><p>Canvas, cartes, sections alternées et séparateurs de toute l’application publique.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Fond de page" value={config.colors.pageBackground} onChange={(pageBackground) => patch('colors', { pageBackground })} disabled={!canWrite} /><ColorControl label="Cartes / surfaces" value={config.colors.surfaceBackground} onChange={(surfaceBackground) => patch('colors', { surfaceBackground })} disabled={!canWrite} /><ColorControl label="Surface alternative" value={config.colors.surfaceAlt} onChange={(surfaceAlt) => patch('colors', { surfaceAlt })} disabled={!canWrite} /><ColorControl label="Bordures" value={config.colors.borderColor} onChange={(borderColor) => patch('colors', { borderColor })} disabled={!canWrite} /></div></section>
          <section className="admin-card interface-card"><header><div><Navigation size={19} /><div><h2>Zones structurantes</h2><p>Header, bandeau, Hero et footer disposent de couples fond/texte indépendants.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Fond header" value={config.colors.headerBackground} onChange={(headerBackground) => patch('colors', { headerBackground })} disabled={!canWrite} /><ColorControl label="Texte header" value={config.colors.headerText} onChange={(headerText) => patch('colors', { headerText })} disabled={!canWrite} /><ColorControl label="Fond bandeau" value={config.colors.announcementBackground} onChange={(announcementBackground) => patch('colors', { announcementBackground })} disabled={!canWrite} /><ColorControl label="Texte bandeau" value={config.colors.announcementText} onChange={(announcementText) => patch('colors', { announcementText })} disabled={!canWrite} /><ColorControl label="Fond Hero" value={config.colors.heroBackground} onChange={(heroBackground) => patch('colors', { heroBackground })} disabled={!canWrite} /><ColorControl label="Texte Hero" value={config.colors.heroText} onChange={(heroText) => patch('colors', { heroText })} disabled={!canWrite} /><ColorControl label="Fond footer" value={config.colors.footerBackground} onChange={(footerBackground) => patch('colors', { footerBackground })} disabled={!canWrite} /><ColorControl label="Texte footer" value={config.colors.footerText} onChange={(footerText) => patch('colors', { footerText })} disabled={!canWrite} /></div></section>
          <section className="admin-card interface-card"><header><div><Palette size={19} /><div><h2>États sémantiques</h2><p>Succès, avertissement et erreur restent contrôlables séparément.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Succès" value={config.colors.success} onChange={(success) => patch('colors', { success })} disabled={!canWrite} /><ColorControl label="Avertissement" value={config.colors.warning} onChange={(warning) => patch('colors', { warning })} disabled={!canWrite} /><ColorControl label="Erreur / danger" value={config.colors.danger} onChange={(danger) => patch('colors', { danger })} disabled={!canWrite} /></div></section>
        </>}

        {panel === 'typography' && <>
          <section className="admin-card interface-card"><header><div><Type size={19} /><div><h2>Cinq identités typographiques</h2><p>Chaque modèle définit un duo cohérent titres/contenu avec support FR/AR.</p></div></div></header><div className="interface-font-presets">{INTERFACE_FONT_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={!canWrite} aria-pressed={config.typography.preset === preset.id} className={config.typography.preset === preset.id ? 'is-active' : ''} onClick={() => applyFontPreset(preset.id)} style={{ fontFamily: preset.body }}><span style={{ fontFamily: preset.display }}>Aa أب</span><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</div></section>
          <section className="admin-card interface-card"><header><div><Type size={19} /><div><h2>Réglages typographiques détaillés</h2><p>Polices, couleurs, échelle, rythme, alignement et espacement.</p></div></div></header><div className="admin-form">
            <Field label="Police des titres"><Select disabled={!canWrite} value={config.typography.display} onChange={(event) => patch('typography', { display: event.target.value })} options={INTERFACE_FONT_PRESETS.map((preset) => ({ value: preset.display, label: preset.label }))} /></Field>
            <Field label="Police du contenu"><Select disabled={!canWrite} value={config.typography.body} onChange={(event) => patch('typography', { body: event.target.value })} options={INTERFACE_FONT_PRESETS.map((preset) => ({ value: preset.body, label: preset.label }))} /></Field>
            <Field label={`Taille de base · ${config.typography.baseSize}px`}><input disabled={!canWrite} type="range" min="13" max="22" value={config.typography.baseSize} onChange={(event) => patch('typography', { baseSize: Number(event.target.value) })} /></Field>
            <Field label={`Interligne · ${config.typography.lineHeight.toFixed(2)}`}><input disabled={!canWrite} type="range" min="1.2" max="2.2" step="0.05" value={config.typography.lineHeight} onChange={(event) => patch('typography', { lineHeight: Number(event.target.value) })} /></Field>
            <Field label={`Échelle des titres · ${Math.round(config.typography.headingScale * 100)}%`}><input disabled={!canWrite} type="range" min="0.8" max="1.4" step="0.05" value={config.typography.headingScale} onChange={(event) => patch('typography', { headingScale: Number(event.target.value) })} /></Field>
            <Field label={`Espacement lettres · ${config.typography.letterSpacing.toFixed(3)}em`}><input disabled={!canWrite} type="range" min="-0.08" max="0.12" step="0.005" value={config.typography.letterSpacing} onChange={(event) => patch('typography', { letterSpacing: Number(event.target.value) })} /></Field>
            <Field label="Alignement"><Select disabled={!canWrite} value={config.typography.align} onChange={(event) => patch('typography', { align: event.target.value as any })} options={selectOptions([['start', 'Début (adapté LTR/RTL)'], ['center', 'Centré'], ['end', 'Fin (adapté LTR/RTL)']])} /></Field>
          </div><div className="interface-color-grid interface-typography-colors"><ColorControl label="Couleur des titres" value={config.typography.headingColor} onChange={(headingColor) => patch('typography', { headingColor })} disabled={!canWrite} /><ColorControl label="Texte secondaire" value={config.typography.textColor} onChange={(textColor) => patch('typography', { textColor })} disabled={!canWrite} /></div>
          </section>
        </>}

        {panel === 'controls' && <>
          <section className="admin-card interface-card"><header><div><MousePointer2 size={19} /><div><h2>Boutons primaires et secondaires</h2><p>Contrôle indépendant des couleurs, bordure, forme, hauteur et courbure.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Fond primaire" value={config.buttons.background} onChange={(background) => patch('buttons', { background })} disabled={!canWrite} /><ColorControl label="Texte primaire" value={config.buttons.color} onChange={(color) => patch('buttons', { color })} disabled={!canWrite} /><ColorControl label="Fond secondaire" value={config.buttons.secondaryBackground} onChange={(secondaryBackground) => patch('buttons', { secondaryBackground })} disabled={!canWrite} /><ColorControl label="Texte secondaire" value={config.buttons.secondaryColor} onChange={(secondaryColor) => patch('buttons', { secondaryColor })} disabled={!canWrite} /><ColorControl label="Bordure" value={config.buttons.borderColor} onChange={(borderColor) => patch('buttons', { borderColor })} disabled={!canWrite} /></div><div className="admin-form interface-control-ranges"><Field label="Forme"><Select disabled={!canWrite} value={config.buttons.shape} onChange={(event) => patch('buttons', { shape: event.target.value as any })} options={selectOptions([['soft', 'Douce'], ['pill', 'Pilule'], ['square', 'Carrée']])} /></Field><Field label={`Hauteur · ${config.buttons.height}px`}><input disabled={!canWrite} type="range" min="36" max="68" value={config.buttons.height} onChange={(event) => patch('buttons', { height: Number(event.target.value) })} /></Field><Field label={`Courbure · ${config.buttons.radius}px`}><input disabled={!canWrite} type="range" min="0" max="40" value={config.buttons.radius} onChange={(event) => patch('buttons', { radius: Number(event.target.value) })} /></Field><Field label={`Épaisseur bordure · ${config.buttons.borderWidth}px`}><input disabled={!canWrite} type="range" min="0" max="4" value={config.buttons.borderWidth} onChange={(event) => patch('buttons', { borderWidth: Number(event.target.value) })} /></Field></div><div className="interface-button-preview"><button type="button" style={{ background: config.buttons.background, color: config.buttons.color, minHeight: config.buttons.height, borderRadius: config.buttons.shape === 'pill' ? 999 : config.buttons.shape === 'square' ? 0 : config.buttons.radius, border: `${config.buttons.borderWidth}px solid ${config.buttons.borderColor}` }}>Bouton principal</button><button type="button" style={{ background: config.buttons.secondaryBackground, color: config.buttons.secondaryColor, minHeight: config.buttons.height, borderRadius: config.buttons.shape === 'pill' ? 999 : config.buttons.shape === 'square' ? 0 : config.buttons.radius, border: `${config.buttons.borderWidth}px solid ${config.buttons.borderColor}` }}>Bouton secondaire</button></div></section>
          <section className="admin-card interface-card"><header><div><Palette size={19} /><div><h2>Cinq modèles d’icônes</h2><p>Choisissez une vraie bibliothèque, puis réglez couleur, état actif, style et taille.</p></div></div></header><div className="interface-icon-models">{INTERFACE_ICON_LIBRARIES.map((library) => { const sampleConfig = { ...config.icons, library: library.id }; return <button key={library.id} type="button" disabled={!canWrite} aria-pressed={config.icons.library === library.id} className={config.icons.library === library.id ? 'is-active' : ''} onClick={() => patch('icons', { library: library.id })}><IconLibraryPreview config={sampleConfig} compact /><strong>{library.label}</strong><small>{library.description}</small></button>; })}</div><AyroviCorePreview config={config.icons} /><div className="interface-color-grid"><ColorControl label="Couleur icônes" value={config.icons.color} onChange={(color) => patch('icons', { color })} disabled={!canWrite} /><ColorControl label="Couleur active" value={config.icons.activeColor} onChange={(activeColor) => patch('icons', { activeColor })} disabled={!canWrite} /></div><div className="admin-form interface-control-ranges"><Field label="Style"><Select disabled={!canWrite} value={config.icons.style} onChange={(event) => patch('icons', { style: event.target.value as any })} options={selectOptions([['outline', 'Contour'], ['solid', 'Plein']])} /></Field><Field label={`Taille · ${config.icons.size}px`}><input disabled={!canWrite} type="range" min="14" max="40" value={config.icons.size} onChange={(event) => patch('icons', { size: Number(event.target.value) })} /></Field></div><IconLibraryPreview config={config.icons} /></section>
        </>}

        {panel === 'navigation' && <>
          <section className="admin-card interface-card"><header><div><Navigation size={19} /><div><h2>Header & bandeau</h2><p>Ces couleurs sont également disponibles dans la palette globale.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Fond header" value={config.colors.headerBackground} onChange={(headerBackground) => patch('colors', { headerBackground })} disabled={!canWrite} /><ColorControl label="Texte header" value={config.colors.headerText} onChange={(headerText) => patch('colors', { headerText })} disabled={!canWrite} /><ColorControl label="Fond bandeau" value={config.colors.announcementBackground} onChange={(announcementBackground) => patch('colors', { announcementBackground })} disabled={!canWrite} /><ColorControl label="Texte bandeau" value={config.colors.announcementText} onChange={(announcementText) => patch('colors', { announcementText })} disabled={!canWrite} /></div></section>
          <section className="admin-card interface-card"><header><div><Navigation size={19} /><div><h2>Bottom navigation</h2><p>Fond, texte, état actif, labels, hauteur et modèle d’icônes sont appliqués en production.</p></div></div></header><div className="interface-color-grid"><ColorControl label="Fond navigation" value={config.navigation.background} onChange={(background) => patch('navigation', { background })} disabled={!canWrite} /><ColorControl label="Texte navigation" value={config.navigation.color} onChange={(color) => patch('navigation', { color })} disabled={!canWrite} /><ColorControl label="Fond actif" value={config.navigation.activeBackground} onChange={(activeBackground) => patch('navigation', { activeBackground })} disabled={!canWrite} /></div><div className="admin-form"><Field label="Label Lens"><input disabled={!canWrite} value={config.navigation.lensLabel} onChange={(event) => patch('navigation', { lensLabel: event.target.value })} /></Field><Field label="Label AI"><input disabled={!canWrite} value={config.navigation.aiLabel} onChange={(event) => patch('navigation', { aiLabel: event.target.value })} /></Field><Field label="Label Vision"><input disabled={!canWrite} value={config.navigation.visionLabel} onChange={(event) => patch('navigation', { visionLabel: event.target.value })} /></Field><Field label={`Hauteur · ${config.navigation.height}px`}><input disabled={!canWrite} type="range" min="56" max="104" value={config.navigation.height} onChange={(event) => patch('navigation', { height: Number(event.target.value) })} /></Field><Field label="Afficher les labels" full><button type="button" disabled={!canWrite} className={`admin-switch ${config.navigation.showLabels ? 'is-on' : ''}`} onClick={() => patch('navigation', { showLabels: !config.navigation.showLabels })}><i /><span>{config.navigation.showLabels ? 'Labels visibles' : 'Icônes uniquement'}</span></button></Field></div><div className="interface-nav-preview" style={{ background: config.navigation.background, color: config.navigation.color, minHeight: config.navigation.height }}>{ICON_SETS[config.icons.library].map((Icon, index) => <span key={index} style={index === 1 ? { background: config.navigation.activeBackground } : undefined}><Icon size={config.icons.size} style={{ color: index === 1 ? config.icons.activeColor : config.icons.color }} />{config.navigation.showLabels && <small>{[config.navigation.homeLabel, config.navigation.lensLabel, config.navigation.aiLabel, config.navigation.cartLabel, config.navigation.accountLabel][index]}</small>}</span>)}</div></section>
        </>}

        {panel === 'layout' && <>
          <section className="admin-card interface-card"><header><div><LayoutGrid size={19} /><div><h2>Mise en page globale</h2><p>Largeur, respiration, cartes, bordures et ombres de toute l’interface.</p></div></div></header><div className="admin-form"><Field label={`Espace entre sections · ${config.layout.sectionGap}px`}><input disabled={!canWrite} type="range" min="0" max="120" step="4" value={config.layout.sectionGap} onChange={(event) => patch('layout', { sectionGap: Number(event.target.value) })} /></Field><Field label={`Largeur de contenu · ${config.layout.maxWidth}px`}><input disabled={!canWrite} type="range" min="880" max="1800" step="20" value={config.layout.maxWidth} onChange={(event) => patch('layout', { maxWidth: Number(event.target.value) })} /></Field><Field label={`Marge latérale · ${config.layout.pagePadding}px`}><input disabled={!canWrite} type="range" min="0" max="64" step="2" value={config.layout.pagePadding} onChange={(event) => patch('layout', { pagePadding: Number(event.target.value) })} /></Field><Field label={`Courbure cartes · ${config.layout.cardRadius}px`}><input disabled={!canWrite} type="range" min="0" max="48" value={config.layout.cardRadius} onChange={(event) => patch('layout', { cardRadius: Number(event.target.value) })} /></Field><Field label={`Bordure cartes · ${config.layout.cardBorderWidth}px`}><input disabled={!canWrite} type="range" min="0" max="4" value={config.layout.cardBorderWidth} onChange={(event) => patch('layout', { cardBorderWidth: Number(event.target.value) })} /></Field><Field label="Intensité des ombres"><Select disabled={!canWrite} value={config.layout.shadow} onChange={(event) => patch('layout', { shadow: event.target.value as any })} options={selectOptions([['none', 'Aucune'], ['soft', 'Douce'], ['strong', 'Forte']])} /></Field></div></section>
          <section className="admin-card interface-card"><header><div><SlidersHorizontal size={19} /><div><h2>Slider & mouvement</h2><p>Rythme du Hero et contrôles de navigation.</p></div></div></header><div className="admin-form"><Field label={`Temps par slide · ${(config.slider.duration / 1000).toFixed(1)} s`}><input disabled={!canWrite} type="range" min="2000" max="20000" step="500" value={config.slider.duration} onChange={(event) => patch('slider', { duration: Number(event.target.value) })} /></Field><Field label={`Transition · ${(config.slider.transition / 1000).toFixed(2)} s`}><input disabled={!canWrite} type="range" min="150" max="2500" step="50" value={config.slider.transition} onChange={(event) => patch('slider', { transition: Number(event.target.value) })} /></Field>{([['autoplay', 'Lecture automatique'], ['showArrows', 'Flèches précédent/suivant'], ['showDots', 'Points de navigation']] as const).map(([key, label]) => <Field key={key} label={label}><button type="button" disabled={!canWrite} className={`admin-switch ${config.slider[key] ? 'is-on' : ''}`} onClick={() => patch('slider', { [key]: !config.slider[key] })}><i /><span>{config.slider[key] ? 'Activé' : 'Désactivé'}</span></button></Field>)}</div></section>
        </>}
      </div>

      <aside className="interface-studio-preview"><span>APERÇU GLOBAL EN DIRECT</span><div className="interface-mini-browser" style={{ background: config.colors.pageBackground, color: config.typography.textColor, fontFamily: config.typography.body, borderColor: config.colors.borderColor }}><header style={{ background: config.colors.headerBackground, color: config.colors.headerText }}><img src={config.logoUrl} alt="AYROVI" /><strong style={{ fontFamily: config.typography.display }}>AYROVI</strong></header><div className="interface-mini-announcement" style={{ background: config.colors.announcementBackground, color: config.colors.announcementText }}>Livraison dans toute la Tunisie</div><section style={{ background: config.colors.heroBackground, color: config.colors.heroText }}><b style={{ fontFamily: config.typography.display }}>Votre interface, votre identité.</b><small>FR · العربية</small><button style={{ background: config.buttons.background, color: config.buttons.color, border: `${config.buttons.borderWidth}px solid ${config.buttons.borderColor}`, borderRadius: config.buttons.shape === 'pill' ? 999 : config.buttons.shape === 'square' ? 0 : config.buttons.radius }}>Commander</button></section><article style={{ background: config.colors.surfaceBackground, borderColor: config.colors.borderColor }}><strong style={{ color: config.typography.headingColor, fontFamily: config.typography.display }}>Surface produit</strong><p style={{ color: config.typography.textColor }}>Couleurs, textes et composants pilotés depuis واجهتي.</p></article><nav style={{ background: config.navigation.background, color: config.navigation.color }}><IconLibraryPreview config={config.icons} compact /></nav></div><small>La publication applique ces tokens à la boutique, aux drawers, au compte, à AYROVIX et à la navigation. Les contenus métier restent gérés dans leurs modules dédiés.</small></aside>
    </div>
    {toast && <Toast {...toast} />}
  </>;
};
