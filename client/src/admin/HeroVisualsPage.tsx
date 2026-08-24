import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, RefreshCw, X } from '../components/QatafoIcons';
import { Button, ConfirmDialog, Field, StatusBadge, Toast } from './components';
import { adminApi } from './api';

/**
 * HERO MANAGEMENT — إدارة الـ Visual فقط.
 * محتوى الـ Hero (Headline/Description/Typography/Colors/Layout) ثابت في الكود ولا يظهر هنا إطلاقاً.
 */

const HERO_HEADLINE = 'Vous le voyez. AYROVI vous le livre.';
const HERO_DESCRIPTION = 'Mode, beauté, technologie, maison… trouvez votre produit en ligne, envoyez-nous son lien ou sa photo, et AYROVI s’occupe de l’achat, de l’importation et de la livraison.';

interface HeroVisualRow {
  id: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  mobileImageUrl: string;
  altText: string;
  focalX: number;
  focalY: number;
  mobileFocalX?: number;
  mobileFocalY?: number;
  overlayMode?: 'AUTO' | 'MANUAL';
  overlayStrength?: number | null;
  analysis?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  startDate: string | null;
  endDate: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface HeroMeta { warnings?: string[]; width?: number; height?: number }

const toInputDate = (iso: string | null): string => (iso ? String(iso).slice(0, 10) : '');

const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-TN') : '—');

export const HeroVisualsPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [rows, setRows] = useState<HeroVisualRow[]>([]);
  const [active, setActive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // نموذج الرفع
  const [file, setFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [focalX, setFocalX] = useState(0.5);
  const [focalY, setFocalY] = useState(0.5);
  const [mobileFocalX, setMobileFocalX] = useState(0.5);
  const [mobileFocalY, setMobileFocalY] = useState(0.5);
  const [overlayMode, setOverlayMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [overlayStrength, setOverlayStrength] = useState(0.3);
  const [analysis, setAnalysis] = useState<{ luminance: number; brightness: string; dominantColor: string } | null>(null);
  const [meta, setMeta] = useState<HeroMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HeroVisualRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<any>('/hero-visuals');
      setRows(result.data || []);
      setActive(result.active || null);
    } catch (reason: any) {
      setToast({ message: reason.message, tone: 'error' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const resetForm = () => {
    setFile(null); setMobileFile(null); setAltText(''); setStartDate(''); setEndDate('');
    setFocalX(0.5); setFocalY(0.5); setMobileFocalX(0.5); setMobileFocalY(0.5); setOverlayMode('AUTO'); setOverlayStrength(0.3); setAnalysis(null); setMeta(null); setPreviewUrl(''); setEditId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPickFile = (picked: File | null) => {
    setFile(picked);
    setMeta(null);
    setPreviewUrl(picked ? URL.createObjectURL(picked) : '');
    setEditId(null);
  };

  const warnings = useMemo(() => {
    if (meta?.warnings?.length) return meta.warnings;
    if (!file) return [];
    return ['Aperçu local — les contrôles serveur s’appliqueront au téléversement.'];
  }, [meta, file]);

  const submit = async (publishNow: boolean) => {
    if (!file && !editId) { setToast({ message: 'Choisissez d’abord une image principale.', tone: 'error' }); return; }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.append('image', file);
      if (mobileFile) form.append('mobileImage', mobileFile);
      form.append('altText', altText);
      if (startDate) form.append('startDate', startDate);
      if (endDate) form.append('endDate', endDate);
      form.append('focalX', String(focalX));
      form.append('focalY', String(focalY));
      form.append('mobileFocalX', String(mobileFocalX));
      form.append('mobileFocalY', String(mobileFocalY));
      form.append('overlayMode', overlayMode);
      form.append('overlayStrength', overlayMode === 'MANUAL' ? String(overlayStrength) : '');
      const created = await adminApi<any>(editId ? `/hero-visuals/${editId}` : '/hero-visuals', {
        method: editId ? 'PUT' : 'POST',
        body: form,
      });
      const id: string = editId || created?.data?.id;
      if (created?.meta?.desktop) {
        setMeta({ warnings: created.meta.desktop.warnings, width: created.meta.desktop.width, height: created.meta.desktop.height });
        if (created.meta.desktop.analysis) setAnalysis(created.meta.desktop.analysis);
      }
      if (publishNow && id) await adminApi(`/hero-visuals/${id}/publish`, { method: 'POST' });
      setToast({ message: publishNow ? 'Visual publié — le Hero est à jour.' : 'Brouillon enregistré. Publiez quand vous êtes prêt.', tone: 'success' });
      if (publishNow) resetForm();
      await load();
    } catch (reason: any) {
      setToast({ message: reason.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const setSchedule = async (row: HeroVisualRow, dates: { startDate?: string; endDate?: string }) => {
    setBusy(true);
    try {
      await adminApi(`/hero-visuals/${row.id}`, { method: 'PUT', body: JSON.stringify(dates) });
      setToast({ message: 'Planification mise à jour.', tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const publish = async (row: HeroVisualRow) => {
    setBusy(true);
    try {
      await adminApi(`/hero-visuals/${row.id}/publish`, { method: 'POST' });
      setToast({ message: 'Visual publié.', tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const unpublish = async (row: HeroVisualRow) => {
    setBusy(true);
    try {
      await adminApi(`/hero-visuals/${row.id}/unpublish`, { method: 'POST' });
      setToast({ message: 'Visual dépublié.', tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi(`/hero-visuals/${deleteTarget.id}`, { method: 'DELETE' });
      setToast({ message: 'Visual supprimé.', tone: 'success' });
      setDeleteTarget(null);
      await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  // معاينة Full-Bleed — كما سيظهر فعلاً (نص فوق الصورة + overlay تكيفي)
  const overlayFor = () => {
    const strength = overlayMode === 'MANUAL' ? overlayStrength : (analysis ? (analysis.luminance < 0.35 ? 0.18 : analysis.luminance > 0.6 ? 0.5 : 0.32) : 0.32);
    return `linear-gradient(180deg, rgba(11,12,16,${0.38 + strength * 0.32}) 0%, rgba(11,12,16,${strength * 0.42}) 46%, rgba(11,12,16,${strength * 0.8}) 100%)`;
  };
  const PreviewFrame: React.FC<{ label: string; frameClass: string; mode?: 'desktop' | 'mobile' }> = ({ label, frameClass, mode = 'desktop' }) => {
    const url = previewUrl || rows.find((row) => row.id === editId)?.imageUrl || active?.imageUrl || '';
    const isMobileFrame = mode === 'mobile';
    const fx = isMobileFrame ? mobileFocalX : focalX;
    const fy = isMobileFrame ? mobileFocalY : focalY;
    const onPick = canWrite ? (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      if (isMobileFrame) { setMobileFocalX(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))); setMobileFocalY(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))); }
      else { setFocalX(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))); setFocalY(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))); }
    } : undefined;
    return (
      <div className="hero-preview">
        <span className="hero-preview__label">{label}</span>
        <div
          className={`hero-fullbleed-preview ${frameClass}`}
          onClick={onPick}
        >
          {url ? <img src={url} alt="" className="hfb-img" style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }} /> : <div className="hero-preview__empty"><ImageIcon /></div>}
          <span aria-hidden style={{ position: 'absolute', inset: 0, background: overlayFor(), zIndex: 1 }} />
          <div className="hero-fullbleed-copy" aria-hidden>
            <span className="hfb-accent" />
            <strong>Vous le voyez.<br /><em>AYROVI</em> vous le livre.</strong>
            <small>Mode, beauté, technologie, maison… trouvez ce que vous cherchez. AYROVI s'occupe du reste.</small>
          </div>
          {url && canWrite && (
            <span className="hero-preview__focal" style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, zIndex: 3 }} />
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="admin-hero-page">
      {toast && <Toast message={toast.message} tone={toast.tone} />}

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head">
          <div>
            <h3>Visual actif</h3>
            <p>Le Hero affiche une seule image à la fois — le contenu texte est fixe et non modifiable.</p>
          </div>
          <StatusBadge status={active?.isDefault ? 'DRAFT' : 'PUBLISHED'} />
        </div>
        <div className="admin-hero-active">
          <div className="hero-preview"><div className="hero-preview__frame frame-desktop"><img src={active?.imageUrl} alt="" style={{ objectPosition: `${(active?.focalX ?? 0.5) * 100}% ${(active?.focalY ?? 0.45) * 100}%` }} /></div></div>
          <dl>
            <div><dt>Statut</dt><dd>{active?.isDefault ? 'Visual par défaut (aucune image publiée)' : 'Publié'}</dd></div>
            <div><dt>Publié le</dt><dd>{active?.publishedAt ? new Date(active.publishedAt).toLocaleString('fr-TN') : '—'}</dd></div>
            <div><dt>Focal point</dt><dd>{Math.round((active?.focalX ?? 0.5) * 100)}% / {Math.round((active?.focalY ?? 0.45) * 100)}%</dd></div>
            <div><dt>Dimensions</dt><dd>{active?.imageWidth}×{active?.imageHeight}px</dd></div>
          </dl>
        </div>
      </section>

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head"><div><h3>Upload Hero Image</h3><p>Upload → Preview → Save/Publish. L’image ne part jamais en ligne sans aperçu.</p></div></div>
        <div className="admin-hero-upload">
          <Field label="Image principale (Desktop) *">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!canWrite} onChange={(event) => onPickFile(event.target.files?.[0] || null)} />
          </Field>
          <Field label="Image mobile (optionnel)">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!canWrite} onChange={(event) => setMobileFile(event.target.files?.[0] || null)} />
          </Field>
          <Field label="Texte alternatif (accessibilité)">
            <input type="text" value={altText} maxLength={200} onChange={(event) => setAltText(event.target.value)} placeholder="Décrivez l’image pour les lecteurs d’écran" />
          </Field>
          <div className="admin-hero-dates">
            <Field label="Start Date (planification)"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
            <Field label="End Date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
          </div>
          <div className="admin-hero-dates">
            <Field label="Overlay (Auto — analyse de l'image)">
              <select value={overlayMode} onChange={(event) => setOverlayMode(event.target.value as 'AUTO' | 'MANUAL')}>
                <option value="AUTO">AUTO — selon la luminosité</option>
                <option value="MANUAL">MANUEL — réglage fin</option>
              </select>
            </Field>
            {overlayMode === 'MANUAL' && (
              <Field label={`Overlay manuel — ${Math.round(overlayStrength * 100)}%`}>
                <input type="range" min={0} max={100} value={Math.round(overlayStrength * 100)} onChange={(event) => setOverlayStrength(Number(event.target.value) / 100)} style={{ width: '100%' }} />
              </Field>
            )}
          </div>
          {analysis && (
            <p className="admin-hero-analysis">
              Analyse auto — luminosité <strong>{analysis.luminance}</strong> ({analysis.brightness === 'dark' ? 'sombre' : analysis.brightness === 'light' ? 'claire' : 'moyenne'})
              · couleur dominante <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: analysis.dominantColor, verticalAlign: 'middle' }} /> <strong>{analysis.dominantColor}</strong>
              {overlayMode === 'AUTO' ? ` · overlay auto ${(analysis.luminance < 0.35 ? 18 : analysis.luminance > 0.6 ? 50 : 32)}%` : ''}
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="admin-hero-warnings">
              {warnings.map((warning) => <li key={warning}><X size={14} /> {warning}</li>)}
            </ul>
          )}
        </div>

        {(previewUrl || editId) && (
          <div className="admin-hero-previews">
            <p className="admin-hero-previews__hint">Cliquez sur l’aperçu Desktop (position ordinateur) ou Mobile (position téléphone) pour régler le cadrage de chaque écran.</p>
            <div className="admin-hero-previews__grid">
              <PreviewFrame label="Desktop (cliquez = position)" frameClass="hfb-frame-desktop" mode="desktop" />
              <PreviewFrame label="Mobile (cliquez = position)" frameClass="hfb-frame-mobile" mode="mobile" />
            </div>
            <div className="admin-hero-actions">
              <Button variant="secondary" disabled={busy || !canWrite} onClick={() => void submit(false)}>Enregistrer le brouillon</Button>
              <Button variant="primary" disabled={busy || !canWrite} onClick={() => void submit(true)}>Publier</Button>
              <Button variant="ghost" disabled={busy} onClick={resetForm}>Réinitialiser</Button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-list-card">
        <div className="admin-card-head"><div><h3>Tous les visuals</h3><p>{rows.length} élément(s) — planifiez, publiez ou supprimez.</p></div></div>
        {loading ? <p className="admin-empty">Chargement…</p> : (
          <table className="admin-table">
            <thead>
              <tr><th>Aperçu</th><th>Statut</th><th>Planification</th><th>Focal</th><th>Publié le</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><div className="admin-hero-thumb"><img src={row.imageUrl} alt="" style={{ objectPosition: `${row.focalX * 100}% ${row.focalY * 100}%` }} /></div></td>
                  <td><StatusBadge status={row.status === 'PUBLISHED' ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td>
                    {row.startDate || row.endDate ? `${dateLabel(row.startDate)} → ${dateLabel(row.endDate)}` : '—'}
                    {canWrite && (
                      <span className="admin-hero-quick">
                        <input type="date" defaultValue={toInputDate(row.startDate)} onChange={(event) => void setSchedule(row, { startDate: event.target.value })} title="Start" />
                        <input type="date" defaultValue={toInputDate(row.endDate)} onChange={(event) => void setSchedule(row, { endDate: event.target.value })} title="End" />
                      </span>
                    )}
                  </td>
                  <td>D {Math.round(row.focalX * 100)}/{Math.round(row.focalY * 100)} · M {Math.round((row.mobileFocalX ?? 0.5) * 100)}/{Math.round((row.mobileFocalY ?? 0.5) * 100)}</td>
                  <td>{row.publishedAt ? new Date(row.publishedAt).toLocaleDateString('fr-TN') : '—'}</td>
                  <td>
                    {canWrite && (
                      <div className="admin-row-actions">
                        <button type="button" title="Ajuster (focal/alt/planification)" onClick={() => { setEditId(row.id); setFocalX(row.focalX); setFocalY(row.focalY); setMobileFocalX(row.mobileFocalX ?? 0.5); setMobileFocalY(row.mobileFocalY ?? 0.5); setOverlayMode(row.overlayMode === 'MANUAL' ? 'MANUAL' : 'AUTO'); setOverlayStrength(typeof row.overlayStrength === 'number' ? row.overlayStrength : 0.3); try { setAnalysis(row.analysis ? JSON.parse(row.analysis) : null); } catch { setAnalysis(null); } setAltText(row.altText); setPreviewUrl(''); setFile(null); }}><RefreshCw size={16} /></button>
                        {row.status === 'PUBLISHED'
                          ? <button type="button" title="Dépublier" onClick={() => void unpublish(row)}><X size={16} /></button>
                          : <button type="button" title="Publier" onClick={() => void publish(row)}>✓</button>}
                        <button type="button" title="Supprimer" onClick={() => setDeleteTarget(row)}><X size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="admin-empty">Aucun visual — le Hero utilise l’image par défaut.</td></tr>}
            </tbody>
          </table>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Supprimer ce visual ?"
          message="L’image et ses versions responsives seront supprimées définitivement."
          confirmLabel="Supprimer"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
