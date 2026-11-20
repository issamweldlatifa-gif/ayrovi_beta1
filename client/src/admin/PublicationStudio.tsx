import { useCallback, useEffect, useState } from 'react';
import { PUBLICATION_STUDIO_LAYOUTS as LAYOUTS, publicationStudioLayout, publicationStudioMedia, type StudioPublicationLayout } from '../../../shared/publicationStudio';
import type { PublicationMedia } from '../../../shared/publicationContent';
import { PUBLICATION_CATEGORIES } from '../../../shared/publicationFeed';
import { adminApi } from './api';
import { Button, Field, Modal } from './components';
import { ProductIntegration, EMPTY_PRODUCT_LINK, type ProductLinkValue } from './ProductIntegration';
import { StudioMediaField } from './StudioMediaField';
import { uploadMediaFile } from './mediaUpload';

type Row = Omit<ProductLinkValue, 'product_id'> & { product_id: string | null; id: string; title: string; subtitle: string; description: string;
  channel_id: string; image_url: string; media_json: string; template_id: string; category: string; status: string; publish_at: string;
  sponsored?: number; sponsor_name?: string; show_title?: number; action_label?: string };
const parseMedia = (value: string): PublicationMedia[] => {
  try { const rows = JSON.parse(value); return Array.isArray(rows) ? rows : []; } catch { return []; }
};
const empty = { ...EMPTY_PRODUCT_LINK, id: '', title: '', subtitle: '', description: '', channel_id: 'pub_zayrovi', image_url: '',
  media_json: '[]', template_id: 'photo', category: '', status: 'brouillon', publish_at: '' };
type Form = { row: Row; layout: StudioPublicationLayout | ''; video: string; changedLinks: boolean; changedLayout: boolean; changedMedia: boolean };

