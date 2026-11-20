/** Official editorial Stories. Reuses the authenticated, audited Stories resource.
 * No legacy channels/viewer/shoppable editor in this screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, Field, Modal, Switch } from './components';
import { uploadMediaFile } from './mediaUpload';
import { StorySequenceEditor } from './StorySequenceEditor';
import { ProductIntegration, EMPTY_PRODUCT_LINK, type ProductLinkValue } from './ProductIntegration';
import { normalizeStoryEditorial, type StoryEditorial } from '../../../shared/storyEditorial';

type Card = { id: string; title: string; description: string; title_ar: string; description_ar: string;
  media_type?: 'IMAGE' | 'VIDEO'; editorial?: StoryEditorial | null; product_ids?: string[]; product_id?: string | null; content_mode?: 'normal' | 'shoppable';
  media_url: string; priority: number; status: string; publish_at: string; expires_at: string | null };
type Settings = { title: string; subtitle: string; titleAr: string; subtitleAr: string; ctaLabel: string; ctaLabelAr: string; cardCount: number; enabled: boolean };

export const StoriesStudioPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<Card[]>([]);
  const [form, setForm] = useState<Card | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [linksChanged, setLinksChanged] = useState(false);
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
      const { id, title, title_ar, description, description_ar, priority, status, publish_at, media_url, expires_at } = form;
      const editorial = normalizeStoryEditorial(form.editorial);
      const linkPatch = linksChanged ? { product_ids: form.content_mode === 'shoppable' ? form.product_ids ?? [form.product_id].filter(Boolean) : [] } : {};
      const card = { title, title_ar, description, description_ar, priority, status, publish_at, media_url, expires_at, editorial, ...linkPatch };
      await adminApi(id ? `/stories/${encodeURIComponent(id)}` : '/stories', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...(id ? {} : { media_type: 'IMAGE', category: 'STYLE' }), ...card, expires_at: form.expires_at || null }),
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
  const openCard = async (card: Card) => {
    setBusy(true); setError(''); setLinksChanged(false);
    try { const response = await adminApi<{ data: Card }>(`/stories/${encodeURIComponent(card.id)}`); setForm(response.data); }
    catch (e: any) { setError(e.message || 'Chargement impossible.'); }
    finally { setBusy(false); }
  };
  const upload = async (file: File, onChange: (url: string) => void) => {
    setUploading(true); setError('');
    try {
      const url = await uploadMediaFile(file);
      onChange(url);
    } catch (e: any) { setError(e.message || 'Envoi impossible.'); }
    finally { setUploading(false); }
  };

  return <div className="admin-grid">
    <section className="admin-card">
      <h3>Stories officielles — conteneur d’accueil</h3>
      <p>Entre À la une et LENS. Cartes éditoriales de mêmes dimensions. Le CTA ouvre la galerie, et chaque carte ouvre son propre parcours éditorial.</p>
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
      <Button disabled={busy || !canWrite} onClick={() => { setError(''); setLinksChanged(false); setForm({ id: '', title: '', description: '', title_ar: '', description_ar: '', media_url: '',
        priority: Math.max(0, ...rows.map(row => row.priority)) + 1, status: 'PUBLISHED', publish_at: new Date().toISOString(), expires_at: null }); }}>Ajouter une carte</Button>
      <div className="admin-stories-grid">
        {rows.map(card => <article className="admin-story-editor-card" key={card.id}>
          <img src={card.media_url} alt={card.title} loading="lazy" />
          <h4>{card.title}</h4><p>{card.description}</p><p>{card.status} · Priorité {card.priority}</p>
          <div className="admin-actions">
            <Button disabled={busy || !canWrite} onClick={() => void openCard(card)}>Modifier</Button>
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
    {form ? <Modal open wide title={form.id ? 'Modifier la carte' : 'Nouvelle carte'} onClose={() => { if (!busy && !uploading) setForm(null); }}>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset className="admin-form admin-stories-fields" disabled={!canWrite || busy || uploading}>
        <Field label="Couverture de la galerie" full>
          {form.media_url && form.media_type !== 'VIDEO' ? <img src={form.media_url} alt="Aperçu" className="admin-story-editor-preview" /> : null}
          {form.media_type === 'VIDEO' ? null : <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading || busy}
            onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, media_url => setForm(current => current ? { ...current, media_url } : current)); }} /> }
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
        <Field label="Publication"><input type="date" value={(form.publish_at || '').slice(0, 10)} onChange={e => { if (e.target.value) setForm({ ...form, publish_at: new Date(e.target.value).toISOString() }); }} /></Field>
        <Field label="Expiration (facultative)"><input type="date" value={(form.expires_at || '').slice(0, 10)} onChange={e => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProductIntegration kind="story" value={{ ...EMPTY_PRODUCT_LINK, content_mode: form.content_mode || 'normal', product_id: form.product_id || '', product_ids: form.product_ids }}
            onChange={(value: ProductLinkValue) => { setLinksChanged(true); setForm(current => current ? { ...current, ...value } : current); }} />
          <StorySequenceEditor value={form.editorial ?? null} cover={form.media_type === 'VIDEO' ? '' : form.media_url}
            productIds={form.content_mode === 'shoppable' ? form.product_ids ?? (form.product_id ? [form.product_id] : []) : []}
            onChange={editorial => setForm(current => current ? { ...current, editorial } : current)} upload={(file, apply) => void upload(file, apply)} />
        </div>
      </fieldset>
      <Button busy={busy} disabled={uploading || !canWrite} onClick={() => void saveCard()}>Enregistrer la carte</Button>
    </Modal> : null}
  </div>;
};
