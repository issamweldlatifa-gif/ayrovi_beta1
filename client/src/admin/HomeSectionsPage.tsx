import React, { useCallback, useEffect, useState } from 'react';
import { Button, Toast } from './components';
import { adminApi } from './api';
import { ArrowDown, ArrowUp, RefreshCw } from '../components/QatafoIcons';

/**
 * SECTIONS D’ACCUEIL — ترتيب وإظهار كتل الصفحة الرئيسية.
 * الـ Dashboard يتحكم في الترتيب والإظهار، والواجهة تعرض فقط.
 */

interface BlockRow { id: string; sortOrder: number; visible: boolean; }

const BLOCK_LABELS: Record<string, { title: string; hint: string }> = {
  transition: { title: 'Carte de transition', hint: 'Carte orange « Découvrez AYROVI » sous le Trust Bar.' },
  discovery: { title: 'Discovery Hub', hint: 'Onglets Arrivages / Promotions / Communauté / Magazine.' },
  brands: { title: 'Marques', hint: 'Titre éditorial + slider de marques en pleine largeur.' },
  lens: { title: 'LENS', hint: 'Section LENS (contenu géré dans Contenu → LENS).' },
};

const DEFAULT_ORDER: BlockRow[] = [
  { id: 'transition', sortOrder: 0, visible: true },
  { id: 'discovery', sortOrder: 1, visible: true },
  { id: 'brands', sortOrder: 2, visible: true },
  { id: 'lens', sortOrder: 3, visible: true },
];

export const HomeSectionsPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [rows, setRows] = useState<BlockRow[]>(DEFAULT_ORDER);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(null), 3800); return () => window.clearTimeout(timer); } }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<any>('/home-blocks');
      if (Array.isArray(result.data) && result.data.length) {
        const known = result.data.filter((row: BlockRow) => BLOCK_LABELS[row.id]);
        const missing = DEFAULT_ORDER.filter((fallback) => !known.some((row: BlockRow) => row.id === fallback.id));
        setRows([...known, ...missing]);
      }
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await adminApi<any>('/home-blocks', { method: 'PUT', body: JSON.stringify({ blocks: rows.map((row, index) => ({ id: row.id, visible: row.visible, sortOrder: index })) }) });
      if (Array.isArray(result.data) && result.data.length) setRows(result.data.filter((row: BlockRow) => BLOCK_LABELS[row.id]));
      setToast({ message: 'Ordre des sections enregistré.', tone: 'success' });
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Sections</span>
          <h2>Sections de la page d’accueil</h2>
          <p>Ordre et visibilité des blocs affichés sous le Hero. Le contenu de chaque bloc se gère dans sa propre page (LENS, Marques, Hero).</p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />Recharger</Button>
          <Button onClick={() => void save()} busy={busy} disabled={!canWrite || loading}>Enregistrer l’ordre</Button>
        </div>
      </header>

      <section className="admin-card">
        {loading ? <p className="admin-block-small">Chargement…</p> : (
          <ul className="admin-list">
            {rows.map((row, index) => (
              <li key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{index + 1}. {BLOCK_LABELS[row.id]?.title || row.id}</strong>
                  <p className="admin-block-small" style={{ margin: '2px 0 0' }}>{BLOCK_LABELS[row.id]?.hint}</p>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" disabled={!canWrite} className={`admin-switch ${row.visible ? 'is-on' : ''}`} onClick={() => setRows((current) => current.map((item, at) => (at === index ? { ...item, visible: !item.visible } : item)))}>
                    <i /><span>{row.visible ? 'Visible' : 'Masquée'}</span>
                  </button>
                  <Button variant="ghost" disabled={!canWrite || index === 0} onClick={() => move(index, -1)} aria-label="Monter"><ArrowUp size={15} /></Button>
                  <Button variant="ghost" disabled={!canWrite || index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Descendre"><ArrowDown size={15} /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
};
