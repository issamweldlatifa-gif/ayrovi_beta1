import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUp, Pencil, Plus, Trash2 } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Field, Modal, StatusBadge } from './components';
import { StoriesStudioPage } from './StoriesStudio';

const TABS = ['Publication', 'Reel', 'Story'] as const;
type Tab = typeof TABS[number];

const st = (s: string) => s === 'publie' ? 'PUBLISHED' : s === 'archive' ? 'ARCHIVED' : 'DRAFT';

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Lecture impossible'));
  reader.readAsDataURL(file);
});

const uploadFile = async (file: File) => {
  const dataUrl = await readDataUrl(file);
  const result = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  return result.data?.url as string;
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

/* ---------------- Publications ---------------- */
const PublicationsTab: React.FC<{ channels: any[] }> = ({ channels }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { adminApi<any>('/publications').then((r) => setRows(r.data || [])); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy('save');
    try {
      if (form.id) await adminApi(`/publications/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await adminApi('/publications', { method: 'POST', body: JSON.stringify(form) });
      setForm(null); load();
    } finally { setBusy(''); }
  };

  return (
    <section className="admin-card">
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <Button onClick={() => setForm({ title: '', subtitle: '', channel_id: channels[0]?.id || '', image_url: '', remark: '', status: 'publie' })}><Plus size={15} />Ajouter</Button>
      </div>
      <div className="no-scrollbar overflow-x-auto">
        <table className="admin-table" style={{ minWidth: 640 }}>
          <thead><tr><th>Titre</th><th>Canal</th><th>Date</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><div className="flex items-center gap-2">{row.image_url && <img src={row.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />}<strong>{row.title}</strong></div></td>
                <td>{channels.find((c) => c.id === row.channel_id)?.name || '—'}</td>
                <td className="admin-block-small">{new Date(row.publish_at).toLocaleDateString('fr-FR')}</td>
                <td><StatusBadge status={st(row.status)} /></td>
                <td><div className="admin-actions" style={{ marginTop: 0 }}>
                  <Button variant="ghost" onClick={() => setForm({ ...row })}><Pencil size={14} /></Button>
                  <Button variant="danger" onClick={async () => { if (window.confirm('Supprimer ?')) { await adminApi(`/publications/${row.id}`, { method: 'DELETE' }); load(); } }}><Trash2 size={14} /></Button>
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="admin-block-small">Aucune publication.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={Boolean(form)} title={form?.id ? 'Éditer' : 'Nouvelle publication'} onClose={() => setForm(null)} wide
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button busy={busy === 'save'} onClick={() => void save()}>Enregistrer</Button></>}>
        {form && <div className="admin-grid-2">
          <Field label="Titre" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Sous-titre"><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
          <Field label="Canal" required><ChannelSelect value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} channels={channels} /></Field>
          <Field label="Image" required>
            <div className="admin-actions" style={{ marginTop: 0 }}>
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL ou upload" style={{ flex: 1 }} />
              <label style={{ cursor: 'pointer', border: '1px solid #d5d2e4', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                <ArrowUp size={14} />Uploader
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setForm({ ...form, image_url: await uploadFile(f) }); }} />
              </label>
            </div>
          </Field>
          <Field label="Remarque (interne, invisible sur le site)" full><textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
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
  const load = useCallback(() => { adminApi<any>('/reels').then((r) => setRows(r.data || [])); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy('save');
    try {
      if (form.id) await adminApi(`/reels/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await adminApi('/reels', { method: 'POST', body: JSON.stringify(form) });
      setForm(null); load();
    } finally { setBusy(''); }
  };

  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <section className="admin-card">
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <Button onClick={() => setForm({ title: '', channel_id: channels[0]?.id || '', description: '', video_url: '', duration_seconds: 0, status: 'publie' })}><Plus size={15} />Ajouter</Button>
      </div>
      <div className="no-scrollbar overflow-x-auto">
        <table className="admin-table" style={{ minWidth: 700 }}>
          <thead><tr><th>Titre</th><th>Canal</th><th>Durée</th><th>Vues</th><th>Likes</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.title}</strong></td>
                <td>{channels.find((c) => c.id === row.channel_id)?.name || '—'}</td>
                <td>{fmt(row.duration_seconds || 0)}</td>
                <td>{row.views}</td>
                <td>{row.likes}</td>
                <td><StatusBadge status={st(row.status)} /></td>
                <td><div className="admin-actions" style={{ marginTop: 0 }}>
                  <Button variant="ghost" onClick={() => setForm({ ...row })}><Pencil size={14} /></Button>
                  <Button variant="danger" onClick={async () => { if (window.confirm('Supprimer ?')) { await adminApi(`/reels/${row.id}`, { method: 'DELETE' }); load(); } }}><Trash2 size={14} /></Button>
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="admin-block-small">Aucun reel.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={Boolean(form)} title={form?.id ? 'Éditer' : 'Nouveau reel'} onClose={() => setForm(null)} wide
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button busy={busy === 'save'} onClick={() => void save()}>Enregistrer</Button></>}>
        {form && <div className="admin-grid-2">
          <Field label="Titre" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Canal" required><ChannelSelect value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} channels={channels} /></Field>
          <Field label="Vidéo (mp4, mov, webm…)" required full>
            <div className="admin-actions" style={{ marginTop: 0 }}>
              <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="URL ou upload" style={{ flex: 1 }} />
              <label style={{ cursor: 'pointer', border: '1px solid #d5d2e4', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                <ArrowUp size={14} />Uploader
                <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await uploadFile(f);
                  const duration = await videoDuration(url);
                  setForm((cur: any) => ({ ...cur, video_url: url, duration_seconds: duration }));
                }} />
              </label>
            </div>
            {form.video_url && <video src={form.video_url} controls muted style={{ width: '100%', maxHeight: 240, borderRadius: 12, marginTop: 8, background: '#000' }} />}
            {form.duration_seconds > 0 && <p className="admin-block-small">Durée détectée automatiquement : {fmt(form.duration_seconds)}</p>}
          </Field>
          <Field label="Description" full><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="brouillon">Brouillon</option><option value="publie">Publié</option><option value="archive">Archivé</option></select></Field>
        </div>}
      </Modal>
    </section>
  );
};

/* ---------------- Page Social (3 tabs) ---------------- */
export const SocialAdminPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('Publication');
  const [channels, setChannels] = useState<any[]>([]);
  useEffect(() => { adminApi<any>('/story-publishers').then((r) => setChannels(r.data || [])).catch(() => undefined); }, []);

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Social</span>
          <h2>Social Ayrovi</h2>
          <p>Trois contenus indépendants : publications du feed, reels vidéo et stories éphémères.</p>
        </div>
      </header>
      <div className="admin-actions" style={{ marginTop: 0 }}>
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t}</Button>
        ))}
      </div>
      {tab === 'Publication' && <PublicationsTab channels={channels} />}
      {tab === 'Reel' && <ReelsTab channels={channels} />}
      {tab === 'Story' && <StoriesStudioPage onEditContent={() => undefined} />}
    </div>
  );
};
