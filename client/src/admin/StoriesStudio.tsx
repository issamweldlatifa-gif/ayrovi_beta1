import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Heart, MessageSquare, Share2, Pencil } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, StatusBadge } from './components';

const CHANNEL_LABELS: Record<string, string> = {
  ARRIVAGE: 'Ayrovi Official', NEW: 'Nouveautés', STYLE: 'Style', INFO: 'Actus', PROMO: 'Promos',
};

/** Onglet Stories (cahier des charges §1) : CRUD existant + statistiques persistantes. */
export const StoriesStudioPage: React.FC<{ onEditContent: () => void }> = ({ onEditContent }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([
      adminApi<any>('/stories?pageSize=50'),
      adminApi<any>('/stories-stats').catch(() => ({ data: {} })),
    ]).then(([list, stat]) => {
      setRows(Array.isArray(list.data) ? list.data : []);
      setStats(stat.data || {});
    }).catch(() => setError('Impossible de charger les stories.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      await adminApi(`/stories/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      load();
    } catch (e: any) { setError(e?.message || 'Action impossible.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Stories Studio</span>
          <h2>Stories & interactions</h2>
          <p>Statistiques persistantes (vues, likes, commentaires, partages) et gestion des canaux.</p>
        </div>
        <Button variant="secondary" onClick={onEditContent}><Pencil size={15} />Éditer le contenu</Button>
      </header>
      {error && <div className="admin-error">{error}</div>}
      <section className="admin-card">
        <table className="admin-table">
          <thead><tr>
            <th>Story</th><th>Canal</th><th>Statut</th>
            <th><Eye size={14} /> Vues</th><th><Heart size={14} /> Likes</th>
            <th><MessageSquare size={14} /> Comm.</th><th><Share2 size={14} /> Partages</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((row) => {
              const st = stats[row.id] || { views: 0, likes: 0, comments: 0, shares: 0 };
              return (
                <tr key={row.id}>
                  <td><strong>{row.title}</strong><span className="admin-block-small">{new Date(row.publish_at).toLocaleDateString('fr-FR')}</span></td>
                  <td>{CHANNEL_LABELS[row.category] || row.category}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{st.views}</td><td>{st.likes}</td><td>{st.comments}</td><td>{st.shares}</td>
                  <td className="admin-actions" style={{ marginTop: 0 }}>
                    {row.status !== 'PUBLISHED'
                      ? <Button busy={busy === row.id} onClick={() => void setStatus(row.id, 'PUBLISHED')}>Publier</Button>
                      : <Button variant="ghost" busy={busy === row.id} onClick={() => void setStatus(row.id, 'EXPIRED')}>Archiver</Button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="admin-block-small">Aucune story. Créez-en depuis « Éditer le contenu ».</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
};
