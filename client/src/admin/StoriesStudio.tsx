import React, { useCallback, useEffect, useState } from 'react';
import { Box, Eye, Heart, MessageSquare, Pencil, Plus, Share2, Trash2, ArrowUp } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Field, Modal, StatusBadge } from './components';

const KNOWN_CATEGORIES = ['ARRIVAGE', 'NEW', 'STYLE', 'INFO', 'PROMO'];
const CHANNELS = [
  ['ARRIVAGE', 'Ayrovi Official'], ['NEW', 'Nouveautés'], ['STYLE', 'Style'], ['INFO', 'Actus'], ['PROMO', 'Promos'],
] as const;

const emptyForm = {
  id: '', title: '', category: 'ARRIVAGE', media_type: 'IMAGE', media_url: '', description: '',
  cta: '', arrival_id: '', promotion_id: '', product_id: '', publish_at: '', expires_at: '', priority: 0, status: 'PUBLISHED',
};

const toLocal = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Gestion complète des Stories : création, édition, upload média, publication, stats. */
export const StoriesStudioPage: React.FC<{ onEditContent: () => void }> = ({ onEditContent }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [arrivals, setArrivals] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      adminApi<any>('/stories?pageSize=100'),
      adminApi<any>('/stories-stats').catch(() => ({ data: {} })),
      adminApi<any>('/arrivals?pageSize=50').catch(() => ({ data: [] })),
      adminApi<any>('/promotions?pageSize=50').catch(() => ({ data: [] })),
    ]).then(([list, stat, arr, pro]) => {
      setRows(Array.isArray(list.data) ? list.data : []);
      setStats(stat.data || {});
      setArrivals(Array.isArray(arr.data) ? arr.data : []);
      setPromotions(Array.isArray(pro.data) ? pro.data : []);
    }).catch(() => setError('Impossible de charger les stories.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    if (form.title.trim().length < 3 || !form.media_url) { setError('Titre et média obligatoires.'); return; }
    setBusy('save');
    const payload = {
      title: form.title, category: form.category, media_type: form.media_type, media_url: form.media_url,
      description: form.description, cta: form.cta, priority: Number(form.priority) || 0, status: form.status,
      arrival_id: form.arrival_id || null, promotion_id: form.promotion_id || null, product_id: form.product_id || null,
      publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : new Date().toISOString(),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    try {
      if (form.id) await adminApi(`/stories/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await adminApi('/stories', { method: 'POST', body: JSON.stringify(payload) });
      setForm(null);
      load();
    } catch (e: any) { setError(e?.message || 'Enregistrement impossible.'); }
    finally { setBusy(''); }
  };

  const uploadMedia = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.readAsDataURL(file);
      });
      const result = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      setForm((f: any) => ({ ...f, media_url: result.data?.url || f.media_url }));
    } catch (e: any) { setError(e?.message || 'Upload impossible.'); }
    finally { setUploading(false); }
  };

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try { await adminApi(`/stories/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { setError(e?.message || 'Action impossible.'); }
    finally { setBusy(''); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Archiver définitivement cette story ?')) return;
    setBusy(id);
    try { await adminApi(`/stories/${id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e?.message || 'Suppression impossible.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Stories Studio</span>
          <h2>Stories : contrôle total</h2>
          <p>Créez, éditez, publiez et mesurez les stories du tab social — canaux, médias, CTA et statistiques persistantes.</p>
        </div>
        <div className="admin-actions" style={{ marginTop: 0 }}>
          <Button onClick={() => { setError(''); setForm({ ...emptyForm, publish_at: toLocal(new Date().toISOString()) }); }}><Plus size={15} />Nouvelle story</Button>
        </div>
      </header>
      {error && <div className="admin-error">{error}</div>}

      <section className="admin-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="admin-table" style={{ minWidth: 860 }}>
            <thead><tr>
              <th>Story</th><th>Canal</th><th>Statut</th>
              <th><Eye size={14} /> Vues</th><th><Heart size={14} /> Likes</th>
              <th><MessageSquare size={14} /> Comm.</th><th><Share2 size={14} /> Part.</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((row) => {
                const st = stats[row.id] || { views: 0, likes: 0, comments: 0, shares: 0 };
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {row.media_url && <img src={row.media_url} alt="" className="h-9 w-9 rounded-lg object-cover" />}
                        <div><strong>{row.title}</strong><span className="admin-block-small">{new Date(row.publish_at).toLocaleDateString('fr-FR')}</span></div>
                      </div>
                    </td>
                    <td>{(CHANNELS.find(([key]) => key === row.category) || [row.category, row.category])[1]}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{st.views}</td><td>{st.likes}</td><td>{st.comments}</td><td>{st.shares}</td>
                    <td>
                      <div className="admin-actions" style={{ marginTop: 0 }}>
                        <Button variant="ghost" onClick={() => { setError(''); setForm({ ...emptyForm, ...row, publish_at: toLocal(row.publish_at), expires_at: toLocal(row.expires_at || '') }); }}><Pencil size={14} /></Button>
                        {row.status !== 'PUBLISHED'
                          ? <Button busy={busy === row.id} onClick={() => void setStatus(row.id, 'PUBLISHED')}>Publier</Button>
                          : <Button variant="ghost" busy={busy === row.id} onClick={() => void setStatus(row.id, 'EXPIRED')}><Box size={14} /></Button>}
                        <Button variant="danger" busy={busy === row.id} onClick={() => void remove(row.id)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8} className="admin-block-small">Aucune story — créez la première avec « Nouvelle story ».</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={Boolean(form)} title={form?.id ? 'Éditer la story' : 'Nouvelle story'} onClose={() => setForm(null)} wide
        footer={<>
          <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
          <Button busy={busy === 'save'} onClick={() => void save()}>Enregistrer</Button>
        </>}>
        {form && (
          <div className="admin-grid-2">
            <Field label="Titre" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Canal (publisher)">
              <select value={KNOWN_CATEGORIES.includes(form.category) || form.category === '__custom' ? form.category : '__custom'} onChange={(e) => {
                if (e.target.value === '__custom') setForm({ ...form, category: '' });
                else setForm({ ...form, category: e.target.value });
              }}>
                {CHANNELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                <option value="__custom">+ Canal personnalisé…</option>
              </select>
            </Field>
            {!KNOWN_CATEGORIES.includes(form.category) && (
              <Field label="Nom du nouveau canal" full><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex : Sneakers, Beauty, Tech…" /></Field>
            )}
            <Field label="Type de média">
              <select value={form.media_type} onChange={(e) => setForm({ ...form, media_type: e.target.value })}>
                <option value="IMAGE">Image</option><option value="VIDEO">Vidéo</option>
              </select>
            </Field>
            <Field label="Média (upload ou URL)">
              <div className="admin-actions" style={{ marginTop: 0 }}>
                <input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="/media/… ou https://…" style={{ flex: 1 }} />
                <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #d5d2e4', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, background: '#fff' }}>
                  <ArrowUp size={14} />{uploading ? '…' : 'Uploader'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMedia(f); }} />
                </label>
              </div>
            </Field>
            <Field label="Caption" full><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="CTA (label, optionnel)"><input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="Découvrir / Voir le produit" /></Field>
            <Field label="Priorité"><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
            <Field label="Lien arrivage (optionnel)">
              <select value={form.arrival_id || ''} onChange={(e) => setForm({ ...form, arrival_id: e.target.value })}>
                <option value="">—</option>
                {arrivals.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Lien promotion (optionnel)">
              <select value={form.promotion_id || ''} onChange={(e) => setForm({ ...form, promotion_id: e.target.value })}>
                <option value="">—</option>
                {promotions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Publication"><input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} /></Field>
            <Field label="Expiration (optionnel)"><input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></Field>
            <Field label="Statut">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};
