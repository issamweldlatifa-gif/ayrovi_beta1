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
  secondary_images: [] as string[],
};

const safeJson = (raw: any): string[] => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const toLocal = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const PublisherRow: React.FC<{ pub: any; onChanged: () => void }> = ({ pub, onChanged }) => {
  const [name, setName] = useState(pub.name);
  const [busy, setBusy] = useState(false);
  const saveRow = async (avatar?: string) => {
    setBusy(true);
    try {
      await adminApi(`/story-publishers/${pub.id}`, { method: 'PUT', body: JSON.stringify({ name, avatar: avatar ?? pub.avatar }) });
      onChanged();
    } finally { setBusy(false); }
  };
  const uploadAvatar = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
    const result = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
    if (result.data?.url) await saveRow(result.data.url);
  };
  return (
    <div style={{ border: '1px solid #e2e0ee', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center', background: '#fff' }}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-brand to-brand-light text-white">
        {pub.avatar ? <img src={pub.avatar} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="text-sm font-black">{pub.name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <div style={{ flex: 1 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={Boolean(pub.official)} style={{ width: '100%', fontWeight: 700 }} />
        <div className="admin-block-small">{pub.slug}{pub.official ? ' · officiel' : ''}</div>
      </div>
      <label style={{ cursor: 'pointer', border: '1px solid #d5d2e4', borderRadius: 10, padding: '7px 10px', fontSize: 11, fontWeight: 700 }}>
        {busy ? '…' : 'Couverture'}
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
      </label>
      {!pub.official && <Button variant="danger" busy={busy} onClick={async () => { if (window.confirm('Supprimer ce canal ?')) { await adminApi(`/story-publishers/${pub.id}`, { method: 'DELETE' }); onChanged(); } }}><Trash2 size={14} /></Button>}
    </div>
  );
};

const NewPublisherRow: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [name, setName] = useState('');
  const create = async () => {
    if (name.trim().length < 2) return;
    await adminApi('/story-publishers', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    setName('');
    onChanged();
  };
  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau canal (Sneakers, Beauty, Tech…)" style={{ flex: 1 }} />
      <Button onClick={() => void create()}>Créer le canal</Button>
    </>
  );
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
  const [publishers, setPublishers] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      adminApi<any>('/stories?pageSize=100'),
      adminApi<any>('/stories-stats').catch(() => ({ data: {} })),
      adminApi<any>('/arrivals?pageSize=50').catch(() => ({ data: [] })),
      adminApi<any>('/promotions?pageSize=50').catch(() => ({ data: [] })),
      adminApi<any>('/story-publishers').catch(() => ({ data: [] })),
    ]).then(([list, stat, arr, pro, pubs]) => {
      setRows(Array.isArray(list.data) ? list.data : []);
      setStats(stat.data || {});
      setArrivals(Array.isArray(arr.data) ? arr.data : []);
      setPromotions(Array.isArray(pro.data) ? pro.data : []);
      setPublishers(Array.isArray(pubs.data) ? pubs.data : []);
    }).catch(() => setError('Impossible de charger les stories.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    if (form.title.trim().length < 3 || !form.media_url) { setError('Titre et média obligatoires.'); return; }
    setBusy('save');
    if (form.category && !publishers.some((pub) => pub.slug === form.category.toUpperCase())) {
      try { await adminApi('/story-publishers', { method: 'POST', body: JSON.stringify({ name: form.category }) }); } catch { /* existe déjà */ }
    }
    const payload = {
      title: form.title, category: form.category, media_type: form.media_type, media_url: form.media_url,
      description: form.description, cta: form.cta, priority: Number(form.priority) || 0, status: form.status,
      secondary_images: form.secondary_images || [],
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

  const uploadMany = async (files: FileList) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 10)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Lecture impossible'));
          reader.readAsDataURL(file);
        });
        const result = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
        if (result.data?.url) urls.push(result.data.url);
      }
      setForm((f: any) => ({ ...f, secondary_images: [...(f.secondary_images || []), ...urls] }));
    } catch (e: any) { setError(e?.message || 'Upload impossible.'); }
    finally { setUploading(false); }
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
                        <Button variant="ghost" onClick={() => { setError(''); setForm({ ...emptyForm, ...row, secondary_images: safeJson(row.secondary_images), publish_at: toLocal(row.publish_at), expires_at: toLocal(row.expires_at || '') }); }}><Pencil size={14} /></Button>
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

      <section className="admin-card" style={{ marginTop: 14 }}>
        <h3>Canaux & couvertures des cercles (Highlights)</h3>
        <p className="admin-block-small">L'image choisie ici est celle affichée dans la circle du tab Stories — comme les Highlights Instagram.</p>
        <div className="admin-grid-2" style={{ marginTop: 10 }}>
          {publishers.map((pub) => (
            <PublisherRow key={pub.id} pub={pub} onChanged={load} />
          ))}
        </div>
        <div className="admin-actions"><NewPublisherRow onChanged={load} /></div>
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
              <select value={publishers.some((pub) => pub.slug === form.category) || form.category === '__custom' ? form.category : '__custom'} onChange={(e) => {
                if (e.target.value === '__custom') setForm({ ...form, category: '' });
                else setForm({ ...form, category: e.target.value });
              }}>
                {publishers.map((pub) => <option key={pub.id} value={pub.slug}>{pub.name}{pub.official ? ' ✓' : ''}</option>)}
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
            <Field label="Images supplémentaires (carousel, comme Instagram)" full>
              <div className="admin-actions" style={{ marginTop: 0 }}>
                <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #d5d2e4', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, background: '#fff' }}>
                  <ArrowUp size={14} />{uploading ? '…' : 'Ajouter des images'}
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { if (e.target.files?.length) void uploadMany(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              {form.secondary_images?.length > 0 && (
                <div className="no-scrollbar flex gap-2 overflow-x-auto" style={{ marginTop: 8 }}>
                  {form.secondary_images.map((url: string, i: number) => (
                    <span key={i} style={{ position: 'relative' }}>
                      <img src={url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
                      <button type="button" aria-label="Retirer" onClick={() => setForm({ ...form, secondary_images: form.secondary_images.filter((_: any, j: number) => j !== i) })} style={{ position: 'absolute', top: -6, right: -6, background: '#b91c1c', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
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
