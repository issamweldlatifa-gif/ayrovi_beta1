import { CAPTION_FIRST_TEMPLATES } from '../../../shared/publicationLayouts';
import { PUBLICATION_TYPES, PUBLICATION_TEMPLATES, publicationTypeForTemplate } from '../../../shared/publicationContent';
import { PublicationReferenceImages } from './PublicationReferenceImages';
import { PublicationTemplatePreview } from './PublicationTemplatePreview';
import { PublicationFeedSettingsPage } from './PublicationFeedSettingsPage';
import { PUBLICATION_CATEGORIES } from '../../../shared/publicationFeed';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUp, Pencil, Plus, Trash2 } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, DataTable, Field, Modal, StatusBadge } from './components';
import { EMPTY_PRODUCT_LINK, ProductIntegration } from './ProductIntegration';
import { CatalogueProductsPage } from './CataloguePages';
import { uploadMediaFile } from './mediaUpload';
import { normalizeMediaLink, type MediaLinkKind } from '../../../shared/mediaLinks';

const TABS = ['Publication', 'Reel', 'Produits temporaires', 'Réglages Feed', 'Statistiques'] as const;
type Tab = typeof TABS[number];

const st = (s: string) => s === 'publie' ? 'PUBLISHED' : s === 'archive' ? 'ARCHIVED' : 'DRAFT';

/** Suppression avec confirmation — un seul chemin pour les onglets social (publication, reel). */
const removeWithConfirm = async (path: string, message: string, reload: () => void) => {
  if (!window.confirm(message)) return;
  try { await adminApi(path, { method: 'DELETE' }); reload(); } catch { reload(); }
};

/**
 * Lien saisi à la main : converti tout de suite (lecteur Cloudinary → fichier direct) ou refusé
 * avec une explication à l'écran. Renvoie la valeur à garder, ou null si le lien est refusé.
 */
const acceptLink = (value: string, kind: MediaLinkKind, setError: (message: string) => void): string | null => {
  const link = normalizeMediaLink(value, kind);
  if (link.ok === false) { setError(link.error); return null; }
  return link.url;
};

const videoDuration = (url: string) => new Promise<number>((resolve) => {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.onloadedmetadata = () => resolve(Math.round(video.duration || 0));
  video.onerror = () => resolve(0);
  video.src = url;
});

