import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from '../components/QatafoIcons';
import { Button, Field, Toast } from './components';
import { adminApi } from './api';
import {
  Bell, CheckCircle2, CreditCard, Globe2, Lock, MapPin, MessageCircle, PackageCheck, Phone,
  RefreshCw, ShieldCheck, Star, Truck, Zap,
} from '../components/QatafoIcons';

/**
 * AYROVI TRUST BAR — إدارة المحتوى والألوان فقط.
 * البنية والتخطيط والحركة محكومة بالكود ولا تُعرض هنا.
 */

const ICON_OPTIONS = ['ShieldCheck', 'Truck', 'Lock', 'Zap', 'MessageCircle', 'PackageCheck', 'Phone', 'CreditCard', 'MapPin', 'Star', 'CheckCircle2', 'RefreshCw', 'Bell', 'Globe2'];
const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = { ShieldCheck, Truck, Lock, Zap, MessageCircle, PackageCheck, Phone, CreditCard, MapPin, Star, CheckCircle2, RefreshCw, Bell, Globe2 };

interface TrustItemRow {
  id: string; title: string; description: string; icon: string; enabled: boolean; sortOrder: number;
  titleColor: string; descriptionColor: string; iconColor: string;
}

interface TrustSettings {
  background_color: string; title_color: string; description_color: string; accent_color: string; divider_color: string; enabled: number;
}

const emptyDraft = { id: '', title: '', description: '', icon: 'ShieldCheck', enabled: true, titleColor: '', descriptionColor: '', iconColor: '' };

