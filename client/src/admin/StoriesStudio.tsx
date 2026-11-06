/** Official editorial Stories. Reuses the authenticated, audited Stories resource.
 * No legacy channels/viewer/shoppable editor in this screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, Field, Modal, Switch } from './components';
import { uploadMediaFile } from './mediaUpload';

type Card = { id: string; title: string; description: string; title_ar: string; description_ar: string;
  media_url: string; priority: number; status: string; publish_at: string; expires_at: string | null };
type Settings = { title: string; subtitle: string; titleAr: string; subtitleAr: string; ctaLabel: string; ctaLabelAr: string; cardCount: number; enabled: boolean };

export const StoriesStudioPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<Card[]>([]);
  const [form, setForm] = useState<Card | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [block, cards] = await Promise.all([
        adminApi<{ data: Settings }>('/stories-showcase'),
        adminApi<{ data: Card[]; pagination: { totalPages: number } }>(`/stories?pageSize=100&page=${page}&sort=priority&direction=desc`),
      ]);
      setSettings(block.data); setRows(cards.data); setPages(cards.pagination.totalPages); setError('');
    } catch (e: any) { setError(e.message || 'Chargement impossible.'); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const saveSettings = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await adminApi('/stories-showcase', { method: 'PUT', body: JSON.stringify({ ...settings, ctaUrl: '', sortOrder: 0 }) });
      setMessage('Conteneur enregistré.');
    } catch (e: any) { setError(e.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const saveCard = async () => {
    if (!form || !form.media_url || form.title.trim().length < 3) { setError('Image et titre (3 caractères minimum) requis.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { id, ...card } = form;
      await adminApi(id ? `/stories/${encodeURIComponent(id)}` : '/stories', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...card, media_type: 'IMAGE', category: 'STYLE',
          content_mode: 'normal', product_id: null, cta: '', target_url: '', secondary_images: [],
          expires_at: form.expires_at || null }),
      });
      setForm(null); await load(); setMessage('Carte enregistrée.');
    } catch (e: any) { setError(e.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const remove = async (card: Card) => {
    if (!window.confirm(`Retirer « ${card.title} » du carrousel ?`)) return;
    setBusy(true); setError('');
    try { await adminApi(`/stories/${encodeURIComponent(card.id)}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setError(e.message || 'Suppression impossible.'); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const url = await uploadMediaFile(file);
      setForm(current => current ? { ...current, media_url: url } : current);
    } catch (e: any) { setError(e.message || 'Envoi impossible.'); }
    finally { setUploading(false); }
  };

  return <div className="admin-grid">
    <section className="admin-card">
      <h3>Stories officielles — conteneur d’accueil</h3>
      <p>Entre À la une et LENS. Cartes éditoriales de mêmes dimensions. Le CTA reste sans destination en attendant son évolution.</p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {settings ? <>
        <fieldset className="admin-form admin-stories-fields" disabled={!canWrite || busy}>
          {(['title', 'subtitle', 'titleAr', 'subtitleAr', 'ctaLabel', 'ctaLabelAr'] as const).map((key, index) => <Field key={key}
            label={['Titre FR', 'Sous-titre FR', 'Titre AR', 'Sous-titre AR', 'Libellé CTA FR', 'Libellé CTA AR'][index]}>
            <input value={settings[key] || ''} dir={key.endsWith('Ar') ? 'rtl' : undefined}
              maxLength={key.startsWith('subtitle') ? 160 : key.startsWith('cta') ? 60 : 80}
              onChange={e => setSettings({ ...settings, [key]: e.target.value })} />
          </Field>)}
          <Field label="Nombre de cartes affichées" hint="7 au lancement ; augmentez ce nombre pour afficher vos nouvelles cartes (jusqu’à 1000).">
            <input type="number" min={1} max={1000} step={1} value={settings.cardCount} onChange={e => setSettings({ ...settings, cardCount: Number(e.target.value) })} />
          </Field>
          <Field label="Visibilité"><Switch disabled={!canWrite || busy} onLabel="Visible" offLabel="Masqué" checked={settings.enabled} onChange={() => setSettings({ ...settings, enabled: !settings.enabled })} /></Field>
        </fieldset>
        <Button disabled={!canWrite} busy={busy} onClick={() => void saveSettings()}>Enregistrer le conteneur</Button>
      </> : <Button onClick={() => void load()}>Recharger</Button>}
    </section>
    <section className="admin-card">
      <h3>Cartes Stories</h3>
      <p>Priorité décroissante : la plus élevée apparaît en premier. Les cartes expirées restent ici pour permettre leur suppression ou leur réactivation.</p>
      <Button disabled={busy || !canWrite} onClick={() => { setError(''); setForm({ id: '', title: '', description: '', title_ar: '', description_ar: '', media_url: '',
        priority: Math.max(0, ...rows.map(row => row.priority)) + 1, status: 'PUBLISHED', publish_at: new Date().toISOString(), expires_at: null }); }}>Ajouter une carte</Button>
      <div className="admin-stories-grid">
        {rows.map(card => <article className="admin-story-editor-card" key={card.id}>
          <img src={card.media_url} alt={card.title} loading="lazy" />
          <h4>{card.title}</h4><p>{card.description}</p><p>{card.status} · Priorité {card.priority}</p>
          <div className="admin-actions">
            <Button disabled={busy || !canWrite} onClick={() => { setError(''); setForm(card); }}>Modifier</Button>
            <Button disabled={busy || !canWrite} variant="danger" onClick={() => void remove(card)}>Retirer</Button>
          </div>
        </article>)}
      </div>
      <div className="admin-actions">
        <Button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Précédent</Button>
        <span>{page} / {pages}</span>
        <Button disabled={page >= pages || busy} onClick={() => setPage(page + 1)}>Suivant</Button>
      </div>
    </section>
    {form ? <Modal open title={form.id ? 'Modifier la carte' : 'Nouvelle carte'} onClose={() => { if (!busy && !uploading) setForm(null); }}>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset className="admin-form admin-stories-fields" disabled={!canWrite || busy}>
        <Field label="Photo" full>
          {form.media_url ? <img src={form.media_url} alt="Aperçu" className="admin-story-editor-preview" /> : null}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy}
            onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
          {uploading ? <p role="status">Envoi en cours…</p> : null}
        </Field>
        {(['title','description','title_ar','description_ar'] as const).map((key, index) => <Field key={key} label={['Titre FR','Description FR','Titre AR','Description AR'][index]}>
          <input value={form[key] || ''} dir={key.endsWith('_ar') ? 'rtl' : undefined} maxLength={key.startsWith('title') ? 120 : 300}
            onChange={e => setForm({ ...form, [key]: e.target.value })} />
        </Field>)}
        <Field label="Priorité"><input type="number" step={1} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
        <Field label="Statut"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="PUBLISHED">Publié</option><option value="DRAFT">Brouillon</option><option value="EXPIRED">Retiré</option>
        </select></Field>
      </fieldset>
      <Button busy={busy} disabled={uploading || !canWrite} onClick={() => void saveCard()}>Enregistrer la carte</Button>
    </Modal> : null}
  </div>;
};