const ChannelSelect: React.FC<{ value: string; onChange: (v: string) => void; channels: any[] }> = ({ value, onChange, channels }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">— Canal —</option>
    {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
);

function PublicationInsights() {
  const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState('');
  const load = () => { setError(''); adminApi<any>('/publication-insights').then(result => setRows(result.data || [])).catch(() => setError('Statistiques indisponibles. Réessayez.')); };
  useEffect(load, []);
  return <section className="admin-card"><h2>Engagement des publications</h2><p>Vues et partages uniques observés, pas des impressions publicitaires facturables. Aucun budget ou revenu estimé.</p><Button onClick={load}>Actualiser</Button>{error ? <div className="admin-error">{error}</div> : null}<DataTable rows={rows} emptyText="Aucune publication." columns={[
    { key: 'title', label: 'Publication' }, { key: 'sponsored', label: 'Annonceur', render: (row: any) => row.sponsored ? row.sponsor_name || 'Sponsorisé' : 'Éditorial' },
    ...['views', 'likes', 'comments', 'shares', 'saves'].map(key => ({ key, label: ({ views: 'Vues uniques', likes: 'J’aime', comments: 'Commentaires', shares: 'Partages uniques', saves: 'Enregistrements' } as Record<string,string>)[key] })),
  ]} /></section>;
}

/* ---------------- Publications ---------------- */
const PublicationsTab: React.FC<{ channels: any[] }> = ({ channels }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [reelChoices, setReelChoices] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { adminApi<any>('/publications').then((r) => setRows(r.data || [])).catch(() => setError('Impossible de charger les publications.')); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form || String(form.title || '').trim().length < 2 || !form.channel_id || !String(form.image_url || '').trim()) {
      setError('Titre, canal et image sont obligatoires.');
      return;
    }
    setBusy('save'); setError('');
    try {
      if (form.id) await adminApi(`/publications/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await adminApi('/publications', { method: 'POST', body: JSON.stringify(form) });
      setForm(null); load();
    } catch (reason: any) { setError(reason?.message || 'Enregistrement impossible.'); }
    finally { setBusy(''); }
  };

  return (
    <section className="admin-card">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <Button onClick={() => { setError(''); setForm({ category: '', title: '', subtitle: '', channel_id: channels[0]?.id || '', image_url: '', remark: '', status: 'publie', ...EMPTY_PRODUCT_LINK }); }}><Plus size={15} />Ajouter</Button>
        <span className="admin-block-small">Format conseillé : image verticale 4:5, titre court et canal actif.</span>
      </div>
      <DataTable
        minWidth={640}
        emptyText="Aucune publication."
        rows={rows}
        columns={[
          { key: 'title', label: 'Titre', render: (row: any) => <div className="admin-entity">{row.image_url ? <span><img src={row.image_url} alt="" /></span> : null}<div><strong>{row.title}</strong></div></div> },
          { key: 'channel', label: 'Canal', render: (row: any) => channels.find((c) => c.id === row.channel_id)?.name || '—' },
          { key: 'publish_at', label: 'Date', render: (row: any) => new Date(row.publish_at).toLocaleDateString('fr-FR') },
          { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={st(row.status)} /> },
        ]}
        rowActions={[
          { key: 'edit', label: 'Éditer', icon: <Pencil size={14} />, hideLabel: true, onRun: (row: any) => { setError(''); setForm({ ...row, media: JSON.parse(row.media_json || '[]') }); } },
          { key: 'delete', label: 'Supprimer', tone: 'danger', icon: <Trash2 size={14} />, hideLabel: true, onRun: (row: any) => void removeWithConfirm(`/publications/${row.id}`, 'Supprimer cette publication ?', load) },
        ]}
      />
      <Modal open={Boolean(form)} title={form?.id ? 'Éditer' : 'Nouvelle publication'} onClose={() => setForm(null)} wide
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button busy={busy === 'save'} onClick={() => void save()}>Enregistrer</Button></>}>
        {form && <div className="admin-grid-2">
          {error ? <div role="alert" className="admin-error" style={{ gridColumn: '1 / -1' }}>{error}</div> : null}
          <Field label="Titre" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Sous-titre"><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
          <Field label="Canal" required><ChannelSelect value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} channels={channels} /></Field>
          <Field label="Image" required>
            <div className="admin-actions" style={{ marginTop: 0 }}>
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} onBlur={() => { const url = acceptLink(form.image_url || '', 'image', setError); if (url !== null) setForm((cur: any) => ({ ...cur, image_url: url })); }} placeholder="URL ou upload" style={{ flex: 1 }} />
              <label style={{ cursor: 'pointer', border: '1px solid var(--admin-line)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                <ArrowUp size={14} />Uploader
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadMediaFile(f); setForm((cur: any) => ({ ...cur, image_url: url })); } catch (err: any) { setError(err?.message || 'Upload impossible.'); } finally { e.target.value = ''; } }} />
              </label>
            </div>
          </Field>
          <Field label="Type de publication"><select aria-label="Type de publication" value={form.post_type || 'image'} onChange={e => setForm({ ...form, post_type: e.target.value })}>
            {PUBLICATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select></Field>
          <Field label="Modèle visuel"><select aria-label="Modèle visuel" value={form.template_id || 'auto'} onChange={e => setForm({ ...form, template_id: e.target.value, post_type: publicationTypeForTemplate(e.target.value, form.post_type) })}>
            {PUBLICATION_TEMPLATES.map(value => <option key={value} value={value}>{({ auto: 'Automatique (compatibilité)', photo: 'Photo éditoriale', split: 'Éditorial — image puis texte', campaign: 'Éditorial — grand titre & encart crème', carousel: 'Carousel — grande galerie & fiche produit', video: 'Vidéo immersive', social_mosaic: 'Album — mosaïque 2 + 3', shoppable: 'Shopping — photo & cartes produits', caption_photo: 'Social — description puis grande photo', social_strip: 'Album — rangée de 3 photos', social_pair: 'Album — duo de photos' })[value]}</option>)}
          </select></Field>
          <Field label="Libellé du bouton (facultatif)"><input maxLength={40} value={form.action_label || ''} placeholder="Découvrir" onChange={e => setForm({ ...form, action_label: e.target.value })} /></Field>
          <Field label="Action du bouton"><select value={form.action_target || 'detail'} onChange={e => setForm({ ...form, action_target: e.target.value })}><option value="detail">Ouvrir la publication</option><option value="products">Ouvrir le premier produit associé</option></select></Field>
          <Field label="Aperçu de composition" full><PublicationTemplatePreview form={form} /></Field>
          <Field label="Description" full><textarea rows={4} maxLength={10000} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Position de la description"><select disabled={(CAPTION_FIRST_TEMPLATES as readonly string[]).includes(form.template_id)} value={(CAPTION_FIRST_TEMPLATES as readonly string[]).includes(form.template_id) ? 'above' : form.description_position || 'below'} onChange={e => setForm({ ...form, description_position: e.target.value })}><option value="above">Au-dessus du média</option><option value="below">Sous le média</option></select></Field>
          <Field label="Sponsorisé"><input type="checkbox" checked={!!form.sponsored} onChange={e => setForm({ ...form, sponsored: e.target.checked })} /></Field>
          {form.sponsored ? <Field label="Annonceur"><input value={form.sponsor_name || 'ZAYROVI'} maxLength={80} onChange={e => setForm({ ...form, sponsor_name: e.target.value })} /></Field> : null}
          <Field label="Audience"><select value={form.audience || ''} onChange={e => setForm({ ...form, audience: e.target.value })}>{['','men','women','unisex'].map(value => <option key={value} value={value}>{value || 'Toutes'}</option>)}</select></Field>
          <Field label="Sujet"><select value={form.topic || ''} onChange={e => setForm({ ...form, topic: e.target.value })}>{['','shoes','accessories','new-trends'].map(value => <option key={value} value={value}>{value || 'Tous'}</option>)}</select></Field>
          {form.post_type === 'video' ? <Field label="Réutiliser une vidéo existante" full>
            <Button variant="secondary" onClick={async () => { try { const response = await adminApi<{ data: any[] }>('/reels'); setReelChoices(response.data || []); } catch { setError('Impossible de charger les vidéos existantes.'); } }}>Choisir dans les Reels</Button>
            {reelChoices ? <select aria-label="Vidéo existante" value="" onChange={e => { const reel = reelChoices.find(item => item.id === e.target.value); if (reel) setForm({ ...form, template_id: 'video', post_type: 'video', title: form.title || reel.title, image_url: form.image_url || reel.poster_url || '', media: [{ type: 'video', url: reel.video_url, poster: reel.poster_url || form.image_url || '', alt: reel.title }] }); }}><option value="">{reelChoices.length ? 'Sélectionnez une vidéo' : 'Aucune vidéo disponible'}</option>{reelChoices.map(reel => <option key={reel.id} value={reel.id}>{reel.title}</option>)}</select> : null}
            <small>Réutilise le fichier existant sans modifier le Reel. Ajoutez une couverture si nécessaire.</small>
          </Field> : null}
          <Field label="Médias ordonnés" full>
            <p>Albums mosaïque/rangée : 2 à 10 images ; duo : exactement 2 ; grande photo/shopping : 1 image. La description précède les images dans les cinq nouveaux modèles. Carousel : 2 à 10 images. Vidéo : un fichier vidéo et l’image principale comme couverture. Le type de publication doit correspondre aux médias.</p>
            {(form.media || []).map((item: any, index: number) => <div className="admin-actions" key={index}>
              <span>{index + 1}. {item.type}</span><input aria-label={`Média ${index + 1}`} value={item.url} onChange={e => setForm({ ...form, media: form.media.map((m: any, i: number) => i === index ? { ...m, url: e.target.value } : m) })} />
              <Button variant="secondary" disabled={!index} onClick={() => { const media = [...form.media]; [media[index - 1], media[index]] = [media[index], media[index - 1]]; setForm({ ...form, media }); }}>Monter</Button>
              {item.type === 'image' ? <select aria-label={`Ajustement du média ${index + 1}`} value={item.fit || 'cover'} onChange={e => setForm({ ...form, media: form.media.map((m: any, i: number) => i === index ? { ...m, fit: e.target.value } : m) })}><option value="cover">Remplir le cadre</option><option value="contain">Afficher le produit entier</option></select> : null}
              <Button variant="ghost" onClick={() => setForm({ ...form, media: form.media.filter((_: any, i: number) => i !== index) })}>Retirer le média</Button>
            </div>)}
            <Button variant="secondary" onClick={() => setForm({ ...form, media: [...(form.media || []), { type: form.post_type === 'video' ? 'video' : 'image', url: '', poster: '', alt: '' }] })}>Ajouter un lien média</Button>
            <input aria-label="Uploader les médias Publication" type="file" multiple accept="image/*,video/mp4,video/webm" onChange={async e => {
              const files = Array.from(e.target.files || []); setBusy('save'); setError('');
              try { const media: any[] = []; for (const file of files) media.push({ type: file.type.startsWith('video/') ? 'video' : 'image', url: await uploadMediaFile(file), poster: '', alt: '' }); setForm((current: any) => ({ ...current, image_url: current.image_url || media.find(m => m.type === 'image')?.url || '', media: [...(current.media || []), ...media] })); }
              catch (error: any) { setError(error.message); } finally { setBusy(''); e.target.value = ''; }
            }} />
          </Field>
          <div className="admin-field-full"><PublicationReferenceImages form={form} onChange={setForm} /></div>
          <Field label="Catégorie Publication"><select value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="">For You — non classée</option>
            {PUBLICATION_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
          </select></Field>
          <Field label="Remarque (interne, invisible sur le site)" full><textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
          <ProductIntegration kind="publication" value={form} onChange={(v) => setForm({ ...form, ...v })} />
          <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="brouillon">Brouillon</option><option value="publie">Publié</option><option value="archive">Archivé</option></select></Field>
        </div>}
      </Modal>
    </section>
  );
};

/* ---------------- Reels ---------------- */
const ReelsTab: React.FC<{ channels: any[] }> = ({ channels }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { adminApi<any>('/reels').then((r) => setRows(r.data || [])).catch(() => setError('Impossible de charger les reels.')); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form || String(form.title || '').trim().length < 2 || !form.channel_id || !String(form.video_url || '').trim()) {
      setError('Titre, canal et vidéo sont obligatoires.');
      return;
    }
    setBusy('save'); setError('');
    try {
      if (form.id) await adminApi(`/reels/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await adminApi('/reels', { method: 'POST', body: JSON.stringify(form) });
      setForm(null); load();
    } catch (reason: any) { setError(reason?.message || 'Enregistrement impossible.'); }
    finally { setBusy(''); }
  };

  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <section className="admin-card">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <Button onClick={() => { setError(''); setForm({ title: '', channel_id: channels[0]?.id || '', description: '', video_url: '', duration_seconds: 0, status: 'publie', ...EMPTY_PRODUCT_LINK }); }}><Plus size={15} />Ajouter</Button>
        <span className="admin-block-small">Format conseillé : vidéo verticale 9:16, sous-titres lisibles et caption courte.</span>
      </div>
      <DataTable
        minWidth={700}
        emptyText="Aucun reel."
        rows={rows}
        columns={[
          { key: 'title', label: 'Titre', render: (row: any) => <strong>{row.title}</strong> },
          { key: 'channel', label: 'Canal', render: (row: any) => channels.find((c) => c.id === row.channel_id)?.name || '—' },
          { key: 'duration_seconds', label: 'Durée', render: (row: any) => fmt(row.duration_seconds || 0) },
          { key: 'views', label: 'Vues', align: 'end', render: (row: any) => <span className="admin-cell-num">{row.views}</span> },
          { key: 'likes', label: 'Likes', align: 'end', render: (row: any) => <span className="admin-cell-num">{row.likes}</span> },
          { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={st(row.status)} /> },
        ]}
        rowActions={[
          { key: 'edit', label: 'Éditer', icon: <Pencil size={14} />, hideLabel: true, onRun: (row: any) => { setError(''); setForm({ ...row }); } },
          { key: 'delete', label: 'Supprimer', tone: 'danger', icon: <Trash2 size={14} />, hideLabel: true, onRun: (row: any) => void removeWithConfirm(`/reels/${row.id}`, 'Supprimer ce reel ?', load) },
        ]}
      />
      <Modal open={Boolean(form)} title={form?.id ? 'Éditer' : 'Nouveau reel'} onClose={() => setForm(null)} wide
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button busy={busy === 'save'} onClick={() => void save()}>Enregistrer</Button></>}>
        {form && <div className="admin-grid-2">
          <Field label="Titre" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Canal" required><ChannelSelect value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} channels={channels} /></Field>
          <Field label="Vidéo (mp4, mov, webm…)" required full>
            <div className="admin-actions" style={{ marginTop: 0 }}>
              <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} onBlur={() => { const url = acceptLink(form.video_url || '', 'video', setError); if (url !== null) setForm((cur: any) => ({ ...cur, video_url: url })); }} placeholder="URL ou upload" style={{ flex: 1 }} />
              <label style={{ cursor: 'pointer', border: '1px solid var(--admin-line)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                <ArrowUp size={14} />Uploader
                <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const url = await uploadMediaFile(f);
                    const duration = await videoDuration(url);
                    setForm((cur: any) => ({ ...cur, video_url: url, duration_seconds: duration }));
                  } catch (err: any) { setError(err?.message || 'Upload impossible.'); }
                  finally { e.target.value = ''; }
                }} />
              </label>
            </div>
            {form.video_url && <video src={form.video_url} controls muted style={{ width: '100%', maxHeight: 240, borderRadius: 12, marginTop: 8, background: '#000' }} />}
            {form.duration_seconds > 0 && <p className="admin-block-small">Durée détectée automatiquement : {fmt(form.duration_seconds)}</p>}
          </Field>
          <Field label="Image de couverture (affichée avant la lecture)" full>
            <div className="admin-actions" style={{ marginTop: 0 }}>
              <input value={form.poster_url || ''} onChange={(e) => setForm({ ...form, poster_url: e.target.value })} onBlur={() => { const url = acceptLink(form.poster_url || '', 'image', setError); if (url !== null) setForm((cur: any) => ({ ...cur, poster_url: url })); }} placeholder="URL ou upload (facultatif)" style={{ flex: 1 }} />
              <label style={{ cursor: 'pointer', border: '1px solid var(--admin-line)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                <ArrowUp size={14} />Uploader
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadMediaFile(f); setForm((cur: any) => ({ ...cur, poster_url: url })); } catch (err: any) { setError(err?.message || 'Upload impossible.'); } finally { e.target.value = ''; } }} />
              </label>
            </div>
            {form.poster_url && <img src={form.poster_url} alt="" style={{ width: 120, aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 12, marginTop: 8 }} />}
          </Field>
          <Field label="Modèle visuel"><select aria-label="Modèle visuel" value={form.template_id || 'auto'} onChange={e => setForm({ ...form, template_id: e.target.value, post_type: publicationTypeForTemplate(e.target.value, form.post_type) })}>
            {PUBLICATION_TEMPLATES.slice(0, 6).map(value => <option key={value} value={value}>{({ auto: 'Automatique (compatibilité)', photo: 'Photo éditoriale', split: 'Éditorial — image puis texte', campaign: 'Éditorial — grand titre & encart crème', carousel: 'Carousel — grande galerie & fiche produit', video: 'Vidéo immersive', social_mosaic: 'Album — mosaïque 2 + 3', shoppable: 'Shopping — photo & cartes produits', caption_photo: 'Social — description puis grande photo', social_strip: 'Album — rangée de 3 photos', social_pair: 'Album — duo de photos' })[value]}</option>)}
          </select></Field>
          <Field label="Libellé du bouton (facultatif)"><input maxLength={40} value={form.action_label || ''} placeholder="Découvrir" onChange={e => setForm({ ...form, action_label: e.target.value })} /></Field>
          <Field label="Action du bouton"><select value={form.action_target || 'detail'} onChange={e => setForm({ ...form, action_target: e.target.value })}><option value="detail">Ouvrir la publication</option><option value="products">Ouvrir le premier produit associé</option></select></Field>
          <Field label="Aperçu de composition" full><PublicationTemplatePreview form={form} /></Field>
          <Field label="Description" full><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <ProductIntegration kind="reel" value={form} onChange={(v) => setForm({ ...form, ...v })} />
          <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="brouillon">Brouillon</option><option value="publie">Publié</option><option value="archive">Archivé</option></select></Field>
        </div>}
      </Modal>
    </section>
  );
};

/* ---------------- Page Social (3 tabs) ---------------- */
export const SocialAdminPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [tab, setTab] = useState<Tab>('Publication');
  const [channels, setChannels] = useState<any[]>([]);
  useEffect(() => { adminApi<any>('/story-publishers').then((r) => setChannels(r.data || [])).catch(() => undefined); }, []);

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Social</span>
          <h2>Social Zayrovi</h2>
          <p>Publications du feed et reels vidéo. Les Stories se gèrent dans Contenu → Stories officielles.</p>
        </div>
      </header>
      <div className="admin-actions" style={{ marginTop: 0 }}>
        {TABS.map((t) => (
          <Button key={t} variant="secondary" aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</Button>
        ))}
      </div>
      {tab === 'Statistiques' && <PublicationInsights />}
      {tab === 'Réglages Feed' && <PublicationFeedSettingsPage canWrite={canWrite} />}
      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {tab === 'Publication' && <PublicationsTab channels={channels} />}
      {tab === 'Reel' && <ReelsTab channels={channels} />}
      {tab === 'Produits temporaires' && <CatalogueProductsPage scope="content" />}
      </fieldset>
    </div>
  );
};
