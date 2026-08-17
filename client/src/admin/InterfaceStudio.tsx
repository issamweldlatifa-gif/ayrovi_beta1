import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Image as ImageIcon, LayoutGrid, MousePointer2, Navigation, Palette, Save, SlidersHorizontal, Type } from 'lucide-react';
import { DEFAULT_INTERFACE_CONFIG, normalizeInterfaceConfig, type InterfaceSectionConfig, type PublicInterfaceConfig } from '../config/interfaceConfig';
import { adminApi } from './api';
import { Button, Field, ImageUploader, Select, Toast } from './components';

const SECTION_LABELS: Record<InterfaceSectionConfig['id'], string> = {
  hero: 'Hero & slider',
  cms: 'Contenus & onglets',
  brands: 'Marques partenaires',
  about: 'Pourquoi AYROVI',
  footer: 'Pied de page',
};
const PANEL_ICONS = { sections: LayoutGrid, typography: Type, controls: MousePointer2, navigation: Navigation, slider: SlidersHorizontal };
type Panel = keyof typeof PANEL_ICONS;
const selectOptions = (items: Array<[string, string]>) => items.map(([value, label]) => ({ value, label }));

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
  const patch = <K extends 'typography' | 'buttons' | 'icons' | 'navigation' | 'slider' | 'layout'>(key: K, value: Partial<PublicInterfaceConfig[K]>) => setConfig((current) => ({ ...current, [key]: { ...current[key], ...value } }));
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
  const save = async () => {
    if (!settingId) return;
    setBusy(true);
    try {
      const normalized = normalizeInterfaceConfig(config);
      await adminApi(`/settings/${settingId}`, { method: 'PUT', body: JSON.stringify({ value: normalized }) });
      setConfig(normalized);
      setToast({ message: 'واجهتي publiée. Les choix seront appliqués à la prochaine ouverture ou actualisation du site.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message || 'Publication impossible.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="admin-page-loading"><span /><p>Chargement de واجهتي…</p></div>;

  return <>
    <div className="admin-page-header">
      <div><span className="admin-eyebrow">AYROVI ADMIN · VISUAL CONTROL</span><h1>واجهتي</h1><p>Contrôlez les sections publiques, leurs images et contenus, la typographie, les boutons, les icônes, la navigation et le rythme des sliders depuis un seul studio.</p></div>
      {canWrite && <Button busy={busy} onClick={save}><Save size={17} />Publier واجهتي</Button>}
    </div>

    <div className="interface-studio-layout">
      <aside className="interface-studio-tabs" aria-label="Outils واجهتي">
        {(Object.keys(PANEL_ICONS) as Panel[]).map((id) => { const Icon = PANEL_ICONS[id]; const labels: Record<Panel, string> = { sections: 'Sections & images', typography: 'Textes & polices', controls: 'Boutons & icônes', navigation: 'Navigation', slider: 'Slider & mouvement' }; return <button key={id} type="button" className={panel === id ? 'is-active' : ''} onClick={() => setPanel(id)}><Icon size={17} /><span>{labels[id]}</span></button>; })}
      </aside>

      <div className="interface-studio-content">
        {panel === 'sections' && <>
          <section className="admin-card interface-card"><header><div><ImageIcon size={19} /><div><h2>Logo public</h2><p>Le logo officiel utilisé par les surfaces administrables.</p></div></div></header><ImageUploader value={config.logoUrl} onChange={(logoUrl) => update('logoUrl', logoUrl || DEFAULT_INTERFACE_CONFIG.logoUrl)} label="Remplacer le logo" /></section>
          <section className="admin-card interface-card"><header><div><LayoutGrid size={19} /><div><h2>Ordre, visibilité, contenus et images</h2><p>Les flèches modifient l’ordre réel de la page. Une image ajoutée devient le visuel administré du bloc.</p></div></div></header>
            <div className="interface-section-list">{orderedSections.map((section, index) => <article key={section.id} className={!section.visible ? 'is-hidden' : ''}>
              <div className="interface-section-toolbar"><div><span>{String(index + 1).padStart(2, '0')}</span><strong>{SECTION_LABELS[section.id]}</strong></div><div><button type="button" disabled={!canWrite || index === 0} onClick={() => move(section.id, -1)} aria-label="Monter"><ArrowUp size={15} /></button><button type="button" disabled={!canWrite || index === orderedSections.length - 1} onClick={() => move(section.id, 1)} aria-label="Descendre"><ArrowDown size={15} /></button><button type="button" disabled={!canWrite} className={section.visible ? 'is-visible' : ''} onClick={() => patchSection(section.id, { visible: !section.visible })}>{section.visible ? <Eye size={15} /> : <EyeOff size={15} />}{section.visible ? 'Visible' : 'Masqué'}</button></div></div>
              <div className="admin-form interface-section-form"><Field label="Titre" full><input disabled={!canWrite} value={section.title} onChange={(event) => patchSection(section.id, { title: event.target.value })} placeholder="Titre du bloc (facultatif)" /></Field><Field label="Sous-titre / contenu court" full><textarea disabled={!canWrite} rows={2} value={section.subtitle} onChange={(event) => patchSection(section.id, { subtitle: event.target.value })} /></Field><Field label="Image du bloc" hint={section.id === 'hero' ? 'Remplace visuellement la première slide du Hero.' : 'Affichée comme couverture administrée au-dessus du bloc.'} full><ImageUploader value={section.image} onChange={(image) => patchSection(section.id, { image })} label={`Ajouter l’image ${SECTION_LABELS[section.id]}`} /></Field></div>
            </article>)}</div>
          </section>
        </>}

        {panel === 'typography' && <section className="admin-card interface-card"><header><div><Type size={19} /><div><h2>Textes, polices et alignement</h2><p>Les valeurs alimentent les tokens globaux sans supprimer les variantes FR/AR.</p></div></div></header><div className="admin-form">
          <Field label="Police des titres"><Select disabled={!canWrite} value={config.typography.display} onChange={(event) => patch('typography', { display: event.target.value })} options={selectOptions([[DEFAULT_INTERFACE_CONFIG.typography.display, 'Plus Jakarta Sans'], ["'Inter', 'Segoe UI', sans-serif", 'Inter'], ["Georgia, 'Times New Roman', serif", 'Georgia éditoriale']])} /></Field>
          <Field label="Police du contenu"><Select disabled={!canWrite} value={config.typography.body} onChange={(event) => patch('typography', { body: event.target.value })} options={selectOptions([[DEFAULT_INTERFACE_CONFIG.typography.body, 'Inter'], [DEFAULT_INTERFACE_CONFIG.typography.display, 'Plus Jakarta Sans'], ["Arial, Helvetica, sans-serif", 'Arial']])} /></Field>
          <Field label={`Taille de base · ${config.typography.baseSize}px`}><input disabled={!canWrite} type="range" min="14" max="20" value={config.typography.baseSize} onChange={(event) => patch('typography', { baseSize: Number(event.target.value) })} /></Field>
          <Field label="Alignement"><Select disabled={!canWrite} value={config.typography.align} onChange={(event) => patch('typography', { align: event.target.value as any })} options={selectOptions([['start', 'Début (adapté LTR/RTL)'], ['center', 'Centré'], ['end', 'Fin (adapté LTR/RTL)']])} /></Field>
          <Field label="Couleur des titres"><input disabled={!canWrite} type="color" value={config.typography.headingColor} onChange={(event) => patch('typography', { headingColor: event.target.value })} /></Field><Field label="Couleur du texte secondaire"><input disabled={!canWrite} type="color" value={config.typography.textColor} onChange={(event) => patch('typography', { textColor: event.target.value })} /></Field>
          <Field label={`Espace entre sections · ${config.layout.sectionGap}px`}><input disabled={!canWrite} type="range" min="0" max="120" step="4" value={config.layout.sectionGap} onChange={(event) => patch('layout', { sectionGap: Number(event.target.value) })} /></Field><Field label={`Largeur de contenu · ${config.layout.maxWidth}px`}><input disabled={!canWrite} type="range" min="960" max="1600" step="40" value={config.layout.maxWidth} onChange={(event) => patch('layout', { maxWidth: Number(event.target.value) })} /></Field>
        </div></section>}

        {panel === 'controls' && <div className="admin-report-grid">
          <section className="admin-card interface-card"><header><div><MousePointer2 size={19} /><div><h2>Boutons</h2><p>Couleurs, forme, taille et courbure.</p></div></div></header><div className="admin-form"><Field label="Fond"><input disabled={!canWrite} type="color" value={config.buttons.background} onChange={(event) => patch('buttons', { background: event.target.value })} /></Field><Field label="Texte"><input disabled={!canWrite} type="color" value={config.buttons.color} onChange={(event) => patch('buttons', { color: event.target.value })} /></Field><Field label="Forme"><Select disabled={!canWrite} value={config.buttons.shape} onChange={(event) => patch('buttons', { shape: event.target.value as any })} options={selectOptions([['soft', 'Douce'], ['pill', 'Pilule'], ['square', 'Carrée']])} /></Field><Field label={`Hauteur · ${config.buttons.height}px`}><input disabled={!canWrite} type="range" min="40" max="60" value={config.buttons.height} onChange={(event) => patch('buttons', { height: Number(event.target.value) })} /></Field><Field label={`Courbure · ${config.buttons.radius}px`} full><input disabled={!canWrite} type="range" min="0" max="40" value={config.buttons.radius} onChange={(event) => patch('buttons', { radius: Number(event.target.value) })} /></Field></div><button type="button" className="interface-live-button" style={{ background: config.buttons.background, color: config.buttons.color, minHeight: config.buttons.height, borderRadius: config.buttons.shape === 'pill' ? 999 : config.buttons.shape === 'square' ? 0 : config.buttons.radius }}>Aperçu du bouton</button></section>
          <section className="admin-card interface-card"><header><div><Palette size={19} /><div><h2>Icônes</h2><p>Bibliothèque Lucide AYROVI, style, couleur et taille.</p></div></div></header><div className="admin-form"><Field label="Bibliothèque"><Select disabled={!canWrite} value={config.icons.library} onChange={(event) => patch('icons', { library: event.target.value as any })} options={selectOptions([['ayrovi', 'AYROVI — pictogrammes maison'], ['lucide', 'Lucide — interface universelle']])} /></Field><Field label="Couleur"><input disabled={!canWrite} type="color" value={config.icons.color} onChange={(event) => patch('icons', { color: event.target.value })} /></Field><Field label="Style"><Select disabled={!canWrite} value={config.icons.style} onChange={(event) => patch('icons', { style: event.target.value as any })} options={selectOptions([['outline', 'Contour'], ['solid', 'Plein']])} /></Field><Field label={`Taille · ${config.icons.size}px`} full><input disabled={!canWrite} type="range" min="14" max="36" value={config.icons.size} onChange={(event) => patch('icons', { size: Number(event.target.value) })} /></Field></div><div className="interface-icon-preview" style={{ color: config.icons.color }}><Navigation size={config.icons.size} fill={config.icons.style === 'solid' ? 'currentColor' : 'none'} /><Eye size={config.icons.size} fill={config.icons.style === 'solid' ? 'currentColor' : 'none'} /><ImageIcon size={config.icons.size} fill={config.icons.style === 'solid' ? 'currentColor' : 'none'} /></div></section>
        </div>}

        {panel === 'navigation' && <section className="admin-card interface-card"><header><div><Navigation size={19} /><div><h2>Bottom navigation</h2><p>Les icônes restent blanches pour la lisibilité. Vous contrôlez le fond neutre, l’état actif, les labels et la hauteur.</p></div></div></header><div className="admin-form"><Field label="Fond"><input disabled={!canWrite} type="color" value={config.navigation.background} onChange={(event) => patch('navigation', { background: event.target.value })} /></Field><Field label="Fond actif"><input disabled={!canWrite} type="color" value={config.navigation.activeBackground} onChange={(event) => patch('navigation', { activeBackground: event.target.value })} /></Field><Field label="Label Lens"><input disabled={!canWrite} value={config.navigation.lensLabel} onChange={(event) => patch('navigation', { lensLabel: event.target.value })} /></Field><Field label="Label AI"><input disabled={!canWrite} value={config.navigation.aiLabel} onChange={(event) => patch('navigation', { aiLabel: event.target.value })} /></Field><Field label="Label Vision"><input disabled={!canWrite} value={config.navigation.visionLabel} onChange={(event) => patch('navigation', { visionLabel: event.target.value })} /></Field><Field label={`Hauteur · ${config.navigation.height}px`}><input disabled={!canWrite} type="range" min="60" max="88" value={config.navigation.height} onChange={(event) => patch('navigation', { height: Number(event.target.value) })} /></Field><Field label="Afficher les labels" full><button type="button" disabled={!canWrite} className={`admin-switch ${config.navigation.showLabels ? 'is-on' : ''}`} onClick={() => patch('navigation', { showLabels: !config.navigation.showLabels })}><i /><span>{config.navigation.showLabels ? 'Labels visibles' : 'Icônes uniquement'}</span></button></Field></div><div className="interface-nav-preview" style={{ background: config.navigation.background, minHeight: config.navigation.height }}>{['lensLabel', 'aiLabel', 'visionLabel'].map((key, index) => <span key={key} style={index === 1 ? { background: config.navigation.activeBackground } : undefined}><Eye size={20} />{config.navigation.showLabels && <small>{String(config.navigation[key as keyof typeof config.navigation])}</small>}</span>)}</div></section>}

        {panel === 'slider' && <section className="admin-card interface-card"><header><div><SlidersHorizontal size={19} /><div><h2>Slider & mouvement</h2><p>Contrôlez le rythme du Hero sans empêcher la navigation manuelle.</p></div></div></header><div className="admin-form"><Field label={`Temps par slide · ${(config.slider.duration / 1000).toFixed(1)} s`}><input disabled={!canWrite} type="range" min="2000" max="20000" step="500" value={config.slider.duration} onChange={(event) => patch('slider', { duration: Number(event.target.value) })} /></Field><Field label={`Transition · ${(config.slider.transition / 1000).toFixed(2)} s`}><input disabled={!canWrite} type="range" min="150" max="2500" step="50" value={config.slider.transition} onChange={(event) => patch('slider', { transition: Number(event.target.value) })} /></Field>{([['autoplay', 'Lecture automatique'], ['showArrows', 'Flèches précédent/suivant'], ['showDots', 'Points de navigation']] as const).map(([key, label]) => <Field key={key} label={label}><button type="button" disabled={!canWrite} className={`admin-switch ${config.slider[key] ? 'is-on' : ''}`} onClick={() => patch('slider', { [key]: !config.slider[key] })}><i /><span>{config.slider[key] ? 'Activé' : 'Désactivé'}</span></button></Field>)}</div></section>}
      </div>

      <aside className="interface-studio-preview"><span>APERÇU DES TOKENS</span><div style={{ fontFamily: config.typography.body, color: config.typography.textColor }}><img src={config.logoUrl} alt="AYROVI" /><strong style={{ fontFamily: config.typography.display, color: config.typography.headingColor }}>AYROVI</strong><p>Une interface claire, locale et administrable.</p><button style={{ background: config.buttons.background, color: config.buttons.color, minHeight: config.buttons.height, borderRadius: config.buttons.shape === 'pill' ? 999 : config.buttons.shape === 'square' ? 0 : config.buttons.radius }}>Commander</button></div><small>Le preview final dépend aussi des contenus Hero, produits, marques et مجلتي gérés dans leurs sections dédiées.</small></aside>
    </div>
    {toast && <Toast {...toast} />}
  </>;
};