export const TrustBarPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [items, setItems] = useState<TrustItemRow[]>([]);
  const [settings, setSettings] = useState<TrustSettings>({ background_color: '#111217', title_color: '#FFFFFF', description_color: 'rgba(255,255,255,0.68)', accent_color: '#FF7A00', divider_color: 'rgba(255,255,255,0.15)', enabled: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const dragIndex = useRef<number | null>(null);

  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(null), 3800); return () => window.clearTimeout(t); } }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<any>('/trust-bar');
      setItems(result.data.items || []);
      if (result.data.settings) setSettings(result.data.settings);
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveItem = async () => {
    if (draft.title.trim().length < 2) { setToast({ message: 'Titre requis.', tone: 'error' }); return; }
    setBusy(true);
    try {
      const body = JSON.stringify({ title: draft.title, description: draft.description, icon: draft.icon, enabled: draft.enabled, titleColor: draft.titleColor, descriptionColor: draft.descriptionColor, iconColor: draft.iconColor });
      await adminApi(draft.id ? `/trust-bar/items/${draft.id}` : '/trust-bar/items', { method: draft.id ? 'PUT' : 'POST', body });
      setToast({ message: 'Élément enregistré.', tone: 'success' });
      setModalOpen(false); setDraft(emptyDraft);
      await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const toggleEnabled = async (row: TrustItemRow) => {
    setBusy(true);
    try { await adminApi(`/trust-bar/items/${row.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !row.enabled }) }); await load(); }
    catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const removeItem = async (row: TrustItemRow) => {
    setBusy(true);
    try { await adminApi(`/trust-bar/items/${row.id}`, { method: 'DELETE' }); setToast({ message: 'Élément supprimé.', tone: 'success' }); await load(); }
    catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await adminApi('/trust-bar/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setToast({ message: 'Réglages enregistrés.', tone: 'success' });
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  // Drag & Drop reorder
  const commitOrder = async (nextItems: TrustItemRow[]) => {
    setItems(nextItems);
    try { await adminApi('/trust-bar/reorder', { method: 'PUT', body: JSON.stringify({ ids: nextItems.map((item) => item.id) }) }); setToast({ message: 'Ordre mis à jour.', tone: 'success' }); }
    catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); await load(); }
  };
  const onDrop = (index: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    void commitOrder(next);
  };

  const previewItems = useMemo(() => items.filter((item) => item.enabled), [items]);

  const colorField = (label: string, key: keyof TrustSettings, fallback: string) => (
    <Field label={`${label} (défaut ${fallback})`}>
      <input type="text" value={String(settings[key] ?? '')} disabled={!canWrite} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} placeholder={fallback} />
    </Field>
  );

  return (
    <div className="admin-trustbar-page">
      {toast && <Toast message={toast.message} tone={toast.tone} />}

      {/* إعدادات عامة */}
      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head"><div><h3>Réglages du bandeau</h3><p>Couleurs globales — les valeurs par défaut restent l’identité AYROVI.</p></div></div>
        <div className="admin-trustbar-grid">
          {colorField('Fond', 'background_color', '#111217')}
          {colorField('Titres', 'title_color', '#FFFFFF')}
          {colorField('Descriptions', 'description_color', 'rgba(255,255,255,0.68)')}
          {colorField('Accent', 'accent_color', '#FF7A00')}
          {colorField('Séparateurs', 'divider_color', 'rgba(255,255,255,0.15)')}
          <Field label="Bandeau activé">
            <label className="admin-toggle"><input type="checkbox" checked={Boolean(settings.enabled)} disabled={!canWrite} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked ? 1 : 0 })} /><span /> Visible sur le site</label>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}><Button disabled={busy || !canWrite} onClick={() => void saveSettings()}>Enregistrer les réglages</Button></div>
      </section>

      {/* معاينة حية */}
      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head">
          <div><h3>Aperçu en direct</h3><p>Exactement ce que verra le visiteur.</p></div>
          <div className="admin-preview-toggle">
            <button type="button" className={previewMode === 'desktop' ? 'is-active' : ''} onClick={() => setPreviewMode('desktop')}>Desktop</button>
            <button type="button" className={previewMode === 'mobile' ? 'is-active' : ''} onClick={() => setPreviewMode('mobile')}>Mobile</button>
          </div>
        </div>
        <div className={`admin-trustbar-preview ${previewMode}`} style={{ background: settings.background_color, borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {previewMode === 'desktop' ? (
            <div className="trust-bar__row" style={{ display: 'flex' }}>
              {previewItems.map((item, index) => (
                <React.Fragment key={item.id}>
                  {index > 0 && <span className="trust-bar__divider" style={{ width: 1, alignSelf: 'stretch', background: settings.divider_color }} />}
                  <div className="trust-bar__item">
                    <span className="trust-bar__icon">{React.createElement(ICON_COMPONENTS[item.icon] || ShieldCheck, { className: 'h-8 w-8', style: { color: item.iconColor || '#FFFFFF' } })}</span>
                    <div className="trust-bar__text">
                      <strong className="trust-bar__title" style={{ color: item.titleColor || settings.title_color }}>{item.title}</strong>
                      <span className="trust-bar__desc" style={{ color: item.descriptionColor || settings.description_color }}>{item.description}</span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="trust-bar__item" style={{ minWidth: 240 }}>
              <span className="trust-bar__icon">{React.createElement(ICON_COMPONENTS[previewItems[0]?.icon] || ShieldCheck, { className: 'h-7 w-7', style: { color: previewItems[0]?.iconColor || '#FFFFFF' } })}</span>
              <div className="trust-bar__text">
                <strong className="trust-bar__title" style={{ color: previewItems[0]?.titleColor || settings.title_color }}>{previewItems[0]?.title}</strong>
                <span className="trust-bar__desc" style={{ color: previewItems[0]?.descriptionColor || settings.description_color }}>{previewItems[0]?.description}</span>
              </div>
              <span style={{ marginInlineStart: 'auto', color: settings.accent_color, fontSize: 11, fontWeight: 700 }}>{previewItems.length} avantages — glissez sur le site</span>
            </div>
          )}
        </div>
      </section>

      {/* العناصر */}
      <section className="admin-list-card">
        <div className="admin-card-head">
          <div><h3>Éléments ({items.length})</h3><p>Glissez-déposez pour réordonner — l’ordre s’enregistre automatiquement.</p></div>
          {canWrite && <Button onClick={() => { setDraft(emptyDraft); setModalOpen(true); }}><Plus size={16} /> Ajouter</Button>}
        </div>
        {loading ? <p className="admin-empty">Chargement…</p> : (
          <table className="admin-table">
            <thead><tr><th /><th>Icône</th><th>Titre</th><th>Description</th><th>Statut</th><th>Ordre</th><th /></tr></thead>
            <tbody>
              {items.map((row, index) => (
                <tr
                  key={row.id}
                  draggable={canWrite}
                  onDragStart={() => { dragIndex.current = index; }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDrop(index)}
                  className={row.enabled ? '' : 'is-muted'}
                >
                  <td style={{ cursor: canWrite ? 'grab' : 'default', color: '#9ca3af', width: 26 }} title="Glisser">⋮⋮</td>
                  <td>{React.createElement(ICON_COMPONENTS[row.icon] || ShieldCheck, { className: 'h-6 w-6', style: { color: row.iconColor || settings.title_color } })}</td>
                  <td><strong>{row.title}</strong></td>
                  <td className="admin-trustbar-desc">{row.description}</td>
                  <td>
                    <label className="admin-toggle">
                      <input type="checkbox" checked={row.enabled} disabled={!canWrite || busy} onChange={() => void toggleEnabled(row)} />
                      <span />
                    </label>
                  </td>
                  <td>{row.sortOrder}</td>
                  <td>
                    {canWrite && (
                      <div className="admin-row-actions">
                        <button type="button" title="Modifier" onClick={() => { setDraft({ ...row, titleColor: row.titleColor || '', descriptionColor: row.descriptionColor || '', iconColor: row.iconColor || '' }); setModalOpen(true); }}>✎</button>
                        <button type="button" title="Supprimer" onClick={() => void removeItem(row)}><X size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={7} className="admin-empty">Aucun élément — le site affiche la configuration par défaut.</td></tr>}
            </tbody>
          </table>
        )}
      </section>

      {/* نافذة التحرير */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="admin-card modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="admin-card-head"><div><h3>{draft.id ? 'Modifier l’élément' : 'Nouvel élément'}</h3><p>Contenu uniquement — la structure reste fixe.</p></div></div>
            <Field label="Titre *"><input type="text" value={draft.title} maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Description"><input type="text" value={draft.description} maxLength={160} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
            <Field label="Icône (bibliothèque AYROVI uniquement)">
              <div className="admin-icon-picker">
                {ICON_OPTIONS.map((icon) => (
                  <button type="button" key={icon} className={draft.icon === icon ? 'is-active' : ''} onClick={() => setDraft({ ...draft, icon })} title={icon}>
                    {React.createElement(ICON_COMPONENTS[icon], { className: 'h-6 w-6' })}
                  </button>
                ))}
              </div>
            </Field>
            <div className="admin-trustbar-grid">
              <Field label="Couleur titre (vide = défaut)"><input type="text" value={draft.titleColor} placeholder="#FFFFFF" onChange={(event) => setDraft({ ...draft, titleColor: event.target.value })} /></Field>
              <Field label="Couleur description"><input type="text" value={draft.descriptionColor} placeholder="rgba(255,255,255,0.68)" onChange={(event) => setDraft({ ...draft, descriptionColor: event.target.value })} /></Field>
              <Field label="Couleur icône"><input type="text" value={draft.iconColor} placeholder="#FFFFFF" onChange={(event) => setDraft({ ...draft, iconColor: event.target.value })} /></Field>
              <Field label="Activé">
                <label className="admin-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span /> Visible</label>
              </Field>
            </div>
            <div className="admin-hero-actions" style={{ marginTop: 14 }}>
              <Button variant="primary" disabled={busy} onClick={() => void saveItem()}>Enregistrer</Button>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