export function PublicationStudio() {
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const response = await adminApi<{ data: Row[] }>('/publications'); setRows(response.data); setError(''); }
    catch (e: any) { setError(e.message || 'Chargement impossible.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (row: Row) => {
    const primary = parseMedia(row.media_json)[0];
    setError('');
    setForm({ row: { ...row, image_url: row.image_url || (primary?.type === 'image' ? primary.url : primary?.poster) || '' },
      layout: publicationStudioLayout(row.template_id, primary), video: primary?.type === 'video' ? primary.url : '', changedLinks: false, changedLayout: false, changedMedia: false });
  };
  const update = (patch: Partial<Row>) => setForm(current => current ? { ...current, row: { ...current.row, ...patch } } : current);
  const upload = async (file: File, apply: (url: string) => void) => {
    setError(''); setBusy(true);
    try { apply(await uploadMediaFile(file)); }
    catch (e: any) { setError(e.message || 'Envoi impossible.'); }
    finally { setBusy(false); }
  };
  const save = async (override?: Row) => {
    if (!form && !override) return;
    setError(''); setBusy(true);
    try {
      if (override) {
        await adminApi(`/publications/${encodeURIComponent(override.id)}`, { method: 'PUT', body: JSON.stringify({ status: 'archive' }) });
      } else if (form) {
        const { row, layout, video } = form;
        if (!row.title.trim()) throw new Error('Le titre est obligatoire.');
        const old = parseMedia(row.media_json);
        const campaign = layout === 'campaign_orange' || layout === 'campaign_red';
        const videoLayout = layout.startsWith('video');
        const editVisual = !row.id || form.changedLayout || form.changedMedia;
        if (editVisual && layout && !campaign && !row.image_url) throw new Error('Ajoutez une image (ou un poster pour la vidéo).');
        if (editVisual && videoLayout && !video) throw new Error('Ajoutez le fichier vidéo.');
        if (form.changedLayout && videoLayout && old.length > 1 && !window.confirm('Le modèle vidéo ne peut garder qu’un seul média. Continuer ?')) return;
        const shaped = editVisual && layout && (!campaign || form.changedLayout || !row.id) ? publicationStudioMedia(layout, row.image_url, video, old[0]) : null;
        const visual = shaped ? { ...shaped, media: campaign ? old : [...shaped.media, ...(videoLayout ? [] : old.slice(1))] } : {};
        const { title, subtitle, description, image_url, status, category, show_title, sponsored, sponsor_name, action_label, channel_id } = row;
        const products = form.changedLinks || !row.id ? { content_mode: row.content_mode, product_id: row.product_id, product_ids: row.product_ids ?? (row.product_id ? [row.product_id] : []) } : {};
        await adminApi(row.id ? `/publications/${encodeURIComponent(row.id)}` : '/publications', { method: row.id ? 'PUT' : 'POST',
          body: JSON.stringify({ title, subtitle, description, status, category, ...(!row.id ? { channel_id } : {}), ...(editVisual ? { image_url } : {}), show_title: show_title !== 0,
            sponsored: Boolean(sponsored), sponsor_name: sponsored ? sponsor_name || '' : '', action_label, ...visual, ...products }) });
        setForm(null);
      }
      await load();
    } catch (e: any) { setError(e.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  return <section className="admin-card">
    <h3>Publications mobiles</h3>
    <p>Sept modèles actifs. Les anciens enregistrements restent disponibles ; choisissez un modèle actuel uniquement si vous souhaitez les convertir.</p>
    {error && !form ? <p role="alert">{error}</p> : null}
    <Button type="button" disabled={busy} onClick={() => open(empty)}>Nouvelle publication</Button>
    <div className="admin-stories-grid">
      {rows.map(row => <article className="admin-story-editor-card" key={row.id}>
        <h4>{row.title}</h4><p>{row.status} · {LAYOUTS[publicationStudioLayout(row.template_id, parseMedia(row.media_json)[0]) as StudioPublicationLayout] || 'Existant'}</p>
        <div className="admin-actions"><Button type="button" disabled={busy} onClick={() => open(row)}>Modifier</Button>
          {row.status !== 'archive' ? <Button type="button" variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Archiver « ${row.title} » ?`)) void save(row); }}>Archiver</Button> : null}</div>
      </article>)}
    </div>
    {form ? <Modal open wide title={form.row.id ? 'Modifier la publication' : 'Nouvelle publication'} onClose={() => { if (!busy) setForm(null); }}>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset className="admin-form admin-stories-fields" disabled={busy}>
        <Field label="Modèle"><select value={form.layout} onChange={e => setForm({ ...form, layout: e.target.value as StudioPublicationLayout, changedLayout: true })}>
          {!form.layout ? <option value="">Modèle existant (conserver)</option> : null}
          {Object.entries(LAYOUTS).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
        </select></Field>
        <Field label="Statut"><select value={form.row.status} onChange={e => update({ status: e.target.value })}>
          <option value="brouillon">Brouillon</option><option value="publie">Publié</option><option value="archive">Archivé</option>
        </select></Field>
        <Field label="Catégorie"><select value={form.row.category || ''} onChange={e => update({ category: e.target.value })}>
          <option value="">Sans catégorie</option>{PUBLICATION_CATEGORIES.map(id => <option key={id}>{id}</option>)}
        </select></Field>
        <Field label="Titre" required><input maxLength={150} value={form.row.title} onChange={e => update({ title: e.target.value })} /></Field>
        <Field label="Sous-titre"><input maxLength={150} value={form.row.subtitle} onChange={e => update({ subtitle: e.target.value })} /></Field>
        <Field label="Description" full><textarea rows={4} value={form.row.description || ''} onChange={e => update({ description: e.target.value })} /></Field>
        <StudioMediaField label="Image / poster vidéo" value={form.row.image_url} onChange={image_url => setForm(current => current ? { ...current, changedMedia: true, row: { ...current.row, image_url } } : current)} upload={(file, cb) => void upload(file, cb)} />
        {form.layout.startsWith('video') ? <StudioMediaField label="Fichier vidéo" value={form.video} kind="video" upload={(file, cb) => void upload(file, cb)}
          onChange={video => setForm(current => current ? { ...current, video, changedMedia: true } : current)} /> : null}
        {form.layout.startsWith('campaign_') ? <Field label="Libellé court de campagne (facultatif)"><input maxLength={40} value={form.row.action_label || ''} onChange={e => update({ action_label: e.target.value })} /></Field> : null}
        <Field label="Sponsorisé"><input type="checkbox" checked={Boolean(form.row.sponsored)} onChange={e => update({ sponsored: Number(e.target.checked) })} /></Field>
        {form.row.sponsored ? <Field label="Nom du sponsor"><input value={form.row.sponsor_name || ''} onChange={e => update({ sponsor_name: e.target.value })} /></Field> : null}
        <div style={{ gridColumn: '1 / -1' }}><ProductIntegration kind="publication" value={{ ...form.row, product_id: form.row.product_id || '' }}
          onChange={value => setForm(current => current ? { ...current, changedLinks: true, row: { ...current.row, ...value } } : current)} /></div>
      </fieldset>
      <Button type="button" busy={busy} onClick={() => void save()}>Enregistrer</Button>
    </Modal> : null}
  </section>;
}
