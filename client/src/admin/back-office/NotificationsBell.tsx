/**
 * P2.0 — la cloche de notification, déplacée depuis `AdminApp.tsx` (aucune réécriture).
 *
 * Elle lit l'API existante `/api/admin/notifications` (`admin_notifications`) : c'est le point
 * d'entrée unique de la coquille. Brancher cette lecture sur l'outbox ERP
 * (`erp_notification_deliveries`) est une décision de phase ultérieure, pas un changement
 * d'UI — le composant reste le seul à afficher des notifications dans /admin.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from '../../components/QatafoIcons';
import { adminApi } from '../api';
import { formatDate } from './resource-ui';

export const NotificationsBell: React.FC<{ onNavigate: (section: string, request?: string) => void }> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const result = await adminApi<any>('/notifications?limit=20');
      setRows(result.data || []);
      setUnread(Number(result.unread) || 0);
    } catch { /* silencieux : la cloche ne doit jamais bloquer l'écran */ }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  const markAll = async () => { try { await adminApi('/notifications/read-all', { method: 'POST' }); await load(); } catch { /* */ } };
  const openItem = async (item: any) => {
    try { const result = await adminApi<any>(`/notifications/${item.id}/read`, { method: 'POST' }); setUnread(Number(result.unread) || 0); } catch { /* */ }
    setOpen(false);
    const action = String(item.action_url || '');
    if (action.includes('section=lens-requests')) { const target = new URL(action, location.origin); onNavigate('lens-requests', target.searchParams.get('request') || undefined); }
    else if (action.includes('section=assistant-support')) { const target = new URL(action, location.origin); onNavigate('assistant-support', target.searchParams.get('ticket') || undefined); }
    else if (action.includes('tab=orders')) onNavigate('orders');
  };
  return <div className="admin-bell">
    <button className="admin-icon-button" onClick={() => { setOpen(!open); if (!open) void load(); }} aria-label="Notifications"><Bell />{unread > 0 && <b className="admin-bell-badge">{unread > 99 ? '99+' : unread}</b>}</button>
    {open && <div className="admin-bell-panel">
      <header><strong>Notifications</strong>{unread > 0 && <button onClick={markAll}>Tout marquer lu</button>}</header>
      <div className="admin-bell-list">
        {rows.length === 0 && <p className="admin-bell-empty">Aucune notification.</p>}
        {rows.map((item) => <button key={item.id} className={item.read_at ? '' : 'is-unread'} onClick={() => openItem(item)}><strong>{item.title}</strong><span>{item.message}</span><time>{formatDate(item.created_at, true)}</time></button>)}
      </div>
    </div>}
  </div>;
};
